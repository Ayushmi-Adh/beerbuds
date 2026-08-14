import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3';
import './App.css';

interface Beer {
  id: number;
  name: string;
  description: string;
  flavors: string;
}

interface GraphNode extends Beer, SimulationNodeDatum {
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: number | string | GraphNode;
  target: number | string | GraphNode;
}

const getNodeColors = (flavors: string) => {
  const f = flavors.toLowerCase();
  if (f.includes('roasted') || f.includes('coffee') || f.includes('dark')) {
    return { main: '#52b788', shadow: '#1b4332' }; 
  }
  if (f.includes('hoppy') || f.includes('citrus') || f.includes('pine')) {
    return { main: '#e07a5f', shadow: '#822c19' }; 
  }
  return { main: '#d4af37', shadow: '#795503' }; 
};

const getFlavorVisual = (flavor: string) => {
  const f = flavor.toLowerCase();
  if (f.includes('citrus') || f.includes('lemon') || f.includes('orange')) return '🍋';
  if (f.includes('pine') || f.includes('herbal')) return '🌲';
  if (f.includes('floral') || f.includes('wildflower')) return '🌸';
  if (f.includes('biscuit') || f.includes('malt') || f.includes('wheat') || f.includes('toasted')) return '🌾';
  if (f.includes('roasted') || f.includes('coffee') || f.includes('stout')) return '☕';
  if (f.includes('tropical') || f.includes('mango') || f.includes('passion')) return '🥭';
  if (f.includes('caramel') || f.includes('sweet')) return '🍯';
  if (f.includes('spice')) return '🌶️';
  if (f.includes('crisp') || f.includes('minerality')) return '❄️';
  return '✨';
};

