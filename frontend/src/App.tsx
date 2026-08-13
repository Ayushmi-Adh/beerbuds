import { useEffect, useState } from 'react'
import './App.css'

interface Beer {
  id: number;
  name: string;
  description: string;
  flavors: string;
}

function App() {
  const [beers, setBeers] = useState<Beer[]>([]);
  // NEW: State to track what the user types in the search box
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('https://beerbuds-backend.onrender.com/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  }, []);

  // NEW: Filter the beers based on the search query (checking names and flavors)
  const filteredBeers = beers.filter(beer => 
    beer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    beer.flavors.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🍻 BeerBuds</h1>
      <p>Your AI-Powered Beer Sommelier</p>
      
      {/* NEW: The Search Bar UI */}
      <input 
        type="text" 
        placeholder="Search for a flavor (e.g., roasted, citrus, light)..." 
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '10px 15px',
          fontSize: '1rem',
          borderRadius: '8px',
          border: '1px solid #ccc',
          marginBottom: '2rem'
        }}
      />
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* We map over filteredBeers instead of all beers now! */}
        {filteredBeers.map(beer => (
          <div key={beer.id} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '1.5rem', 
            maxWidth: '350px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginTop: 0, color: '#d97706' }}>{beer.name}</h2>
            <p style={{ color: '#555', lineHeight: '1.5' }}>{beer.description}</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {beer.flavors.split(',').map((flavor, index) => (
                <span key={index} style={{ 
                  backgroundColor: '#fef3c7', 
                  color: '#92400e', 
                  padding: '4px 8px', 
                  borderRadius: '999px', 
                  fontSize: '0.85rem',
                  fontWeight: 'bold'
                }}>
                  {flavor.trim()}
                </span>
              ))}
            </div>
          </div>
        ))}
        
        {/* Show a friendly message if the search finds nothing */}
        {filteredBeers.length === 0 && (
          <p style={{ color: '#888', fontStyle: 'italic' }}>
            No beers found matching "{searchQuery}". Try another flavor!
          </p>
        )}
      </div>
    </div>
  )
}

export default App