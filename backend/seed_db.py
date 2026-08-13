import os
import psycopg2
from dotenv import load_dotenv

from scraper import scrape_beer_info
from ai_agent import extract_flavors

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# A list of different beer styles on Wikipedia to build a real menu!
BEER_URLS = [
    {"name": "India Pale Ale", "url": "https://en.wikipedia.org/wiki/India_pale_ale"},
    {"name": "Stout", "url": "https://en.wikipedia.org/wiki/Stout"},
    {"name": "Pilsner", "url": "https://en.wikipedia.org/wiki/Pilsner"},
    {"name": "Wheat Beer", "url": "https://en.wikipedia.org/wiki/Wheat_beer"},
    {"name": "Porter", "url": "https://en.wikipedia.org/wiki/Porter_(beer)"}
]

def setup_database():
    print("🔌 Connecting to Neon Database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("🏗️ Ensuring the 'beers' table exists...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS beers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            description TEXT,
            flavors TEXT
        );
    """)
    conn.commit()
    return conn, cur

if __name__ == "__main__":
    print("🚀 Starting the Bulk AI -> Database Pipeline!\n")
    
    conn, cur = setup_database()
    
    for item in BEER_URLS:
        beer_name = item["name"]
        url = item["url"]
        
        print(f"-----------------------------------------")
        print(f"🍺 Processing: {beer_name}")
        
        raw_text = scrape_beer_info(url)
        
        if "Failed" not in raw_text:
            flavors = extract_flavors(raw_text)
            
            # Check if this beer is already in the database to avoid exact duplicates
            cur.execute("SELECT id FROM beers WHERE name = %s;", (beer_name,))
            existing = cur.fetchone()
            
            if not existing:
                cur.execute(
                    "INSERT INTO beers (name, description, flavors) VALUES (%s, %s, %s)",
                    (beer_name, raw_text[:150] + "...", flavors)
                )
                conn.commit()
                print(f"✅ Saved {beer_name} successfully!")
            else:
                print(f"⚠️ {beer_name} is already in the database, skipping insert.")
        else:
            print(f"❌ Skipping {beer_name} due to scraping failure.")
            
    cur.close()
    conn.close()
    print("\n🎉 Bulk seeding complete! Your menu is fully stocked.")