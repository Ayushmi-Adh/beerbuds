import { useEffect, useState, useRef, useCallback } from 'react';
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

type FlavorFamily = 'roasted' | 'hoppy' | 'floral';

interface GraphNode extends Beer, SimulationNodeDatum {
  radius: number;
  family: FlavorFamily;
  bobOffset: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: number | string | GraphNode;
  target: number | string | GraphNode;
}

type FlipPhase = 'idle' | 'out-next' | 'in-next' | 'out-prev' | 'in-prev';
type ScanPhase = 'idle' | 'scanning' | 'success';

const FLIP_MS = 360; // keep in sync with the transition duration in App.css (.book-page)
const TOTAL_STYLES_TARGET = 40;

// Every node color lives inside the same amber / copper / malt family as the
// rest of the app. Three stops per family give the node a "glass bead" look:
// a bright highlight, a mid body tone, and a dark rim. `aura` is the soft
// cluster-glow color used behind grouped nodes in the topology.
const FAMILY_META: Record<FlavorFamily, { highlight: string; mid: string; edge: string; glow: string; aura: string; label: string }> = {
  roasted: { highlight: '#7a5233', mid: '#3e2723', edge: '#1b100c', glow: 'rgba(62, 39, 35, 0.35)', aura: 'rgba(122, 82, 51, 0.30)', label: 'Roasted' },
  hoppy: { highlight: '#e8935a', mid: '#a85d2e', edge: '#5e3013', glow: 'rgba(168, 93, 46, 0.35)', aura: 'rgba(232, 147, 90, 0.26)', label: 'Hoppy' },
  floral: { highlight: '#ffe8b8', mid: '#d69f3c', edge: '#95681f', glow: 'rgba(214, 159, 60, 0.4)', aura: 'rgba(255, 232, 184, 0.32)', label: 'Floral' },
};

const getFlavorFamily = (flavors: string): FlavorFamily => {
  const f = flavors.toLowerCase();
  if (f.includes('roasted') || f.includes('coffee') || f.includes('dark') || f.includes('stout')) return 'roasted';
  if (f.includes('hoppy') || f.includes('citrus') || f.includes('pine') || f.includes('ale') || f.includes('ipa')) return 'hoppy';
  return 'floral';
};

const getNodeColors = (flavors: string) => FAMILY_META[getFlavorFamily(flavors)];

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

// Deterministic pseudo-intensity for the tasting wheel — same flavor string
// always lands on the same radius, so the wheel doesn't jitter on re-render.
const hashFlavor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

