"""
Beerbuds API - AI-Powered Beer Flavor Discovery and Recommendation Engine.
"""

from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Beerbuds API",
    description="AI-powered beer flavor discovery and recommendation engine",
    version="0.1.0",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Schemas ---

class Beer(BaseModel):
    id: str
    name: str
    brewery: str
    style: str
    abv: float = Field(..., description="Alcohol by volume percentage")
    ibu: Optional[int] = Field(None, description="International Bitterness Units")
    flavor_notes: List[str] = Field(default_factory=list, description="Primary flavor notes")
    description: str
    rating: float = Field(..., ge=0.0, le=5.0, description="User rating out of 5")


class RecommendationRequest(BaseModel):
    target_flavors: List[str] = Field(
        ...,
        example=["citrus", "pine", "grapefruit"],
        description="List of desired flavor profiles"
    )
    preferred_styles: Optional[List[str]] = Field(
        None,
        example=["IPA", "Stout"],
        description="Optional list of beer styles to filter by"
    )
    min_abv: Optional[float] = Field(None, ge=0.0, le=20.0)
    max_abv: Optional[float] = Field(None, ge=0.0, le=20.0)
    top_k: int = Field(5, ge=1, le=20, description="Number of recommendations to return")


class BeerRecommendation(BaseModel):
    beer: Beer
    match_score: float = Field(..., description="Relevance score (0.0 to 1.0)")
    matched_flavors: List[str] = Field(..., description="Flavors that matched request")


class RecommendationResponse(BaseModel):
    recommendations: List[BeerRecommendation]
    total_matches: int


# --- Sample In-Memory Database ---

SAMPLE_BEERS: List[Beer] = [
    Beer(
        id="beer_1",
        name="Citrus Haze India Pale Ale",
        brewery="Cloudburst Brewing",
        style="New England IPA",
        abv=6.8,
        ibu=45,
        flavor_notes=["citrus", "grapefruit", "tropical", "mango", "hoppy"],
        description="A juicy, hazy IPA bursting with fresh grapefruit, passionfruit, and bright pine aromas.",
        rating=4.7,
    ),
    Beer(
        id="beer_2",
        name="Velvet Night Imperial Stout",
        brewery="Midnight Crafters",
        style="Imperial Stout",
        abv=9.5,
        ibu=65,
        flavor_notes=["chocolate", "coffee", "roasted", "vanilla", "caramel"],
        description="Rich and complex dark stout aged with dark cocoa nibs and espresso beans.",
        rating=4.8,
    ),
    Beer(
        id="beer_3",
        name="Sunburst Belgian Witbier",
        brewery="Artisan Ales Co.",
        style="Witbier",
        abv=5.2,
        ibu=15,
        flavor_notes=["citrus", "orange peel", "coriander", "wheat", "spicy"],
        description="Crisp and refreshing wheat ale brewed with Valencia orange peel and crushed coriander.",
        rating=4.3,
    ),
    Beer(
        id="beer_4",
        name="Pine Needle West Coast IPA",
        brewery="Timberline Brewery",
        style="West Coast IPA",
        abv=7.2,
        ibu=70,
        flavor_notes=["pine", "resin", "citrus", "bitter", "hoppy"],
        description="Classic dank and resinous West Coast IPA featuring heavy Chinook and Simcoe dry-hopping.",
        rating=4.5,
    ),
    Beer(
        id="beer_5",
        name="Wild Raspberry Sour",
        brewery="Fermentum Lab",
        style="Sour Ale",
        abv=4.8,
        ibu=8,
        flavor_notes=["sour", "tart", "raspberry", "fruity", "crisp"],
        description="Tart and refreshing kettle sour loaded with whole red raspberries.",
        rating=4.6,
    ),
    Beer(
        id="beer_6",
        name="Golden Harvest Pilsner",
        brewery="Old Town Lagerhouse",
        style="German Pilsner",
        abv=4.9,
        ibu=32,
        flavor_notes=["crisp", "bready", "herbal", "floral", "clean"],
        description="Clean, crisp German-style pilsner with noble hop floral aromas and a snappy finish.",
        rating=4.2,
    ),
]

FLAVOR_CATEGORIES = {
    "Hoppy & Citrus": ["citrus", "grapefruit", "pine", "resin", "tropical", "mango", "hoppy"],
    "Malty & Roasty": ["chocolate", "coffee", "roasted", "vanilla", "caramel", "bready", "wheat"],
    "Fruity & Sour": ["sour", "tart", "raspberry", "fruity", "orange peel"],
    "Herbal & Spicy": ["coriander", "spicy", "herbal", "floral", "crisp", "clean"]
}


# --- Endpoints ---

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Beerbuds API!",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "beerbuds-backend"}


@app.get("/api/beers", response_model=List[Beer])
def list_beers(
    style: Optional[str] = Query(None, description="Filter by beer style"),
    q: Optional[str] = Query(None, description="Search term in name or description"),
    min_abv: Optional[float] = Query(None, ge=0.0),
    max_abv: Optional[float] = Query(None, ge=0.0),
):
    beers = SAMPLE_BEERS
    if style:
        beers = [b for b in beers if style.lower() in b.style.lower()]
    if q:
        query_str = q.lower()
        beers = [
            b for b in beers 
            if query_str in b.name.lower() or query_str in b.description.lower() or any(query_str in note for note in b.flavor_notes)
        ]
    if min_abv is not None:
        beers = [b for b in beers if b.abv >= min_abv]
    if max_abv is not None:
        beers = [b for b in beers if b.abv <= max_abv]
    
    return beers


@app.get("/api/beers/{beer_id}", response_model=Beer)
def get_beer(beer_id: str):
    for b in SAMPLE_BEERS:
        if b.id == beer_id:
            return b
    raise HTTPException(status_code=404, detail="Beer not found")


@app.get("/api/flavors")
def get_flavors():
    return {"categories": FLAVOR_CATEGORIES}


@app.post("/api/recommend", response_model=RecommendationResponse)
def recommend_beers(request: RecommendationRequest):
    target_notes = [f.strip().lower() for f in request.target_flavors if f.strip()]
    if not target_notes:
        raise HTTPException(status_code=400, detail="Must provide at least one target flavor note.")

    candidates = SAMPLE_BEERS

    # Apply hard filters if requested
    if request.preferred_styles:
        styles_lower = [s.lower() for s in request.preferred_styles]
        candidates = [c for c in candidates if any(s in c.style.lower() for s in styles_lower)]
    if request.min_abv is not None:
        candidates = [c for c in candidates if c.abv >= request.min_abv]
    if request.max_abv is not None:
        candidates = [c for c in candidates if c.abv <= request.max_abv]

    recommendations: List[BeerRecommendation] = []

    for beer in candidates:
        beer_notes = set(f.lower() for f in beer.flavor_notes)
        matches = [note for note in target_notes if note in beer_notes]
        
        if matches:
            # Jaccard / overlap score simple calculation
            score = len(matches) / len(set(target_notes).union(beer_notes))
            # Normalize boost for rating
            score_with_rating = round(score * 0.7 + (beer.rating / 5.0) * 0.3, 2)
            recommendations.append(
                BeerRecommendation(
                    beer=beer,
                    match_score=score_with_rating,
                    matched_flavors=matches
                )
            )

    # Sort descending by match score
    recommendations.sort(key=lambda r: r.match_score, reverse=True)
    top_recommendations = recommendations[:request.top_k]

    return RecommendationResponse(
        recommendations=top_recommendations,
        total_matches=len(recommendations)
    )
