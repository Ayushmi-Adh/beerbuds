import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def upgrade_database():
    print("Connecting to database...")
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    
    # Add the is_scanned column, defaulting to False for all seeded beers
    try:
        cur.execute("ALTER TABLE beers ADD COLUMN is_scanned BOOLEAN DEFAULT FALSE;")
        conn.commit()
        print("✅ Successfully added 'is_scanned' to the database!")
    except psycopg2.errors.DuplicateColumn:
        print("Column already exists. You're good to go!")
        conn.rollback()
        
    cur.close()
    conn.close()

if __name__ == "__main__":
    upgrade_database()