function App() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<Beer | null>(null);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [lastScannedId, setLastScannedId] = useState<number | null>(null);

  const [currentView, setCurrentView] = useState<'cellar' | 'passport'>('cellar');
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);
  const [transitionBubbles, setTransitionBubbles] = useState<{ left: number; delay: number; duration: number }[]>([]);
  const [tabBubbles, setTabBubbles] = useState<{ left: number; delay: number }[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const cellarTabRef = useRef<HTMLButtonElement>(null);
  const passportTabRef = useRef<HTMLButtonElement>(null);
  const [bookIndex, setBookIndex] = useState(0);
  const [flipPhase, setFlipPhase] = useState<FlipPhase>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFamilyFilter, setActiveFamilyFilter] = useState<FlavorFamily | null>(null);
  const [chartMode, setChartMode] = useState<'chips' | 'wheel'>('chips');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const fetchBeers = () => {
    fetch('http://127.0.0.1:8000/api/beers')
      .then(response => response.json())
      .then(data => setBeers(data.beers))
      .catch(error => console.error("Error fetching data:", error));
  };

  useEffect(() => {
    fetchBeers();
  }, []);

  // --- Cellar Mode (dark theme) is applied at the document level so it can
  // recolor everything, including the body gradient, from one toggle. ---
  useEffect(() => {
    document.body.classList.toggle('theme-dark', isDarkMode);
    return () => { document.body.classList.remove('theme-dark'); };
  }, [isDarkMode]);

  useEffect(() => {
    const measure = () => {
      const activeRef = currentView === 'cellar' ? cellarTabRef.current : passportTabRef.current;
      if (activeRef) {
        setIndicatorStyle({ left: activeRef.offsetLeft, width: activeRef.offsetWidth });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [currentView]);

  // --- Tiny synthesized sound design, muted by default. No audio files are
  // fetched — everything is generated with WebAudio so it works offline. ---
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };

  const playTone = useCallback((freqStart: number, freqEnd: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.05) => {
    if (isMuted) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + duration * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.05);
    } catch {
      // Audio can fail silently (e.g. no user gesture yet) — never block the UI for it.
    }
  }, [isMuted]);

  const playFizz = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioCtx();
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-i / bufferSize) * 4);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2200;
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {
      // ignore
    }
  }, [isMuted]);

  const playClink = useCallback(() => playTone(1200, 700, 0.18, 'triangle', 0.06), [playTone]);
  const playPour = useCallback(() => { playTone(180, 90, 0.6, 'sine', 0.05); playFizz(); }, [playTone, playFizz]);
  const playBlip = useCallback(() => playTone(500, 650, 0.12, 'sine', 0.04), [playTone]);
  const playPageTurn = useCallback(() => playTone(260, 200, 0.14, 'triangle', 0.035), [playTone]);

  // Simulated progress while the scan request is in flight — the backend
  // doesn't stream progress, so this eases toward 90% and completes on response.
  useEffect(() => {
    if (scanPhase === 'scanning') {
      setScanProgress(0);
      progressTimerRef.current = window.setInterval(() => {
        setScanProgress(p => (p < 90 ? p + Math.random() * 8 : p));
      }, 260);
    } else if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
  }, [scanPhase]);

  const processScanFile = async (file: File) => {
    setIsScanning(true);
    setScanPhase('scanning');
    setScanMessage("Extracting botanical profiles...");
    playPour();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/scan-beer', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setScanProgress(100);
        setScanPhase('success');
        setScanMessage(`Extraction complete.`);
        fetchBeers();
        setSelectedBeer(data.beer);
        setLastScannedId(data.beer?.id ?? null);
        playClink();
        setTimeout(() => {
          setIsScanOpen(false);
          setIsScanning(false);
          setScanPhase('idle');
          setScanMessage(null);

          switchView('passport');
          const scanned = beers.filter(b => b.is_scanned);
          const lastSpread = Math.max(0, (scanned.length % 2 === 0 ? scanned.length : scanned.length - 1) - 1);
          setBookIndex(lastSpread % 2 === 0 ? lastSpread : lastSpread - 1);
        }, 1200);
      } else {
        setScanMessage(`Error: ${data.detail || 'Failed to scan'}`);
        setIsScanning(false);
        setScanPhase('idle');
      }
    } catch (err) {
      console.error(err);
      setScanMessage("Network error connecting to neural model.");
      setIsScanning(false);
      setScanPhase('idle');
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
    playPour();
    setTransitionBubbles(
      Array.from({ length: 16 }).map(() => ({
        left: 4 + Math.random() * 92,
        delay: Math.random() * 0.5,
        duration: 1 + Math.random() * 0.9,
      }))
    );
    setTabBubbles(
      Array.from({ length: 6 }).map(() => ({
        left: 10 + Math.random() * 80,
        delay: Math.random() * 0.25,
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

    playPageTurn();
    setFlipPhase(direction === 'next' ? 'out-next' : 'out-prev');
    window.setTimeout(() => {
      setBookIndex(prev => (direction === 'next' ? prev + 2 : prev - 2));
      setFlipPhase(direction === 'next' ? 'in-next' : 'in-prev');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFlipPhase('idle'));
      });
    }, FLIP_MS);
  };

  // Shared-element "pour": clicking a bead sends a small animated drop
  // traveling from the node to the specimen card, as if the topology were
  // pouring that beer's record into the glass panel.
  const pourIntoCard = useCallback((originRect: DOMRect, color: string) => {
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const targetRect = cardEl.getBoundingClientRect();
    const drop = document.createElement('div');
    drop.className = 'pour-drop';
    drop.style.setProperty('--drop-color', color);
    drop.style.left = `${originRect.left + originRect.width / 2}px`;
    drop.style.top = `${originRect.top + originRect.height / 2}px`;
    document.body.appendChild(drop);
    const dx = (targetRect.left + targetRect.width / 2) - (originRect.left + originRect.width / 2);
    const dy = (targetRect.top + 46) - (originRect.top + originRect.height / 2);
    drop.style.setProperty('--drop-dx', `${dx}px`);
    drop.style.setProperty('--drop-dy', `${dy}px`);
    requestAnimationFrame(() => drop.classList.add('pour-drop-active'));
    window.setTimeout(() => drop.remove(), 700);
  }, []);

  // Cursor-reactive glow across the topology stage — a warm spot that
  // follows the pointer, like light passing through a glass of beer.
  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--glow-x', `${x}%`);
    e.currentTarget.style.setProperty('--glow-y', `${y}%`);
  };

  // Foil-shimmer tilt on passport stamps — light catches the ink on hover.
  const handleStampTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    e.currentTarget.style.setProperty('--tilt-x', `${py * -12}deg`);
    e.currentTarget.style.setProperty('--tilt-y', `${px * 12}deg`);
  };
  const resetStampTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--tilt-x', '0deg');
    e.currentTarget.style.setProperty('--tilt-y', '0deg');
  };

  // D3 Network Graph Logic — glass-bead nodes clustered by flavor family on
  // a frosted amber stage, each family glowing behind its own soft aura.
  useEffect(() => {
    if (currentView !== 'cellar' || !beers.length || !svgRef.current) return;

    const width = 900;
    const height = 620;
    const svg = d3.select(svgRef.current);

    svg.selectAll('*').remove();
    const defs = svg.append('defs');

    // Soft amber glow used behind the whole stage and on selected nodes
    const glowFilter = defs.append('filter')
      .attr('id', 'nodeGlow')
      .attr('x', '-80%').attr('y', '-80%')
      .attr('width', '260%').attr('height', '260%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
    const glowMerge = glowFilter.append('feMerge');
    glowMerge.append('feMergeNode').attr('in', 'blur');
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Subtle drop shadow so beads feel like they're resting above the glass
    const dropShadow = defs.append('filter')
      .attr('id', 'beadShadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%');
    dropShadow.append('feDropShadow')
      .attr('dx', 0).attr('dy', 3).attr('stdDeviation', 3)
      .attr('flood-color', '#2c241b').attr('flood-opacity', 0.25);

    // Wide, soft blur for the family-cluster auras
    const auraBlur = defs.append('filter')
      .attr('id', 'auraBlur')
      .attr('x', '-120%').attr('y', '-120%')
      .attr('width', '340%').attr('height', '340%');
    auraBlur.append('feGaussianBlur').attr('stdDeviation', '40');

    beers.forEach((beer) => {
      const colors = getNodeColors(beer.flavors);
      const grad = defs.append('radialGradient')
        .attr('id', `bead-grad-${beer.id}`)
        .attr('cx', '32%').attr('cy', '28%').attr('r', '75%');

      grad.append('stop').attr('offset', '0%').attr('stop-color', colors.highlight);
      grad.append('stop').attr('offset', '48%').attr('stop-color', colors.mid);
      grad.append('stop').attr('offset', '100%').attr('stop-color', colors.edge);
    });

    const isDesktopLayout = window.innerWidth > 1024;
    const graphCenterX = isDesktopLayout ? width * 0.4 : width / 2;

    // Fixed anchor points per flavor family — nodes are pulled gently toward
    // their family's anchor so the topology reads as three soft clusters
    // instead of a uniform random scatter.
    const familyAnchors: Record<FlavorFamily, { x: number; y: number }> = {
      roasted: { x: graphCenterX - 190, y: height / 2 - 110 },
      hoppy: { x: graphCenterX + 190, y: height / 2 - 90 },
      floral: { x: graphCenterX, y: height / 2 + 170 },
    };

    const nodes: GraphNode[] = beers.map(beer => {
      const family = getFlavorFamily(beer.flavors);
      const anchor = familyAnchors[family];
      return {
        ...beer,
        radius: 14,
        family,
        bobOffset: Math.random() * 3,
        x: anchor.x + (Math.random() - 0.5) * 140,
        y: anchor.y + (Math.random() - 0.5) * 140,
      };
    });

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

    // Cluster auras — soft glowing zones behind each family, sized by how
    // many beers belong to it.
    const familyCounts: Record<FlavorFamily, number> = { roasted: 0, hoppy: 0, floral: 0 };
    nodes.forEach(n => { familyCounts[n.family] += 1; });

    const auraGroup = g.append('g').attr('class', 'aura-group');
    (Object.keys(familyAnchors) as FlavorFamily[]).forEach(fam => {
      if (familyCounts[fam] === 0) return;
      auraGroup.append('circle')
        .attr('cx', familyAnchors[fam].x)
        .attr('cy', familyAnchors[fam].y)
        .attr('r', 55 + familyCounts[fam] * 16)
        .attr('fill', FAMILY_META[fam].aura)
        .attr('filter', 'url(#auraBlur)')
        .style('opacity', 0)
        .transition().duration(1000).style('opacity', 1);
    });

    const linkElements = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'topology-link')
      .attr('stroke', 'rgba(168, 93, 46, 0.22)')
      .attr('stroke-width', 1.4)
      .attr('stroke-linecap', 'round')
      .style('opacity', 0);

    linkElements.transition()
      .delay(300)
      .duration(600)
      .style('opacity', 1);

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(120).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('x', d3.forceX<GraphNode>(d => familyAnchors[d.family].x).strength(0.09))
      .force('y', d3.forceY<GraphNode>(d => familyAnchors[d.family].y).strength(0.09))
      .force('collide', d3.forceCollide().radius(40))
      .on('tick', ticked);

    const nodeGroups = g.append('g')
      .selectAll('g.bead')
      .data(nodes)
      .join('g')
      .attr('class', 'bead')
      .attr('data-beer-id', d => d.id)
      .attr('data-beer-name', d => d.name.toLowerCase())
      .attr('data-beer-family', d => d.family)
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Nested group carries the idle "suspended in liquid" bob — a CSS
    // animation on this inner <g> composes on top of the simulation's own
    // translate() on the outer group, so the two never fight each other.
    const beadInner = nodeGroups.append('g')
      .attr('class', 'bead-bob')
      .style('animation-delay', d => `${-d.bobOffset}s`);

    // Main glass bead
    const nodeCircles = beadInner.append('circle')
      .attr('class', 'bead-body')
      .attr('r', 0)
      .attr('fill', d => `url(#bead-grad-${d.id})`)
      .attr('stroke', 'rgba(255, 250, 240, 0.55)')
      .attr('stroke-width', 1.5)
      .attr('filter', 'url(#beadShadow)');

    // Tiny glass highlight (the "shine" on a bottle-glass bead)
    beadInner.append('ellipse')
      .attr('class', 'bead-shine')
      .attr('rx', 4).attr('ry', 2.4)
      .attr('cx', -4.5).attr('cy', -5.5)
      .attr('fill', 'rgba(255,255,255,0.85)')
      .attr('transform', 'rotate(-25)')
      .style('pointer-events', 'none');

    // Staggered spring entrance, bead by bead
    nodeGroups.transition()
      .delay((_d, i) => 150 + i * 55)
      .duration(550)
      .ease(d3.easeBackOut.overshoot(1.6))
      .style('opacity', 1);

    nodeCircles.transition()
      .delay((_d, i) => 150 + i * 55)
      .duration(550)
      .ease(d3.easeBackOut.overshoot(1.7))
      .attr('r', d => d.radius);

    nodeGroups
      .on('mouseover', function (_event, d) {
        d3.select(this).select('circle.bead-body')
          .transition().duration(220).ease(d3.easeBackOut.overshoot(2))
          .attr('r', d.radius + 6);
      })
      .on('mouseout', function (_event, d) {
        d3.select(this).select('circle.bead-body')
          .transition().duration(220)
          .attr('r', d.radius);
      })
      .on('click', (event, d: GraphNode) => {
        const originRect = (event.currentTarget as SVGGElement).getBoundingClientRect();
        pourIntoCard(originRect, getNodeColors(d.flavors).mid);
        playBlip();

        setSelectedBeer({ id: d.id, name: d.name, description: d.description, flavors: d.flavors, is_scanned: d.is_scanned });

        nodeCircles
          .attr('stroke', 'rgba(255, 250, 240, 0.55)')
          .attr('stroke-width', 1.5)
          .attr('filter', 'url(#beadShadow)');
        d3.select(event.currentTarget as SVGGElement).select('circle.bead-body')
          .attr('stroke', 'var(--accent-gold)')
          .attr('stroke-width', 2.5)
          .attr('filter', 'url(#nodeGlow)');

        linkElements
          .attr('class', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 'topology-link topology-link-active' : 'topology-link';
          })
          .attr('stroke', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 'var(--accent-gold-deep)' : 'rgba(168, 93, 46, 0.1)';
          })
          .attr('stroke-width', (l: GraphLink) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 2.5 : 1.2;
          });
      });

    beadInner.append('text')
      .text(d => d.name)
      .attr('font-size', '10px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', 500)
      .attr('letter-spacing', '0.4px')
      .attr('text-anchor', 'middle')
      .attr('dy', 30)
      .attr('fill', '#4a3d2c')
      .style('pointer-events', 'none');

    function ticked() {
      const padX = 34;
      const padYTop = 60;
      const padYBot = 34;
      // The specimen card floats over the right side of the stage on
      // desktop, so keep the simulation from placing beads underneath it.
      const padXRight = isDesktopLayout ? 270 : padX;

      nodeGroups.attr('transform', (d: GraphNode) => {
        d.x = Math.max(padX, Math.min(width - padXRight, d.x ?? 0));
        d.y = Math.max(padYTop, Math.min(height - padYBot, d.y ?? 0));
        return `translate(${d.x}, ${d.y})`;
      });

      linkElements
        .attr('x1', (l: GraphLink) => (l.source as GraphNode).x ?? 0)
        .attr('y1', (l: GraphLink) => (l.source as GraphNode).y ?? 0)
        .attr('x2', (l: GraphLink) => (l.target as GraphNode).x ?? 0)
        .attr('y2', (l: GraphLink) => (l.target as GraphNode).y ?? 0);
    }

    return () => { simulation.stop(); };
  }, [beers, currentView, pourIntoCard, playBlip]);

  // Search + family-filter pills: dim everything that doesn't match, light
  // up beads that do. Pure DOM/D3 work only — no React state updates in here.
  useEffect(() => {
    if (currentView !== 'cellar' || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const q = searchQuery.trim().toLowerCase();

    const beads = svg.selectAll<SVGGElement, unknown>('g.bead');
    const links = svg.selectAll<SVGLineElement, unknown>('line.topology-link, line.topology-link-active');

    const anyFilterActive = !!q || !!activeFamilyFilter;

    if (!anyFilterActive) {
      beads.style('opacity', 1);
      beads.select('circle.bead-body')
        .attr('stroke', 'rgba(255, 250, 240, 0.55)')
        .attr('stroke-width', 1.5)
        .attr('filter', 'url(#beadShadow)');
      links.style('opacity', 1);
      return;
    }

    beads.each(function () {
      const el = d3.select(this);
      const name = el.attr('data-beer-name') || '';
      const family = el.attr('data-beer-family') || '';
      const matchesSearch = !q || name.includes(q);
      const matchesFamily = !activeFamilyFilter || family === activeFamilyFilter;
      const isMatch = matchesSearch && matchesFamily;
      el.style('opacity', isMatch ? 1 : 0.15);
      el.select('circle.bead-body')
        .attr('stroke', isMatch ? 'var(--accent-gold)' : 'rgba(255, 250, 240, 0.55)')
        .attr('stroke-width', isMatch ? 3 : 1.5)
        .attr('filter', isMatch ? 'url(#nodeGlow)' : 'url(#beadShadow)');
    });

    links.style('opacity', 0.08);
  }, [searchQuery, activeFamilyFilter, beers, currentView]);

  // Auto-open the specimen card when the search narrows to exactly one
  // beer. Kept in its own effect, derived straight from `beers` (not the
  // DOM), and deferred with a microtask so the setState isn't fired
  // synchronously inside the effect body.
  useEffect(() => {
    if (currentView !== 'cellar') return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const matches = beers.filter(b => b.name.toLowerCase().includes(q));
    if (matches.length !== 1) return;

    const match = matches[0];
    queueMicrotask(() => {
      setSelectedBeer(prev => (prev?.id === match.id ? prev : match));
    });
  }, [searchQuery, beers, currentView]);

  const scannedBeers = beers.filter(b => b.is_scanned);
  const leftPageBeer = scannedBeers[bookIndex] || null;
  const rightPageBeer = scannedBeers[bookIndex + 1] || null;
  const canGoNext = bookIndex + 2 < scannedBeers.length;
  const canGoPrev = bookIndex > 0;
  const currentFamily = selectedBeer ? getFlavorFamily(selectedBeer.flavors) : null;

  const renderTastingWheel = (flavors: string[]) => {
    if (flavors.length === 0) return null;
    const n = flavors.length;
    const size = 180;
    const center = size / 2;
    const maxR = 66;

    const points = flavors.map((f, i) => {
      const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
      const val = 45 + (hashFlavor(f) % 55);
      const r = (val / 100) * maxR;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        axisX: center + maxR * Math.cos(angle),
        axisY: center + maxR * Math.sin(angle),
        flavor: f,
        emoji: getFlavorVisual(f),
      };
    });
    const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');

    return (
      <div className="tasting-wheel-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" className="tasting-wheel">
          {[0.34, 0.67, 1].map(scale => (
            <circle key={scale} cx={center} cy={center} r={maxR * scale} className="wheel-ring" />
          ))}
          {points.map((p, i) => (
            <line key={i} x1={center} y1={center} x2={p.axisX} y2={p.axisY} className="wheel-axis" />
          ))}
          <polygon points={polygonPoints} className="wheel-shape" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" className="wheel-point" />
          ))}
        </svg>
        <div className="wheel-labels">
          {points.map((p, i) => (
            <span key={i} className="wheel-label"><span>{p.emoji}</span> {p.flavor}</span>
          ))}
        </div>
      </div>
    );
  };

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

    const liquidColor = getNodeColors(beer.flavors).mid;
    const isFreshStamp = lastScannedId === beer.id;

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

        <div
          className={`wax-stamp ${isFreshStamp ? 'wax-stamp-fresh' : ''}`}
          onMouseMove={handleStampTilt}
          onMouseLeave={resetStampTilt}
        >
          <img
            src="/stamp.png"
            alt="Collected Stamp"
            className="custom-stamp"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <span className="wax-ink-bleed" aria-hidden="true" />
        </div>
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
          <h1 className="wordmark-ripple" style={{ fontSize: '4.5rem', color: 'var(--text-primary)', margin: 0, lineHeight: '0.9', fontFamily: 'Instrument Serif, serif' }}>
            BeerBuds<span style={{ color: 'var(--accent-gold)' }}>.</span>
          </h1>

          <div className="view-tabs-glass">
            <div className="view-tabs-indicator" style={{ left: indicatorStyle.left, width: indicatorStyle.width }}>
              {isViewTransitioning && tabBubbles.map((b, i) => (
                <span key={i} className="tab-fizz-bubble" style={{ left: `${b.left}%`, animationDelay: `${b.delay}s` }} />
              ))}
            </div>
            <button ref={cellarTabRef} className={`view-tab ${currentView === 'cellar' ? 'active' : ''}`} onClick={() => switchView('cellar')}>
              BEER Topology
            </button>
            <button ref={passportTabRef} className={`view-tab ${currentView === 'passport' ? 'active' : ''}`} onClick={() => switchView('passport')}>
              BEER Passport
            </button>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-toggles">
            <button className="icon-toggle" onClick={() => setIsDarkMode(v => !v)} title="Toggle Cellar Mode" aria-label="Toggle dark theme">
              {isDarkMode ? '🌙' : '☀️'}
            </button>
            <button className="icon-toggle" onClick={() => setIsMuted(v => !v)} title={isMuted ? 'Unmute sounds' : 'Mute sounds'} aria-label="Toggle sound">
              {isMuted ? '🔇' : '🔊'}
            </button>
          </div>
          <button className="scan-btn condensation-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsScanOpen(true)}>
            <span className="condensation-drip" />
            <span className="condensation-drip" />
            <span className="condensation-drip" />
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

        // Single unified glass stage: graph + specimen card live on one shared
        // frosted-amber surface, so there's no more hard seam / vertical bar.
        <div className="topology-stage" onMouseMove={handleStageMouseMove}>
          <div className="mood-layer mood-roasted" style={{ opacity: currentFamily === 'roasted' ? 1 : 0 }} />
          <div className="mood-layer mood-hoppy" style={{ opacity: currentFamily === 'hoppy' ? 1 : 0 }} />
          <div className="mood-layer mood-floral" style={{ opacity: currentFamily === 'floral' ? 1 : 0 }} />
          <div className="shimmer-layer" aria-hidden="true" />
          <div className="stage-glow" aria-hidden="true" />

          <div className="topology-eyebrow">
            <span className="mono-tag">Interactive Topology</span>
            <div className="family-pills">
              {(['roasted', 'hoppy', 'floral'] as FlavorFamily[]).map(fam => (
                <button
                  key={fam}
                  className={`family-pill family-pill-${fam} ${activeFamilyFilter === fam ? 'active' : ''}`}
                  onClick={() => setActiveFamilyFilter(prev => (prev === fam ? null : fam))}
                >
                  {FAMILY_META[fam].label}
                </button>
              ))}
            </div>
            <div className="topology-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search a beer..."
              />
              {searchQuery && (
                <button className="topology-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>
              )}
            </div>
          </div>

          <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid meet" className="topology-svg"></svg>

          <div className={`specimen-glass-card ${selectedBeer ? 'has-beer' : ''}`} ref={cardRef}>
            <div className="shimmer-layer" aria-hidden="true" />
            {selectedBeer ? (
              <div key={selectedBeer.id} className="specimen-content">
                <div className="mono-tag" style={{ marginBottom: '0.75rem' }}>Specimen Record</div>
                <h2 className="serif-title" style={{ fontSize: '2rem', color: 'var(--text-primary)', marginBottom: '0.25rem', lineHeight: '1.05' }}>
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
                        <span>{cleanFlavor}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="chart-toggle">
                  <button className={chartMode === 'chips' ? 'active' : ''} onClick={() => setChartMode('chips')}>Chips</button>
                  <button className={chartMode === 'wheel' ? 'active' : ''} onClick={() => setChartMode('wheel')}>Tasting Wheel</button>
                </div>

                {chartMode === 'chips' ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {selectedBeer.flavors.split(',').map((f, i) => {
                      const cleanFlavor = f.trim();
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.03)', padding: '4px 10px', borderRadius: '20px' }}>
                          <span style={{ fontSize: '0.9rem' }}>{getFlavorVisual(cleanFlavor)}</span>
                          <span className="mono-tag" style={{ color: 'var(--text-primary)', fontSize: '0.65rem' }}>{cleanFlavor}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  renderTastingWheel(selectedBeer.flavors.split(',').map(f => f.trim()))
                )}

                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.7', margin: 0 }}>
                  {selectedBeer.description}
                </p>
              </div>
            ) : (
              <div className="specimen-empty-state">
                <div className="specimen-empty-glyph">✦</div>
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '1.05rem', fontFamily: 'Instrument Serif, serif', textAlign: 'center', margin: 0 }}>
                  Select a bead in the topology<br />to review its taxonomy.
                </p>
              </div>
            )}
          </div>
        </div>

      ) : (

        <div>
          <div className="progress-ribbon">
            <span className="ribbon-count">{scannedBeers.length}</span>
            <span className="ribbon-of">/ {TOTAL_STYLES_TARGET} styles collected</span>
            <div className="ribbon-track">
              <div className="ribbon-fill" style={{ width: `${Math.min(100, (scannedBeers.length / TOTAL_STYLES_TARGET) * 100)}%` }} />
            </div>
          </div>

          {scannedBeers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '6rem 2rem', marginTop: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px dashed var(--border-subtle)' }}>
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

      {/* BEER-THEMED SCAN DRAWER — a pint rising from the bottom with a foam head */}
      {isScanOpen && (
        <div className="modal-overlay" onClick={() => !isScanning && setIsScanOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="scan-drawer-header">
              <span className="mono-tag">AI Vision Analyzer</span>
              <h2 className="serif-title scan-drawer-title">Scan Beer Label</h2>
              <p className="scan-drawer-sub">
                Upload a photo of a beer label. Gemini Vision will integrate it into the global topology network.
              </p>
            </div>

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
              className={`upload-dropzone ${isDragOver ? 'is-dragover' : ''} ${isScanning ? 'is-scanning' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              {isScanning && (
                <div className="scan-fizz" aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} style={{ left: `${8 + i * 10}%`, animationDelay: `${(i % 4) * 0.18}s` }} />
                  ))}
                </div>
              )}

              {isScanning ? (
                <div className="scan-loading">
                  <div className="scan-pour-ring-wrap">
                    <svg className="scan-progress-ring" viewBox="0 0 100 100">
                      <circle className="ring-track" cx="50" cy="50" r="44" />
                      <circle
                        className="ring-fill"
                        cx="50" cy="50" r="44"
                        style={{ strokeDashoffset: 276.5 - (276.5 * Math.min(scanProgress, 100)) / 100 }}
                      />
                    </svg>
                    <div className={`scan-pour-glass ${scanPhase === 'success' ? 'is-full' : ''}`}>
                      <div
                        className="scan-pour-liquid"
                        style={{ height: `${scanPhase === 'success' ? 82 : Math.min(scanProgress, 88) * 0.82}%` }}
                      />
                      <div
                        className="scan-pour-foam"
                        style={{ bottom: `${scanPhase === 'success' ? 82 : Math.min(scanProgress, 88) * 0.82}%` }}
                      />
                    </div>
                  </div>
                  <div className="mono-tag" style={{ color: 'var(--accent-gold)' }}>
                    {scanPhase === 'success' ? 'Pour complete.' : (scanMessage || 'Extracting DNA...')}
                  </div>
                  <div className="mono-tag scan-progress-pct">{Math.round(Math.min(scanProgress, 100))}%</div>
                </div>
              ) : (
                <div className="dropzone-resting">
                  <div className="dropzone-glass-icon">
                    <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 4h24l-3 38a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4L8 4z" stroke="var(--accent-copper)" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M7.6 14h24.8" stroke="var(--accent-gold)" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M9 24h22" stroke="rgba(168,93,46,0.35)" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 3" />
                      <circle cx="15" cy="30" r="2" fill="rgba(255,255,255,0.85)" />
                      <circle cx="24" cy="36" r="1.5" fill="rgba(255,255,255,0.7)" />
                    </svg>
                  </div>
                  <div className="dropzone-label">
                    <span className="mono-tag" style={{ color: 'var(--text-primary)' }}>Select, drag, or capture image</span>
                    <span className="dropzone-hint">PNG · JPG · HEIC</span>
                  </div>
                </div>
              )}
            </label>

            {!isScanning && scanMessage && (
              <p className="mono-tag" style={{ marginTop: '1rem', color: 'var(--accent-gold)' }}>{scanMessage}</p>
            )}

            <div className="scan-drawer-actions">
              <button
                className="scan-btn scan-cancel-btn condensation-btn"
                onClick={() => setIsScanOpen(false)}
                disabled={isScanning}
              >
                <span className="condensation-drip" />
                <span className="condensation-drip" />
                <span className="condensation-drip" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;