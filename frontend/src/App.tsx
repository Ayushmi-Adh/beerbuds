import { useState } from 'react'

function App() {
  const [backendMessage, setBackendMessage] = useState<string>('')

  const fetchFromBackend = async () => {
    try {
      // This is where React knocks on FastAPI's door!
      const response = await fetch('http://127.0.0.1:8000/')
      const data = await response.json()
      
      // We convert the JSON object to a string so we can read it easily
      setBackendMessage(JSON.stringify(data))
    } catch (error) {
      // FIX: We tell the console to log the error so ESLint knows we used the variable
      console.error(error)
      setBackendMessage("Error: Could not connect to backend. Is Uvicorn running?")
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Beerbuds (FlavorGraph) 🍻</h1>
      <p>Frontend is successfully running!</p>
      
      <button 
        onClick={fetchFromBackend}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Test Backend Connection
      </button>

      {backendMessage && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
          <strong>Response from Python:</strong>
          <p>{backendMessage}</p>
        </div>
      )}
    </div>
  )
}

export default App