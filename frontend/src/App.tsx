import { useEffect, useState } from 'react'
import './App.css'

// 1. Tell TypeScript exactly what a "Beer" looks like from our database
interface Beer {
  id: number;
  name: string;
  description: string;
  flavors: string;
}

function App() {
  // 2. Create a state variable to hold our beers
  const [beers, setBeers] = useState<Beer[]>([]);

  // 3. When the page loads, fetch the data from our Python backend!
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🍻 BeerBuds</h1>
      <p>Your AI-Powered Beer Sommelier</p>
      
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        {beers.map(beer => (
          <div key={beer.id} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '1.5rem', 
            maxWidth: '400px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginTop: 0, color: '#d97706' }}>{beer.name}</h2>
            <p style={{ color: '#555', lineHeight: '1.5' }}>{beer.description}</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {/* Split the comma-separated string into beautiful UI tags */}
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
      </div>
    </div>
  )
}

export default App