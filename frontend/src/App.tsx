import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3';
import './App.css';

interface Beer {
  id: number;
  name: string;
  description: string;
  flavors: string;
  is_scanned: boolean;
}

interface GraphNode extends Beer, SimulationNodeDatum {
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: number | string | GraphNode;
  target: number | string | GraphNode;
}

type FlipPhase = 'idle' | 'out-next' | 'in-next' | 'out-prev' | 'in-prev';

const FLIP_MS = 360; // keep in sync with the transition duration in App.css (.book-page)

const getNodeColors = (flavors: string) => {
  const f = flavors.toLowerCase();
  if (f.includes('roasted') || f.includes('coffee') || f.includes('dark') || f.includes('stout')) {
    return { main: '#3e2723', shadow: '#1b100c' }; 
  }
  if (f.includes('hoppy') || f.includes('citrus') || f.includes('pine') || f.includes('ale') || f.includes('ipa')) {
    return { main: '#d35400', shadow: '#8e44ad' }; 
  }
  return { main: '#f39c12', shadow: '#d68910' }; 
};

const getFlavorImagePath = (flavor: string) => {
  const f = flavor.toLowerCase();
  if (f.includes('citrus') || f.includes('lemon') || f.includes('orange')) return '/ingredients/citrus.png';
  if (f.includes('pine') || f.includes('herbal')) return '/ingredients/pine.png';
  if (f.includes('floral') || f.includes('wildflower')) return '/ingredients/floral.png';
  if (f.includes('biscuit') || f.includes('malt') || f.includes('wheat') || f.includes('toasted')) return '/ingredients/wheat.png';
  if (f.includes('roasted') || f.includes('coffee') || f.includes('stout')) return '/ingredients/coffee.png';
  if (f.includes('tropical') || f.includes('mango') || f.includes('passion')) return '/ingredients/mango.png';
  return '/ingredients/default.png';
};

const getFlavorVisual = (flavor: string) => {
  const f = flavor.toLowerCase();
  if (f.includes('citrus') || f.includes('lemon')) return '⚗️'; 
  if (f.includes('pine') || f.includes('herbal')) return '🌿';
  if (f.includes('floral') || f.includes('wildflower')) return '🪷';
  if (f.includes('biscuit') || f.includes('malt') || f.includes('wheat')) return '🌾';
  if (f.includes('roasted') || f.includes('coffee') || f.includes('stout')) return '☕';
  if (f.includes('tropical') || f.includes('mango')) return '🥭';
  return '✦';
};

