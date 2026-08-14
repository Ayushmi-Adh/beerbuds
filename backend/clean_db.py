import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def clean_database():
    print("Connecting to database...")
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    
    # Delete the generic beers (IDs 1 through 5)
    cur.execute("DELETE FROM beers WHERE id IN (1, 2, 3, 4, 5);")
    conn.commit()
    
    print(f"Deleted {cur.rowcount} generic beers!")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    clean_database()