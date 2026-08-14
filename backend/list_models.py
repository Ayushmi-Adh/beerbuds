import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Fetching available models...\n")

# Just print the raw name of every available model
for model in client.models.list():
    print(f"Model Name: {model.name}")