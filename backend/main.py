import os
import psycopg2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Open the vault
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

app = FastAPI()

# Allow our React frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to connect to the database
def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@app.get("/")
def read_root():
    return {"message": "Welcome to the BeerBuds API!"}

# --- NEW: Our API Endpoint for Beers ---
@app.get("/api/beers")
def get_beers():
    print("🛎️  Frontend requested the beer menu!")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Grab all the beers from our database
    cur.execute("SELECT id, name, description, flavors FROM beers;")
    db_beers = cur.fetchall()
    
    cur.close()
    conn.close()
    
    # Format the raw database rows into a clean dictionary list (JSON)
    beer_list = []
    for beer in db_beers:
        beer_list.append({
            "id": beer[0],
            "name": beer[1],
            "description": beer[2],
            "flavors": beer[3]
        })
        
    return {"beers": beer_list}