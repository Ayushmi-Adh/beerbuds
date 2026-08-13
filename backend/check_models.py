import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("🔍 Asking Google for available models...")

# Get the list of models we are allowed to use
try:
    models = client.models.list()
    print("\n✅ You have access to these models:")
    for m in models:
        # We only want to print models that support generating text
        if 'generateContent' in m.supported_actions:
            print(f" - {m.name}")
except Exception as e:
    print(f"❌ Error fetching models: {e}")