# BeerBuds 🍻

<div align="center">
  <img src="https://github.com/user-attachments/assets/c2b2109f-7eb8-40ce-80ee-5c5e23cd72df" alt="BeerBuds Pouring" width="400"/>
</div>

An AI-powered full-stack web application for scanning, analyzing, and mapping craft beer flavor profiles. 

BeerBuds allows users to snap a photo of any beer label and instantly adds it to a digital "Passport" and an interactive D3.js topology network. The backend utilizes the Google Gemini Vision API and strict prompt engineering to extract unstructured visual data from labels into structured JSON data.

## 🚀 Features

* **AI Vision Label Scanning:** Upload or snap a photo of a beer label. The app uses **Gemini 3.5 Flash Vision** to extract the exact commercial brand name, generate a sommelier-style description, and isolate three core flavor tags.
* **Interactive Topology Graph:** A custom-built **D3.js** force-directed physics graph clusters collected beers into flavor families (Roasted, Hoppy, Floral) on a highly interactive, animated glassmorphism stage.
* **Digital Beer Passport:** A responsive, animated logbook that tracks collected bottles, featuring dynamic liquid-fill animations, WebAudio sound design, and hover-reactive foil wax stamps.
* **Cross-Device Ready:** Configured with robust CORS policies and multipart file handling to allow mobile camera uploads directly to the cloud backend.

## 🛠 Tech Stack

**Backend (REST API):**
* Python 3
* FastAPI
* PostgreSQL (via `psycopg2`)
* Google GenAI SDK (`google-genai`)
* `python-multipart` (for image file streams)
* Deployed on **Render**

**Frontend (Client):**
* React 18 + TypeScript
* Vite
* D3.js (Force simulations & SVGs)
* Custom CSS (Fluid animations, backdrop filters, CSS physics)
* Deployed on **Vercel**

---

## 💻 Local Development Setup

### 1. Backend Setup
Navigate to the backend directory and install the Python dependencies.

```bash
cd backend
pip install -r requirements.txt
