import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# The original generic scraped list we want to keep hidden
SEEDED_BEERS = [
    "Barasinghe Pilsner Bier", "Barasinghe Pale Ale", "Barasinghe Hazy IPA",
    "Barasinghe Yakoberfest", "Khumbu Kölsch", "Himalayan Red Ale",
    "Nepal IPA", "Sherpa Stout", "Guinness Draught", "Corona Extra"
]

def restore_scans():
    print("Restoring previously scanned beers to your Passport...")
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    
    # Update all beers that are NOT in the seed list to be scanned = TRUE
    cur.execute(
        "UPDATE beers SET is_scanned = TRUE WHERE name != ALL(%s);",
        (SEEDED_BEERS,)
    )
    conn.commit()
    
    print(f"✅ Restored {cur.rowcount} previously scanned beers to your Passport!")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    restore_scans()