import os
import json
import psycopg2
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@app.get("/")
def read_root():
    return {"message": "Welcome to the BeerBuds API!"}

@app.get("/api/beers")
def get_beers():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name, description, flavors FROM beers ORDER BY id DESC;")
    db_beers = cur.fetchall()
    cur.close()
    conn.close()
    
    beer_list = []
    for beer in db_beers:
        beer_list.append({
            "id": beer[0],
            "name": beer[1],
            "description": beer[2],
            "flavors": beer[3]
        })
    return {"beers": beer_list}

# --- NEW: AI VISION SCAN-TO-ADD ENDPOINT ---
@app.post("/api/scan-beer")
async def scan_beer(file: UploadFile = File(...)):
    print(f"📸 Received beer image scan: {file.filename}")
    
    try:
        # Read the uploaded image bytes
        image_bytes = await file.read()
        
        # Prepare Vision Prompt
        prompt = """
        Examine this beer bottle/can label image carefully.
        Identify:
        1. "name": The exact official commercial brand name (e.g. "Gorkha Strong", "Paulaner Weissbier").
        2. "description": A short, elegant 2-sentence tasting description suitable for a high-end wine cellar app.
        3. "flavors": Exactly 3 comma-separated flavor tags describing its taste (e.g. "malty, crisp, herbal").
        
        Output ONLY a valid JSON object with keys "name", "description", and "flavors". Do not include markdown codeblocks if possible.
        """
        
        # Send image directly to Gemini 3.5 Flash Vision
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=[
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=file.content_type or 'image/jpeg'
                ),
                prompt
            ]
        )
        
        # Clean response
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw_text)
        
        beer_name = data.get("name")
        description = data.get("description")
        flavors = data.get("flavors")
        
        if not beer_name or not flavors:
            raise HTTPException(status_code=400, detail="Could not read beer label clearly.")
            
        # Save to PostgreSQL Database
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if beer already exists
        cur.execute("SELECT id, name, description, flavors FROM beers WHERE LOWER(name) = LOWER(%s);", (beer_name,))
        existing = cur.fetchone()
        
        if existing:
            cur.close()
            conn.close()
            return {
                "message": "Beer already exists in cellar!",
                "beer": {
                    "id": existing[0],
                    "name": existing[1],
                    "description": existing[2],
                    "flavors": existing[3]
                }
            }
            
        # Insert newly scanned beer into DB
        cur.execute(
            "INSERT INTO beers (name, description, flavors) VALUES (%s, %s, %s) RETURNING id;",
            (beer_name, description, flavors)
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        
        cur.close()
        conn.close()
        
        print(f"✨ Successfully scanned & added new beer: {beer_name}")
        
        return {
            "message": "New beer added to cellar network!",
            "beer": {
                "id": new_id,
                "name": beer_name,
                "description": description,
                "flavors": flavors
            }
        }
        
    except Exception as e:
        print(f"Error scanning beer: {e}")
        raise HTTPException(status_code=500, detail=str(e))