import os
import json
import time
import psycopg2
from google import genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL")

REAL_BEERS = [
    {"name": "Barasinghe Pilsner Bier", "style": "Pilsner / Lager", "origin": "Nepal"},
    {"name": "Barasinghe Pale Ale", "style": "Pale Ale", "origin": "Nepal"},
    {"name": "Barasinghe Hazy IPA", "style": "Hazy IPA", "origin": "Nepal"},
    {"name": "Barasinghe Yakoberfest", "style": "Marzen / Festbier", "origin": "Nepal"},
    {"name": "Khumbu Kölsch", "style": "Kölsch", "origin": "Nepal"},
    {"name": "Himalayan Red Ale", "style": "Red Ale", "origin": "Nepal"},
    {"name": "Nepal IPA", "style": "India Pale Ale", "origin": "Nepal"},
    {"name": "Sherpa Stout", "style": "Dry Stout", "origin": "Nepal"},
    {"name": "Guinness Draught", "style": "Dry Stout", "origin": "Ireland"},
    {"name": "Corona Extra", "style": "Pale Lager", "origin": "Mexico"}
]

def seed_database():
    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    for item in REAL_BEERS:
        name = item["name"]
        style = item["style"]
        origin = item["origin"]
        
        # Check if the beer already exists to avoid duplicates
        cur.execute("SELECT id FROM beers WHERE name = %s;", (name,))
        if cur.fetchone():
            print(f"Skipping '{name}', already in database.")
            continue
            
        print(f"Synthesizing profile for: {name}...")
        
        prompt = f"""
        Provide a sophisticated, upscale tasting profile for the commercial beer: '{name}' (Style: {style}, Origin: {origin}).
        Return a JSON object with two fields:
        1. "description": A short, elegant 2-sentence tasting description suitable for a wine-cellar application.
        2. "flavors": Exactly 3 comma-separated flavor tags (e.g. "malty, citrus, crisp" or "roasted, coffee, smooth").
        Output ONLY valid JSON.
        """
        
        try:
            response = client.models.generate_content(
                model='gemini-3.5-flash',
                contents=prompt,
            )
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            data = json.loads(raw_text)
            
            # --- EXECUTE RAW SQL INSERT ---
            cur.execute(
                "INSERT INTO beers (name, description, flavors) VALUES (%s, %s, %s);",
                (name, data["description"], data["flavors"])
            )
            conn.commit()  # Save the transaction
            
            print(f"-> Successfully saved to DB: {name} | Flavors: {data['flavors']}")
            
            # Pause to respect the API limit (5 requests / min)
            time.sleep(15) 
            
        except Exception as e:
            print(f"Error parsing {name}: {e}")
            conn.rollback()  # Rollback on error so the DB doesn't freeze
            if "429" in str(e):
                print("Hit rate limit. Pausing for 60 seconds...")
                time.sleep(60)
                
    cur.close()
    conn.close()
    print("Database seeding complete!")

if __name__ == "__main__":
    seed_database()