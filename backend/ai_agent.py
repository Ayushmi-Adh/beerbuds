import os
from dotenv import load_dotenv
from google import genai

from scraper import scrape_beer_info

# 1. Open the vault
load_dotenv()

# 2. Initialize the modern Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def extract_flavors(beer_text):
    print("🧠 Asking Gemini to analyze the text...")
    
    prompt = f"""
    You are an expert beer sommelier. Read the following text about a beer.
    Extract exactly 5 flavor, aroma, or characteristic keywords that describe it.
    Return ONLY a comma-separated list of the 5 keywords, all lowercase.
    Example: pine, citrus, bitter, caramel, floral
    
    Beer Text:
    {beer_text}
    """
    
    # 3. Use your cutting-edge 3.5-flash model!
    response = client.models.generate_content(
        model='gemini-flash-latest',
        contents=prompt,
    )
    return response.text.strip()

if __name__ == "__main__":
    test_url = "https://en.wikipedia.org/wiki/India_pale_ale"
    
    raw_text = scrape_beer_info(test_url)
    
    if "Failed" not in raw_text:
        flavors = extract_flavors(raw_text)
        
        print("\n✨ --- AI Extracted Flavors --- ✨\n")
        print(flavors)
    else:
        print("Scraping failed, cannot run AI.")