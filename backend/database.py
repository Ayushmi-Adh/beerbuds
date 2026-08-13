import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. Load the secret variables from the .env file
load_dotenv()

# 2. Get the database connection string we just saved
DATABASE_URL = os.getenv("DATABASE_URL")

# 3. Create the engine (the actual connection cable to Neon)
engine = create_engine(DATABASE_URL)

# 4. Create a factory for database sessions (individual conversations with the database)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 5. Create a Base class (a blueprint maker for our future database tables)
Base = declarative_base()

# A quick test to verify the connection works when we run this file directly!
if __name__ == "__main__":
    try:
        with engine.connect() as connection:
            print("✅ Successfully connected to the Neon database!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")