import httpx
from bs4 import BeautifulSoup

def scrape_beer_info(url):
    print(f"🌍 Fetching data from: {url}...")
    
    # 1. Play by Wikipedia's rules: Name your bot and provide a contact email
    headers = {
        "User-Agent": "BeerBudsScraper/1.0 (mailto:ayushmi.test@example.com)"
    }
    
    # 2. Keep the permission to follow redirects
    response = httpx.get(url, headers=headers, follow_redirects=True)
    
    print(f"📡 Status Code: {response.status_code}")
    
    if response.status_code != 200:
        return f"Failed to grab the page. Status Code: {response.status_code}"
        
    soup = BeautifulSoup(response.text, "html.parser")
    paragraphs = soup.find_all("p")
    
    extracted_text = ""
    paragraphs_found = 0
    
    for p in paragraphs:
        text = p.text.strip()
        if len(text) > 50:
            extracted_text += text + "\n\n"
            paragraphs_found += 1
            
        if paragraphs_found == 3:
            break
            
    return extracted_text

if __name__ == "__main__":
    test_url = "https://en.wikipedia.org/wiki/India_pale_ale"
    result = scrape_beer_info(test_url)
    
    print("\n🍺 --- Extracted Beer Text --- 🍺\n")
    print(result)