function App() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<Beer | null>(null);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [currentView, setCurrentView] = useState<'cellar' | 'passport'>('cellar');
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);
  const [transitionBubbles, setTransitionBubbles] = useState<{ left: number; delay: number; duration: number }[]>([]);
  const [bookIndex, setBookIndex] = useState(0);
  const [flipPhase, setFlipPhase] = useState<FlipPhase>('idle');

  const svgRef = useRef<SVGSVGElement>(null);

  const fetchBeers = () => {
    fetch('http://127.0.0.1:8000/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  };

  useEffect(() => {
    fetchBeers();
  }, []);

  const processScanFile = async (file: File) => {
    setIsScanning(true);
    setScanMessage("Extracting botanical profiles...");

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/scan-beer', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setScanMessage(`Extraction complete.`);
        fetchBeers();
        setSelectedBeer(data.beer);
        setTimeout(() => {
          setIsScanOpen(false);
          setIsScanning(false);
          setScanMessage(null);

          switchView('passport');
          const scanned = beers.filter(b => b.is_scanned);
          const lastSpread = Math.max(0, (scanned.length % 2 === 0 ? scanned.length : scanned.length - 1) - 1);
          setBookIndex(lastSpread % 2 === 0 ? lastSpread : lastSpread - 1);
        }, 1500);
      } else {
        setScanMessage(`Error: ${data.detail || 'Failed to scan'}`);
        setIsScanning(false);
      }
    } catch (err) {
      console.error(err);
      setScanMessage("Network error connecting to neural model.");
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processScanFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) processScanFile(file);
  };

  // Smooth "beer liquid" transition when switching between Topology and Passport
  const switchView = (target: 'cellar' | 'passport') => {
    if (target === currentView || isViewTransitioning) return;
    setTransitionBubbles(
      Array.from({ length: 16 }).map(() => ({
        left: 4 + Math.random() * 92,
        delay: Math.random() * 0.5,
        duration: 1 + Math.random() * 0.9,
      }))
    );
    setIsViewTransitioning(true);
    window.setTimeout(() => setCurrentView(target), 430);
    window.setTimeout(() => setIsViewTransitioning(false), 980);
  };

  // Real page-flip: rotates the page out, swaps content at the midpoint, rotates it back in
  const flipPage = (direction: 'next' | 'prev') => {
    if (flipPhase !== 'idle') return;
    if (direction === 'next' && bookIndex + 2 >= scannedBeers.length) return;
    if (direction === 'prev' && bookIndex === 0) return;

    setFlipPhase(direction === 'next' ? 'out-next' : 'out-prev');
    window.setTimeout(() => {
      setBookIndex(prev => (direction === 'next' ? prev + 2 : prev - 2));
      setFlipPhase(direction === 'next' ? 'in-next' : 'in-prev');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFlipPhase('idle'));
      });
    }, FLIP_MS);
  };

  // D3 Network Graph Logic
  useEffect(() => {
    if (currentView !== 'cellar' || !beers.length || !svgRef.current) return;

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

    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    beers.forEach((beer) => {
      const colors = getNodeColors(beer.flavors);
      const grad = defs.append('radialGradient')
        .attr('id', `editorial-grad-${beer.id}`)
        .attr('cx', '30%').attr('cy', '30%').attr('r', '70%');
      
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
        if (flavorsA.some(f => flavorsB.includes(f))) {
          links.push({ source: nodes[i].id, target: nodes[j].id });
        }
      }
    }

    const g = svg.append('g');

    const linkElements = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'rgba(44, 36, 27, 0.1)')
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
      .attr('stroke', 'rgba(44, 36, 27, 0.15)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .style('transition', 'r 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)')
      .on('mouseover', function(_event, d) {
        d3.select(this).attr('r', (d as GraphNode).radius + 6);
      })
      .on('mouseout', function(_event, d) {
        d3.select(this).attr('r', (d as GraphNode).radius);
      })
      .on('click', (event, d: GraphNode) => {
        setSelectedBeer({ id: d.id, name: d.name, description: d.description, flavors: d.flavors, is_scanned: d.is_scanned }); 
        
        nodeElements.attr('stroke', 'rgba(44, 36, 27, 0.15)').attr('stroke-width', 1.5).style('filter', 'none');
        d3.select(event.currentTarget as SVGCircleElement).attr('stroke', 'var(--accent-gold)').attr('stroke-width', 3).style('filter', 'url(#glow)');

        linkElements
          .attr('stroke', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 'var(--accent-gold)' : 'rgba(44, 36, 27, 0.05)';
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
      .attr('fill', '#2c241b');

    function ticked() {
      const padX = 30; 
      const padYTop = 60; 
      const padYBot = 30; 

      nodeElements
        .attr('cx', (d: GraphNode) => {
          d.x = Math.max(padX, Math.min(width - padX, d.x ?? 0));
          return d.x;
        })
        .attr('cy', (d: GraphNode) => {
          d.y = Math.max(padYTop, Math.min(height - padYBot, d.y ?? 0));
          return d.y;
        });
        
      linkElements
        .attr('x1', (l: GraphLink) => (l.source as GraphNode).x ?? 0)
        .attr('y1', (l: GraphLink) => (l.source as GraphNode).y ?? 0)
        .attr('x2', (l: GraphLink) => (l.target as GraphNode).x ?? 0)
        .attr('y2', (l: GraphLink) => (l.target as GraphNode).y ?? 0);
        
      textElements
        .attr('x', (d: GraphNode) => d.x ?? 0)
        .attr('y', (d: GraphNode) => d.y ?? 0);
    }

    return () => { simulation.stop(); };
  }, [beers, currentView]);

  const scannedBeers = beers.filter(b => b.is_scanned);
  const leftPageBeer = scannedBeers[bookIndex] || null;
  const rightPageBeer = scannedBeers[bookIndex + 1] || null;
  const canGoNext = bookIndex + 2 < scannedBeers.length;
  const canGoPrev = bookIndex > 0;

  const renderBookPage = (beer: Beer | null, side: 'left' | 'right') => {
    const flipClass =
      side === 'right'
        ? flipPhase === 'out-next' ? 'flip-out-next' : flipPhase === 'in-next' ? 'flip-in-next' : ''
        : flipPhase === 'out-prev' ? 'flip-out-prev' : flipPhase === 'in-prev' ? 'flip-in-prev' : '';

    const handleClick = () => {
      if (side === 'right') flipPage('next');
      else flipPage('prev');
    };

    const hintDisabled = side === 'right' ? !canGoNext : !canGoPrev;

    if (!beer) {
      return (
        <div className={`book-page ${side} ${flipClass}`} onClick={handleClick}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'Instrument Serif, serif', fontSize: '1.5rem', textAlign: 'center' }}>
              More discoveries await...
            </p>
          </div>
          <span className={`page-turn-hint ${hintDisabled ? 'is-disabled' : ''}`}>{side === 'right' ? '›' : '‹'}</span>
        </div>
      );
    }

    const liquidColor = getNodeColors(beer.flavors).main;

    return (
      <div className={`book-page ${side} ${flipClass}`} onClick={handleClick}>
        <div className="mono-tag" style={{ position: 'absolute', top: '2rem', [side === 'left' ? 'left' : 'right']: '2rem' }}>
          STAMP #{beer.id.toString().padStart(4, '0')}
        </div>

        <div style={{ marginTop: '2rem' }}>
          <div className="passport-bottle-wrap">
            <div key={`fill-${bookIndex}-${beer.id}`} className="bottle-liquid" style={{ background: liquidColor }}></div>
          </div>
        </div>

        <h3 className="passport-name">{beer.name}</h3>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
           {beer.flavors.split(',').map((f, i) => {
             const cleanFlavor = f.trim();
             return (
               <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.03)', padding: '4px 10px', borderRadius: '20px' }}>
                 <span style={{ fontSize: '0.9rem' }}>{getFlavorVisual(cleanFlavor)}</span>
                 <span className="mono-tag" style={{ color: 'var(--text-primary)', fontSize: '0.65rem' }}>{cleanFlavor}</span>
               </div>
             );
           })}
        </div>

        <img 
          src="/stamp.png" 
          alt="Collected Stamp" 
          className="custom-stamp" 
          onError={(e) => (e.currentTarget.style.display = 'none')} 
        />
        <span className={`page-turn-hint ${hintDisabled ? 'is-disabled' : ''}`}>{side === 'right' ? '›' : '‹'}</span>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px', margin: '0 auto' }}>

      {/* AMBER LIQUID + FIZZ TRANSITION, plays when switching views */}
      <div className={`liquid-transition ${isViewTransitioning ? 'active' : ''}`}>
        {isViewTransitioning && transitionBubbles.map((b, i) => (
          <span
            key={i}
            className="fizz-bubble"
            style={{
              left: `${b.left}%`,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
            }}
          />
        ))}
      </div>

      {/* RESPONSIVE HEADER */}
      <header className="app-header">
        <div>
          <div className="mono-tag" style={{ marginBottom: '0.5rem' }}>Vol. 01 — Personal Collection</div>
          <h1 style={{ fontSize: '4.5rem', color: 'var(--text-primary)', margin: 0, lineHeight: '0.9', fontFamily: 'Instrument Serif, serif' }}>
            BeerBuds<span style={{ color: 'var(--accent-gold)' }}>.</span>
          </h1>
          
          <div className="view-tabs">
            <button className={`view-tab ${currentView === 'cellar' ? 'active' : ''}`} onClick={() => switchView('cellar')}>
              BEER Topology
            </button>
            <button className={`view-tab ${currentView === 'passport' ? 'active' : ''}`} onClick={() => switchView('passport')}>
              BEER Passport
            </button>
          </div>
        </div>

        <div className="header-actions">
          <button className="scan-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsScanOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Scan Label
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '280px', textAlign: 'right', margin: 0 }}>
            Mapping flavor genetics across global craft profiles using neural vision models.
          </p>
        </div>
      </header>

      {/* RENDER VIEW CONDITIONALLY */}
      {currentView === 'cellar' ? (
        
        <div className="main-layout">
          <div className="topology-container">
            <div style={{ position: 'absolute', top: '20px', left: '24px', zIndex: 10 }}>
              <span className="mono-tag">Interactive Topology</span>
            </div>
            <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 700 550" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: '400px' }}></svg>
          </div>

          <div className="journal-panel" style={{ minHeight: '550px', display: 'flex', flexDirection: 'column' }}>
            <div className="mono-tag" style={{ marginBottom: '1.5rem' }}>Specimen Record</div>
            {selectedBeer ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h2 className="serif-title" style={{ fontSize: '2.8rem', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: '1' }}>
                  {selectedBeer.name}
                </h2>
                
                <div className="bottle-stage">
                  <div className="bottle-glass">
                    <svg height="100%" viewBox="0 0 100 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M42 20C42 12 45 10 50 10C55 10 58 12 58 20V70C58 85 75 105 75 125V250C75 265 70 270 50 270C30 270 25 265 25 250V125C25 105 42 85 42 70V20Z" fill="url(#amber-gradient)" />
                      <path d="M35 130C35 115 45 95 45 80V30" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" filter="blur(2px)"/>
                      <defs>
                        <linearGradient id="amber-gradient" x1="0" y1="0" x2="100" y2="280">
                          <stop offset="0%" stopColor="#8b4513"/><stop offset="50%" stopColor="#4a2511"/><stop offset="100%" stopColor="#2c1408"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  {selectedBeer.flavors.split(',').map((flavor, index) => {
                    const cleanFlavor = flavor.trim();
                    return (
                      <div key={index} className={`ingredient-peep ingredient-pos-${index % 3}`}>
                        <img 
                          src={getFlavorImagePath(cleanFlavor)} 
                          alt={cleanFlavor} 
                          className="ingredient-img"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span style={{ fontSize: '0.85rem', letterSpacing: '1px' }}>{cleanFlavor}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.7', marginTop: 'auto' }}>
                  {selectedBeer.description}
                </p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '1.2rem', fontFamily: 'Instrument Serif, serif', textAlign: 'center' }}>
                  Select a constellation node to review its taxonomy.
                </p>
              </div>
            )}
          </div>
        </div>

      ) : (
        
        <div>
          {scannedBeers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '6rem 2rem', marginTop: '3rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px dashed var(--border-subtle)' }}>
              <h2 className="serif-title" style={{ color: 'var(--text-primary)', fontSize: '2.5rem' }}>Your Passport is Empty</h2>
              <p style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', marginTop: '1rem' }}>
                Use the AI scanner to capture your first bottle and stamp your book.
              </p>
            </div>
          ) : (
            <div className="book-container">
              <div className="page-spine"></div>
              {renderBookPage(leftPageBeer, 'left')}
              {renderBookPage(rightPageBeer, 'right')}
            </div>
          )}
        </div>

      )}

      {/* UPDATED BOTTOM DRAWER MODAL */}
      {isScanOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <span className="mono-tag" style={{ display: 'block', marginBottom: '1rem' }}>AI Vision Analyzer</span>
            <h2 className="serif-title" style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>Scan Beer Label</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Upload a photo of a beer label. Gemini Vision will integrate it into the global topology network.
            </p>

            <input 
              id="file-upload" 
              type="file" 
              accept="image/*" 
              capture="environment" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
              disabled={isScanning}
            />

            <label
              htmlFor="file-upload"
              className={`upload-dropzone ${isDragOver ? 'is-dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              {isScanning ? (
                <div className="mono-tag" style={{ color: 'var(--accent-gold)' }}>Extracting DNA...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <svg className="dropzone-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <div className="mono-tag" style={{ color: 'var(--text-primary)' }}>SELECT, DRAG, OR CAPTURE IMAGE</div>
                </div>
              )}
            </label>

            {scanMessage && <p className="mono-tag" style={{ marginTop: '1rem', color: 'var(--accent-gold)' }}>{scanMessage}</p>}
            
            <button className="scan-btn" style={{ margin: '1.5rem auto 0', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} onClick={() => setIsScanOpen(false)} disabled={isScanning}>
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;