function App() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<Beer | null>(null);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBeers = () => {
    fetch('http://127.0.0.1:8000/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  };

  useEffect(() => {
    fetchBeers();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanMessage("Gemini Vision reading label...");

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/scan-beer', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setScanMessage(`✨ ${data.message}`);
        fetchBeers(); // Reload beers to display new node in network
        setSelectedBeer(data.beer);
        setTimeout(() => {
          setIsScanOpen(false);
          setIsScanning(false);
          setScanMessage(null);
        }, 1500);
      } else {
        setScanMessage(`❌ Error: ${data.detail || 'Failed to scan'}`);
        setIsScanning(false);
      }
    } catch (err) {
      console.error(err);
      setScanMessage("❌ Network error connecting to scanner.");
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!beers.length || !svgRef.current) return;

    const width = 700;
    const height = 550;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll('*').remove();
    const defs = svg.append('defs');

    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    beers.forEach((beer) => {
      const colors = getNodeColors(beer.flavors);
      const grad = defs.append('radialGradient')
        .attr('id', `editorial-grad-${beer.id}`)
        .attr('cx', '30%')
        .attr('cy', '30%')
        .attr('r', '70%');
      
      grad.append('stop').attr('offset', '0%').attr('stop-color', colors.main);
      grad.append('stop').attr('offset', '100%').attr('stop-color', colors.shadow);
    });

    const nodes: GraphNode[] = beers.map(beer => ({
      ...beer,
      radius: 12,
      x: width / 2 + (Math.random() - 0.5) * 150,
      y: height / 2 + (Math.random() - 0.5) * 150
    }));

    const links: GraphLink[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const flavorsA = nodes[i].flavors.toLowerCase().split(',').map(f => f.trim());
        const flavorsB = nodes[j].flavors.toLowerCase().split(',').map(f => f.trim());
        
        const shared = flavorsA.some(f => flavorsB.includes(f));
        if (shared) {
          links.push({ source: nodes[i].id, target: nodes[j].id });
        }
      }
    }

    const g = svg.append('g');

    const linkElements = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'rgba(212, 175, 55, 0.15)')
      .attr('stroke-width', 1.5)
      .style('transition', 'all 0.3s ease');

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(40))
      .on('tick', ticked);

    const nodeElements = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => `url(#editorial-grad-${d.id})`)
      .attr('stroke', 'rgba(237, 232, 223, 0.3)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0px 0px 4px rgba(212, 175, 55, 0.2))')
      .on('click', (event, d: GraphNode) => {
        setSelectedBeer({
          id: d.id,
          name: d.name,
          description: d.description,
          flavors: d.flavors
        }); 
        
        nodeElements
          .attr('stroke', 'rgba(237, 232, 223, 0.3)')
          .attr('stroke-width', 1.5)
          .style('filter', 'drop-shadow(0px 0px 4px rgba(212, 175, 55, 0.2))');

        d3.select(event.currentTarget as SVGCircleElement)
          .attr('stroke', '#d4af37')
          .attr('stroke-width', 3)
          .style('filter', 'url(#glow)');

        linkElements
          .attr('stroke', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? '#d4af37' : 'rgba(237, 232, 223, 0.05)';
          })
          .attr('stroke-width', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 2.5 : 1;
          });
      });

    const textElements = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.name)
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('letter-spacing', '0.5px')
      .attr('text-anchor', 'middle')
      .attr('dy', 26)
      .attr('fill', 'var(--text-muted)');

    function ticked() {
      linkElements
        .attr('x1', (l: GraphLink) => (l.source as GraphNode).x ?? 0)
        .attr('y1', (l: GraphLink) => (l.source as GraphNode).y ?? 0)
        .attr('x2', (l: GraphLink) => (l.target as GraphNode).x ?? 0)
        .attr('y2', (l: GraphLink) => (l.target as GraphNode).y ?? 0);

      nodeElements
        .attr('cx', (d: GraphNode) => d.x ?? 0)
        .attr('cy', (d: GraphNode) => d.y ?? 0);
        
      textElements
        .attr('x', (d: GraphNode) => d.x ?? 0)
        .attr('y', (d: GraphNode) => d.y ?? 0);
    }

    return () => {
      simulation.stop();
    };
  }, [beers]);

  return (
    <div style={{ padding: '4rem 2rem', maxWidth: '1300px', margin: '0 auto' }}>
      
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem', marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="mono-tag" style={{ marginBottom: '0.5rem' }}>Vol. 01 — The Global Cellar</div>
          <h1 style={{ fontSize: '4.5rem', color: 'var(--text-primary)', margin: 0, lineHeight: '0.9' }}>
            BeerBuds<span style={{ color: 'var(--accent-gold)' }}>.</span>
          </h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>
          <button className="scan-btn" onClick={() => setIsScanOpen(true)}>
            📷 Scan Bottle Label
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '280px', textAlign: 'right', margin: 0, fontFamily: 'Inter, sans-serif' }}>
            Mapping flavor genetics across global craft profiles using neural vision models.
          </p>
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 450px', gap: '3rem', alignItems: 'start' }}>
        
        {/* Constellation Graph */}
        <div style={{ background: 'var(--surface-cellar)', border: '1px solid var(--border-subtle)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', left: '24px', zIndex: 10 }}>
            <span className="mono-tag">Interactive Topology</span>
          </div>
          <svg ref={svgRef} width="100%" height="550" viewBox="0 0 700 550" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}></svg>
        </div>

        {/* Journal Panel */}
        <div className="journal-panel" style={{ minHeight: '550px', display: 'flex', flexDirection: 'column' }}>
          <div className="mono-tag" style={{ marginBottom: '1.5rem' }}>Specimen Record</div>
          
          {selectedBeer ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 className="serif-title" style={{ fontSize: '2.8rem', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: '1' }}>
                {selectedBeer.name}
              </h2>
              
              <div className="bottle-stage">
                <div className="bottle-glass">
                  <svg width="100%" height="100%" viewBox="0 0 100 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M42 20C42 12 45 10 50 10C55 10 58 12 58 20V70C58 85 75 105 75 125V250C75 265 70 270 50 270C30 270 25 265 25 250V125C25 105 42 85 42 70V20Z"
                          fill="url(#glass-gradient)"
                          stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                    <defs>
                      <linearGradient id="glass-gradient" x1="0" y1="0" x2="100" y2="280" gradientUnits="userSpaceOnUse">
                        <stop stopColor="rgba(255,255,255,0.15)"/>
                        <stop offset="1" stopColor="rgba(255,255,255,0.02)"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {selectedBeer.flavors.split(',').map((flavor, index) => {
                  const cleanFlavor = flavor.trim();
                  return (
                    <div key={index} className={`ingredient-peep ingredient-pos-${index % 3}`}>
                      <span className="emoji-icon">{getFlavorVisual(cleanFlavor)}</span>
                      {cleanFlavor}
                    </div>
                  );
                })}
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.7', fontFamily: 'Inter, sans-serif', marginTop: 'auto' }}>
                {selectedBeer.description}
              </p>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '1.1rem', fontFamily: 'Instrument Serif, serif', textAlign: 'center' }}>
                Select a constellation node to review its chemical and flavor taxonomy.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* CAMERA SCANNER MODAL */}
      {isScanOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <span className="mono-tag" style={{ display: 'block', marginBottom: '1rem' }}>AI Vision Analyzer</span>
            <h2 className="serif-title" style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>Scan Beer Label</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Upload a photo of a beer bottle or label. Gemini Vision will read the brand and integrate it into the global topology network.
            </p>

            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />

            <div 
              className="upload-dropzone" 
              onClick={() => !isScanning && fileInputRef.current?.click()}
            >
              {isScanning ? (
                <div style={{ color: 'var(--accent-gold)', fontFamily: 'JetBrains Mono, monospace' }}>
                  ⚡ Extracting DNA...
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    CLICK TO CAPTURE / UPLOAD
                  </div>
                </div>
              )}
            </div>

            {scanMessage && (
              <p style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace', marginBottom: '1rem' }}>
                {scanMessage}
              </p>
            )}

            <button 
              className="scan-btn" 
              style={{ margin: '0 auto' }} 
              onClick={() => setIsScanOpen(false)}
              disabled={isScanning}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;