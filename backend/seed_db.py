import os
import psycopg2
from dotenv import load_dotenv

# Import our custom tools!
from scraper import scrape_beer_info
from ai_agent import extract_flavors

# Open the vault to get our Neon Database URL
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def setup_database():
    print("🔌 Connecting to Neon Database...")
    # Connect to the database using the URL
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("🏗️ Ensuring the 'beers' table exists...")
    # SQL command to create the table if it doesn't already exist
    cur.execute("""
        CREATE TABLE IF NOT EXISTS beers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            description TEXT,
            flavors TEXT
        );
    """)
    
    # Save (commit) the changes to the database
    conn.commit()
    return conn, cur

if __name__ == "__main__":
    print("🚀 Starting the Full AI -> Database Pipeline!\n")
    
    # Step 1: Scrape
    url = "https://en.wikipedia.org/wiki/India_pale_ale"
    raw_text = scrape_beer_info(url)
    
    if "Failed" not in raw_text:
        # Step 2: Analyze
        flavors = extract_flavors(raw_text)
        
        # Step 3: Connect to DB
        conn, cur = setup_database()
        
        print("💾 Saving the IPA data permanently...")
        # We save the name, a short snippet of the description, and the AI flavors
        cur.execute(
            "INSERT INTO beers (name, description, flavors) VALUES (%s, %s, %s)",
            ("India Pale Ale", raw_text[:150] + "...", flavors)
        )
        
        # Commit and close the connection
        conn.commit()
        cur.close()
        conn.close()
        
        print("\n✅ Success! The AI flavors are now locked in your Neon Database!")
    else:
        print("❌ Pipeline failed at the scraping step.")