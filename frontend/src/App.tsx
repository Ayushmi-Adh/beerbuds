import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import type { SimulationNodeDatum } from 'd3';
import './App.css';

interface Beer {
  id: number;
  name: string;
  description: string;
  flavors: string;
}

// NEW: We combine our Beer data with D3's physics data (x, y, velocity, etc.)
interface GraphNode extends Beer, SimulationNodeDatum {
  radius: number;
}

const getNodeColor = (flavors: string) => {
  const f = flavors.toLowerCase();
  if (f.includes('roasted') || f.includes('coffee') || f.includes('dark')) return '#5DCAA5';
  if (f.includes('hoppy') || f.includes('citrus') || f.includes('pine')) return '#F0997B';
  return '#EF9F27';
};

function App() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<Beer | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  }, []);

  useEffect(() => {
    if (!beers.length || !svgRef.current) return;

    const width = 800;
    const height = 500;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll('*').remove();

    // Map database beers strictly to our new GraphNode type
    const nodes: GraphNode[] = beers.map(beer => ({
      ...beer,
      radius: 12,
      x: Math.random() * width,
      y: Math.random() * height
    }));

    const g = svg.append('g');

    // Tell the simulation to strictly expect GraphNode types
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(25))
      .on('tick', ticked);

    const nodeElements = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => getNodeColor(d.flavors))
      .attr('stroke', 'var(--bg-deep)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d: GraphNode) => {
        // Now 'd' is strictly typed!
        setSelectedBeer({
          id: d.id,
          name: d.name,
          description: d.description,
          flavors: d.flavors
        }); 
        
        nodeElements.attr('stroke', 'var(--bg-deep)').attr('stroke-width', 2);
        
        // Strictly cast the event target to an SVG circle element
        d3.select(event.currentTarget as SVGCircleElement)
          .attr('stroke', 'var(--accent-gold)')
          .attr('stroke-width', 4);
      });

    const textElements = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.name)
      .attr('font-size', 12)
      .attr('text-anchor', 'middle')
      .attr('dy', 25)
      .attr('fill', 'var(--text-muted)');

    // In the tick function, we safely fallback to 0 if x or y are briefly undefined
    function ticked() {
      nodeElements
        .attr('cx', (d: GraphNode) => d.x || 0)
        .attr('cy', (d: GraphNode) => d.y || 0);
      textElements
        .attr('x', (d: GraphNode) => d.x || 0)
        .attr('y', (d: GraphNode) => d.y || 0);
    }

    return () => {
      simulation.stop();
    };
  }, [beers]);

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3.5rem', color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
          BeerBuds
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontStyle: 'italic', fontFamily: '"Playfair Display", serif' }}>
          Explore the similarity network of global beer profiles.
        </p>
      </header>

      <div style={{ 
        width: '100%', 
        height: '500px', 
        backgroundColor: 'var(--surface-card)', 
        borderRadius: '12px',
        border: '1px solid var(--border-dim)',
        overflow: 'hidden',
        marginBottom: '2rem'
      }}>
        <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet"></svg>
      </div>

      <div style={{ minHeight: '120px' }}>
        {selectedBeer ? (
          <div className="cellar-card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{selectedBeer.name}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>{selectedBeer.description}</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {selectedBeer.flavors.split(',').map((flavor, i) => (
                <span key={i} className="tag">{flavor.trim()}</span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Click a glowing node in the network to inspect its flavor profile.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;