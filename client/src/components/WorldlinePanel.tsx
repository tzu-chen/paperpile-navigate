import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { SavedPaper, Citation, Worldline, SemanticScholarPaper, SemanticScholarResult } from '../types';
import * as api from '../services/api';
import { computeEmbeddingPositions } from '../services/embedding';
import LaTeX from './LaTeX';

interface Props {
  papers: SavedPaper[];
  showNotification: (msg: string) => void;
  onRefresh: () => Promise<void>;
  onOpenPaper: (paper: SavedPaper) => void;
}

interface WorldlineWithPapers extends Worldline {
  paperIds: Set<number>;
}

type InteractionMode = 'select' | 'import' | 'view';

export default function WorldlinePanel({ papers, showNotification, onRefresh, onOpenPaper }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [citations, setCitations] = useState<Citation[]>([]);
  const [worldlines, setWorldlines] = useState<WorldlineWithPapers[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());
  const [hoveredPaperId, setHoveredPaperId] = useState<number | null>(null);
  const [activeWorldlineId, setActiveWorldlineId] = useState<number | null>(null);
  const [mode, setMode] = useState<InteractionMode>('select');

  // Refs for right-click drag citation
  const dragSrcRef = useRef<number | null>(null);
  const dragLineRef = useRef<SVGLineElement | null>(null);
  const citationsRef = useRef<Citation[]>([]);

  // Ref for click/dblclick disambiguation (delay click so dblclick can cancel it)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenPaperRef = useRef(onOpenPaper);
  onOpenPaperRef.current = onOpenPaper;

  // Worldline creation form
  const [newWlName, setNewWlName] = useState('');
  const [newWlColor, setNewWlColor] = useState('#6366f1');

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Semantic Scholar citations discovery
  const [discoveryResult, setDiscoveryResult] = useState<SemanticScholarResult | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryPaperId, setDiscoveryPaperId] = useState<number | null>(null);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [discoveryTab, setDiscoveryTab] = useState<'citations' | 'references'>('citations');
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [discoveryPage, setDiscoveryPage] = useState(0);
  const DISCOVERY_PAGE_SIZE = 10;

  // Batch import form
  const [importArxivIds, setImportArxivIds] = useState('');
  const [importWlName, setImportWlName] = useState('');
  const [importWlColor, setImportWlColor] = useState('#6366f1');
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importWlMode, setImportWlMode] = useState<'new' | 'existing'>('new');
  const [importExistingWlId, setImportExistingWlId] = useState<number | null>(null);

  // Visibility toggles
  const [showCitations, setShowCitations] = useState(true);
  const [showWorldlines, setShowWorldlines] = useState(true);
  const [showNonWorldlinePapers, setShowNonWorldlinePapers] = useState(true);

  // Collapsible sections
  const [allPapersOpen, setAllPapersOpen] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [cites, wls] = await Promise.all([
        api.getCitations(),
        api.getWorldlines(),
      ]);
      setCitations(cites);

      // Load paper IDs for each worldline
      const wlsWithPapers: WorldlineWithPapers[] = await Promise.all(
        wls.map(async (wl) => {
          const wlPapers = await api.getWorldlinePapers(wl.id);
          return { ...wl, paperIds: new Set(wlPapers.map((p: SavedPaper) => p.id)) };
        })
      );
      setWorldlines(wlsWithPapers);
    } catch (err) {
      console.error('Failed to load worldline data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep citationsRef in sync for D3 handlers
  useEffect(() => {
    citationsRef.current = citations;
  }, [citations]);

  // Compute paper positions: x via PCA embedding of paper text, y is time
  const paperPositions = useMemo(() => {
    if (papers.length === 0) return new Map<number, { x: number; y: number }>();

    // PCA 1D embedding for x-axis (topic similarity)
    const embeddingX = computeEmbeddingPositions(papers);

    const positions = new Map<number, { x: number; y: number }>();
    papers.forEach(p => {
      positions.set(p.id, {
        x: embeddingX.get(p.id) ?? 0.5,
        y: new Date(p.published).getTime(),
      });
    });

    return positions;
  }, [papers]);

  // Get active worldline
  const activeWorldline = worldlines.find(w => w.id === activeWorldlineId) || null;

  // Track tooltip position in page coordinates
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // D3 rendering — builds the full SVG. Does NOT depend on hoveredPaperId
  // so hovering never causes a full re-render.
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || papers.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Clear previous content
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 30, bottom: 40, left: 80 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Scales
    const dates = papers.map(p => new Date(p.published));
    const minDate = d3.min(dates)!;
    const maxDate = d3.max(dates)!;
    // Add padding to date range
    const dateRange = maxDate.getTime() - minDate.getTime();
    const datePadding = dateRange * 0.05 || 86400000; // 1 day if all same date

    const yScale = d3.scaleTime()
      .domain([new Date(minDate.getTime() - datePadding), new Date(maxDate.getTime() + datePadding)])
      .range([innerH, 0]);

    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, innerW]);

    // Create main group with zoom
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Clip path
    svg.append('defs').append('clipPath')
      .attr('id', 'chart-clip')
      .append('rect')
      .attr('width', innerW)
      .attr('height', innerH);

    const chartArea = g.append('g').attr('clip-path', 'url(#chart-clip)');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 10])
      .on('zoom', (event) => {
        chartArea.attr('transform', event.transform.toString());
        // Update axes
        const newYScale = event.transform.rescaleY(yScale);
        const newXScale = event.transform.rescaleX(xScale);
        yAxisG.call(d3.axisLeft(newYScale).ticks(8));
        xAxisG.call(d3.axisBottom(newXScale).ticks(0)); // hide x ticks
      });

    svg.call(zoom);

    // Prevent browser context menu on right-click (used for drag-citations)
    svg.on('contextmenu', (event: Event) => event.preventDefault());

    // Axes
    const yAxisG = g.append('g')
      .call(d3.axisLeft(yScale).ticks(8))
      .attr('class', 'wl-axis');

    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(0))
      .attr('class', 'wl-axis');

    // X-axis label (PCA topic similarity)
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '12px')
      .text('Topic Similarity');

    // Draw citation edges — conditionally visible
    const citationLines = chartArea.append('g').attr('class', 'citation-lines');

    if (showCitations) citations.forEach(c => {
      const srcPos = paperPositions.get(c.citing_paper_id);
      const tgtPos = paperPositions.get(c.cited_paper_id);
      if (!srcPos || !tgtPos) return;

      // Check if this edge belongs to any worldline
      let edgeColor = 'var(--text-muted)';
      let edgeWidth = 1.5;
      let edgeOpacity = 0.5;

      worldlines.forEach(wl => {
        if (wl.paperIds.has(c.citing_paper_id) && wl.paperIds.has(c.cited_paper_id)) {
          edgeColor = wl.color;
          edgeWidth = 2.5;
          edgeOpacity = 0.85;
        }
      });

      const lineEl = citationLines.append('line')
        .attr('x1', xScale(srcPos.x))
        .attr('y1', yScale(srcPos.y))
        .attr('x2', xScale(tgtPos.x))
        .attr('y2', yScale(tgtPos.y))
        .attr('stroke', edgeColor)
        .attr('stroke-width', edgeWidth)
        .attr('stroke-opacity', edgeOpacity)
        .attr('data-citing', c.citing_paper_id)
        .attr('data-cited', c.cited_paper_id);

      // Arrow head pointing from citing to cited
      const dx = xScale(tgtPos.x) - xScale(srcPos.x);
      const dy = yScale(tgtPos.y) - yScale(srcPos.y);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 20) {
        const ux = dx / len;
        const uy = dy / len;
        const arrowSize = 6;
        const midX = xScale(srcPos.x) + dx * 0.6;
        const midY = yScale(srcPos.y) + dy * 0.6;

        citationLines.append('polygon')
          .attr('points', [
            [midX + ux * arrowSize, midY + uy * arrowSize],
            [midX - uy * arrowSize * 0.5, midY + ux * arrowSize * 0.5],
            [midX + uy * arrowSize * 0.5, midY - ux * arrowSize * 0.5],
          ].map(p => p.join(',')).join(' '))
          .attr('fill', edgeColor)
          .attr('opacity', edgeOpacity)
          .attr('data-citing', c.citing_paper_id)
          .attr('data-cited', c.cited_paper_id);
      }
    });

    // Draw worldline paths (connecting papers in a worldline in time order)
    if (showWorldlines) worldlines.forEach(wl => {
      const wlPaperPositions = Array.from(wl.paperIds)
        .map(id => ({ id, pos: paperPositions.get(id) }))
        .filter((p): p is { id: number; pos: { x: number; y: number } } => !!p.pos)
        .sort((a, b) => a.pos.y - b.pos.y); // sort by time

      if (wlPaperPositions.length < 2) return;

      const lineGen = d3.line<{ id: number; pos: { x: number; y: number } }>()
        .x(d => xScale(d.pos.x))
        .y(d => yScale(d.pos.y))
        .curve(d3.curveCatmullRom.alpha(0.5));

      chartArea.append('path')
        .datum(wlPaperPositions)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', wl.color)
        .attr('stroke-width', 3)
        .attr('stroke-opacity', 0.3)
        .attr('stroke-linecap', 'round');
    });

    // Draw paper nodes
    const nodes = chartArea.append('g').attr('class', 'paper-nodes');

    papers.forEach(p => {
      const pos = paperPositions.get(p.id);
      if (!pos) return;

      // Determine node appearance
      let fillColor = 'var(--text-muted)';
      let strokeColor = 'var(--border-color)';
      let radius = 5;
      let strokeWidth = 1.5;

      // Check if in any worldline
      const belongsToWorldlines: WorldlineWithPapers[] = [];
      worldlines.forEach(wl => {
        if (wl.paperIds.has(p.id)) {
          belongsToWorldlines.push(wl);
        }
      });

      // Hide papers not assigned to any worldline when toggled off
      if (!showNonWorldlinePapers && belongsToWorldlines.length === 0) return;

      if (belongsToWorldlines.length > 0) {
        fillColor = belongsToWorldlines[0].color;
        strokeColor = belongsToWorldlines[0].color;
        radius = 7;
        strokeWidth = 2;
      }

      const isSelected = selectedPaperIds.has(p.id);
      if (isSelected) {
        strokeColor = 'var(--accent)';
        strokeWidth = 3;
        radius = 8;
      }

      const node = nodes.append('circle')
        .attr('cx', xScale(pos.x))
        .attr('cy', yScale(pos.y))
        .attr('r', radius)
        .attr('fill', fillColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('cursor', 'pointer')
        .attr('data-paper-id', p.id)
        // Store base values for hover restore
        .attr('data-base-r', radius)
        .attr('data-base-sw', strokeWidth);

      // Hover handlers — update node directly via D3, plus set React state
      // for the HTML tooltip. No full re-render.
      node.on('mouseenter', function (event: MouseEvent) {
        const el = d3.select(this);
        const baseR = +el.attr('data-base-r');
        const baseSW = +el.attr('data-base-sw');
        el.attr('r', baseR + 2).attr('stroke-width', baseSW + 1);

        // Highlight connected citation edges
        svg.selectAll('.citation-lines line').each(function () {
          const line = d3.select(this);
          if (+line.attr('data-citing') === p.id || +line.attr('data-cited') === p.id) {
            line.attr('stroke', 'var(--accent-hover)')
              .attr('stroke-width', 3)
              .attr('stroke-opacity', 1);
          }
        });
        svg.selectAll('.citation-lines polygon').each(function () {
          const poly = d3.select(this);
          if (+poly.attr('data-citing') === p.id || +poly.attr('data-cited') === p.id) {
            poly.attr('fill', 'var(--accent-hover)')
              .attr('opacity', 1);
          }
        });

        setHoveredPaperId(p.id);
        setTooltipPos({ x: event.clientX, y: event.clientY });
      });

      node.on('mousemove', function (event: MouseEvent) {
        setTooltipPos({ x: event.clientX, y: event.clientY });
      });

      node.on('mouseleave', function () {
        const el = d3.select(this);
        el.attr('r', el.attr('data-base-r'))
          .attr('stroke-width', el.attr('data-base-sw'));

        // Restore citation edges to their base style
        svg.selectAll('.citation-lines line').each(function () {
          const line = d3.select(this);
          const citing = +line.attr('data-citing');
          const cited = +line.attr('data-cited');
          let color = 'var(--text-muted)';
          let w = 1.5;
          let op = 0.5;
          worldlines.forEach(wl => {
            if (wl.paperIds.has(citing) && wl.paperIds.has(cited)) {
              color = wl.color; w = 2.5; op = 0.85;
            }
          });
          line.attr('stroke', color).attr('stroke-width', w).attr('stroke-opacity', op);
        });
        svg.selectAll('.citation-lines polygon').each(function () {
          const poly = d3.select(this);
          const citing = +poly.attr('data-citing');
          const cited = +poly.attr('data-cited');
          let color = 'var(--text-muted)';
          let op = 0.5;
          worldlines.forEach(wl => {
            if (wl.paperIds.has(citing) && wl.paperIds.has(cited)) {
              color = wl.color; op = 0.85;
            }
          });
          poly.attr('fill', color).attr('opacity', op);
        });

        setHoveredPaperId(null);
        setTooltipPos(null);
      });

      node.on('click', (event: MouseEvent) => {
        event.stopPropagation();
        // Delay toggle so a rapid second click (dblclick) can cancel it
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          toggleSelection(p.id);
        }, 250);
      });

      node.on('dblclick', (event: MouseEvent) => {
        event.stopPropagation();
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        onOpenPaperRef.current(p);
      });

      // Right-click drag: start
      node.on('mousedown', function (event: MouseEvent) {
        if (event.button === 2) {
          event.preventDefault();
          event.stopPropagation();
          dragSrcRef.current = p.id;

          // Highlight source node
          const el = d3.select(this);
          el.attr('stroke', 'var(--warning)')
            .attr('stroke-width', 3)
            .attr('r', +el.attr('data-base-r') + 3);

          // Create drag line
          const startX = xScale(pos.x);
          const startY = yScale(pos.y);
          const line = chartArea.append('line')
            .attr('class', 'drag-citation-line')
            .attr('x1', startX)
            .attr('y1', startY)
            .attr('x2', startX)
            .attr('y2', startY)
            .attr('stroke', 'var(--accent)')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('pointer-events', 'none');
          dragLineRef.current = line.node();
        }
      });

      // Right-click drag: drop on target node
      node.on('mouseup', async function (event: MouseEvent) {
        if (event.button === 2 && dragSrcRef.current !== null && dragSrcRef.current !== p.id) {
          event.preventDefault();
          event.stopPropagation();

          const srcId = dragSrcRef.current;
          const tgtId = p.id;

          // Clean up drag visual
          if (dragLineRef.current) {
            d3.select(dragLineRef.current).remove();
            dragLineRef.current = null;
          }
          dragSrcRef.current = null;

          // Check if citation exists (in either direction)
          const existing = citationsRef.current.find(
            c => (c.citing_paper_id === srcId && c.cited_paper_id === tgtId) ||
                 (c.citing_paper_id === tgtId && c.cited_paper_id === srcId)
          );

          if (existing) {
            try {
              await api.removeCitation(existing.citing_paper_id, existing.cited_paper_id);
              showNotification('Citation removed');
              await loadData();
            } catch (err: any) {
              showNotification(err.message || 'Failed to remove citation');
            }
          } else {
            try {
              await api.addCitation(srcId, tgtId);
              showNotification('Citation added');
              await loadData();
            } catch (err: any) {
              showNotification(err.message || 'Failed to add citation');
            }
          }
        }
      });
    });

    // SVG-level mousemove for drag line tracking
    svg.on('mousemove.citedrag', function (event: MouseEvent) {
      if (dragSrcRef.current === null || !dragLineRef.current) return;

      const svgNode = svg.node()!;
      const point = svgNode.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svgNode.getScreenCTM()!.inverse());

      const transform = d3.zoomTransform(svgNode);
      const chartX = (svgPoint.x - margin.left - transform.x) / transform.k;
      const chartY = (svgPoint.y - margin.top - transform.y) / transform.k;

      d3.select(dragLineRef.current)
        .attr('x2', chartX)
        .attr('y2', chartY);
    });

    // SVG-level mouseup to cancel drag on empty space
    svg.on('mouseup.citedrag', function (event: MouseEvent) {
      if (event.button === 2 && dragSrcRef.current !== null) {
        if (dragLineRef.current) {
          d3.select(dragLineRef.current).remove();
          dragLineRef.current = null;
        }
        dragSrcRef.current = null;
      }
    });

    // Axis styling
    svg.selectAll('.wl-axis text')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '11px');
    svg.selectAll('.wl-axis line, .wl-axis path')
      .attr('stroke', 'var(--border-color)');

    // Y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -55)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '12px')
      .text('Publication Date');

  }, [papers, paperPositions, citations, worldlines, selectedPaperIds, showCitations, showWorldlines, showNonWorldlinePapers]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      // Force re-render by toggling a ref
      if (svgRef.current && containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        d3.select(svgRef.current).attr('width', width).attr('height', height);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSelection = (paperId: number) => {
    setSelectedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const handleCreateWorldline = async () => {
    if (!newWlName.trim()) return;
    try {
      const wl = await api.createWorldline(newWlName.trim(), newWlColor);
      // Add selected papers to this worldline
      const paperIds = Array.from(selectedPaperIds);
      for (let i = 0; i < paperIds.length; i++) {
        await api.addWorldlinePaper(wl.id, paperIds[i], i);
      }
      setNewWlName('');
      showNotification(`Created worldline "${wl.name}" with ${paperIds.length} papers`);
      setSelectedPaperIds(new Set());
      await loadData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create worldline');
    }
  };

  const handleDeleteWorldline = async (id: number) => {
    try {
      await api.deleteWorldline(id);
      if (activeWorldlineId === id) setActiveWorldlineId(null);
      showNotification('Worldline deleted');
      await loadData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to delete worldline');
    }
  };

  const handleAddPapersToWorldline = async (wlId: number) => {
    try {
      const wl = worldlines.find(w => w.id === wlId);
      const existingCount = wl?.paperIds.size || 0;
      const paperIds = Array.from(selectedPaperIds);
      for (let i = 0; i < paperIds.length; i++) {
        await api.addWorldlinePaper(wlId, paperIds[i], existingCount + i);
      }
      showNotification(`Added ${paperIds.length} papers to worldline`);
      setSelectedPaperIds(new Set());
      await loadData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to add papers');
    }
  };

  const handleRemovePaperFromWorldline = async (wlId: number, paperId: number) => {
    try {
      await api.removeWorldlinePaper(wlId, paperId);
      showNotification('Paper removed from worldline');
      await loadData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to remove paper');
    }
  };

  const handleSelectWorldlinePapers = (wl: WorldlineWithPapers) => {
    setSelectedPaperIds(new Set(wl.paperIds));
    setActiveWorldlineId(wl.id);
  };

  const handleDeletePaper = async (paper: SavedPaper) => {
    if (!confirm(`Delete "${paper.title}" from your library?`)) return;
    try {
      await api.deletePaper(paper.id);
      showNotification('Paper deleted');
      await onRefresh();
      await loadData();
    } catch {
      showNotification('Failed to delete paper');
    }
  };

  // Discover citations from Semantic Scholar
  const handleDiscoverCitations = async (paperId: number) => {
    const paper = papers.find(p => p.id === paperId);
    if (!paper) return;

    setDiscoveryLoading(true);
    setDiscoveryPaperId(paperId);
    setDiscoveryResult(null);

    try {
      const result = await api.discoverCitations(paper.arxiv_id);
      setDiscoveryResult(result);
    } catch (err: any) {
      showNotification(err.message || 'Failed to discover citations');
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // Import a paper from Semantic Scholar results
  const handleImportPaper = async (
    s2Paper: SemanticScholarPaper,
    direction: 'cites' | 'cited_by'
  ) => {
    const arxivId = s2Paper.externalIds?.ArXiv;
    if (!arxivId || !discoveryPaperId) return;

    setImportingIds(prev => new Set(prev).add(arxivId));
    try {
      await api.importCitedPaper(arxivId, discoveryPaperId, direction);
      showNotification(`Added "${s2Paper.title.substring(0, 40)}..." to library with citation`);
      await onRefresh();
      await loadData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to import paper');
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(arxivId);
        return next;
      });
    }
  };

  // Clear discovery when selection changes
  useEffect(() => {
    if (selectedPaperIds.size !== 1) {
      setDiscoveryResult(null);
      setDiscoveryPaperId(null);
    }
  }, [selectedPaperIds]);

  // Check if a Semantic Scholar paper is already in our library
  const isInLibrary = useCallback((s2Paper: SemanticScholarPaper): boolean => {
    const arxivId = s2Paper.externalIds?.ArXiv;
    if (!arxivId) return false;
    return papers.some(p => p.arxiv_id === arxivId);
  }, [papers]);

  // Batch import: save papers, infer citations, create or add to worldline
  const handleBatchImport = async () => {
    const ids = importArxivIds
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (ids.length === 0) {
      showNotification('Enter at least one ArXiv ID');
      return;
    }
    if (importWlMode === 'new' && !importWlName.trim()) {
      showNotification('Enter a worldline name');
      return;
    }
    if (importWlMode === 'existing' && importExistingWlId === null) {
      showNotification('Select an existing worldline');
      return;
    }

    setImportLoading(true);
    setImportStatus(`Importing ${ids.length} papers and inferring citations...`);
    try {
      const wlArg = importWlMode === 'existing'
        ? { id: importExistingWlId! }
        : { name: importWlName.trim(), color: importWlColor };
      const result = await api.batchImportWorldline(ids, wlArg);
      const parts: string[] = [];
      parts.push(`${result.papers_added} papers added`);
      parts.push(`${result.citations_created} citations inferred`);
      if (result.errors.length > 0) {
        parts.push(`${result.errors.length} errors`);
      }
      setImportStatus(`Done: ${parts.join(', ')}`);
      const wlLabel = importWlMode === 'existing'
        ? worldlines.find(w => w.id === importExistingWlId)?.name || 'worldline'
        : importWlName.trim();
      if (result.errors.length > 0) {
        showNotification(`Import finished with errors: ${result.errors.join('; ')}`);
      } else {
        showNotification(`Worldline "${wlLabel}" — ${result.papers_added} papers, ${result.citations_created} citations`);
      }
      setImportArxivIds('');
      setImportWlName('');
      await onRefresh();
      await loadData();
    } catch (err: any) {
      setImportStatus(null);
      showNotification(err.message || 'Batch import failed');
    } finally {
      setImportLoading(false);
    }
  };

  // Get short first author name
  const getFirstAuthor = (p: SavedPaper): string => {
    try {
      const authors = JSON.parse(p.authors) as string[];
      if (authors.length === 0) return 'Unknown';
      const name = authors[0];
      const parts = name.split(' ');
      return parts[parts.length - 1] + (authors.length > 1 ? ' et al.' : '');
    } catch {
      return 'Unknown';
    }
  };

  const getYear = (p: SavedPaper): string => {
    return new Date(p.published).getFullYear().toString();
  };

  if (papers.length === 0) {
    return (
      <div className="worldline-panel">
        <div className="empty-state">
          No papers in library. Save papers from the Browse tab to visualize citation worldlines.
        </div>
      </div>
    );
  }

  return (
    <div className="worldline-panel">
      {/* Visualization area */}
      <div className="wl-main">
        <div className="wl-chart" ref={containerRef}>
          <svg ref={svgRef} />
          {/* HTML tooltip — rendered outside SVG, pointer-events: none */}
          {hoveredPaperId !== null && tooltipPos && (() => {
            const hp = papers.find(p => p.id === hoveredPaperId);
            if (!hp) return null;
            const displayTitle = hp.title.length > 80 ? hp.title.substring(0, 77) + '...' : hp.title;
            const dateStr = new Date(hp.published).toLocaleDateString();
            const chartRect = containerRef.current?.getBoundingClientRect();
            if (!chartRect) return null;
            return (
              <div
                className="wl-tooltip"
                style={{
                  left: tooltipPos.x - chartRect.left,
                  top: tooltipPos.y - chartRect.top - 45,
                }}
              >
                <div className="wl-tooltip-title"><LaTeX>{displayTitle}</LaTeX></div>
                <div className="wl-tooltip-date">{getFirstAuthor(hp)} &middot; {dateStr}</div>
              </div>
            );
          })()}
        </div>

        {/* Toggle sidebar */}
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Hide panel' : 'Show panel'}
        >
          {sidebarOpen ? '\u25B6' : '\u25C0'}
        </button>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="wl-sidebar">
            {/* Mode selector */}
            <div className="wl-mode-bar">
              <button
                className={`btn btn-sm ${mode === 'select' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('select')}
              >
                Select
              </button>
              <button
                className={`btn btn-sm ${mode === 'import' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('import')}
                title="Batch import ArXiv papers into a worldline"
              >
                Import
              </button>
              <button
                className={`btn btn-sm ${mode === 'view' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('view')}
                title="Visibility settings"
              >
                View
              </button>
            </div>

            {/* Batch import form */}
            {mode === 'import' && (
              <div className="wl-section wl-import-section">
                <h4>Batch Import Worldline</h4>
                <p className="wl-import-hint">
                  Paste ArXiv IDs (one per line or comma-separated). Papers will be saved to the library with citations inferred from Semantic Scholar.
                </p>
                <textarea
                  className="wl-import-textarea"
                  placeholder={"2301.00001\n2302.12345\n2303.54321"}
                  value={importArxivIds}
                  onChange={e => setImportArxivIds(e.target.value)}
                  rows={6}
                  disabled={importLoading}
                />

                <div className="wl-import-wl-toggle">
                  <button
                    className={`btn btn-sm ${importWlMode === 'new' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setImportWlMode('new')}
                    disabled={importLoading}
                  >
                    New Worldline
                  </button>
                  <button
                    className={`btn btn-sm ${importWlMode === 'existing' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setImportWlMode('existing')}
                    disabled={importLoading || worldlines.length === 0}
                    title={worldlines.length === 0 ? 'No existing worldlines' : ''}
                  >
                    Existing
                  </button>
                </div>

                {importWlMode === 'new' && (
                  <div className="wl-import-form-row">
                    <input
                      type="text"
                      className="wl-import-name"
                      placeholder="Worldline name..."
                      value={importWlName}
                      onChange={e => setImportWlName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !importLoading && handleBatchImport()}
                      disabled={importLoading}
                    />
                    <input
                      type="color"
                      value={importWlColor}
                      onChange={e => setImportWlColor(e.target.value)}
                      disabled={importLoading}
                    />
                  </div>
                )}

                {importWlMode === 'existing' && (
                  <select
                    className="wl-import-select"
                    value={importExistingWlId ?? ''}
                    onChange={e => setImportExistingWlId(e.target.value ? Number(e.target.value) : null)}
                    disabled={importLoading}
                  >
                    <option value="">Select a worldline...</option>
                    {worldlines.map(wl => (
                      <option key={wl.id} value={wl.id}>
                        {wl.name} ({wl.paperIds.size} papers)
                      </option>
                    ))}
                  </select>
                )}

                <button
                  className="btn btn-primary wl-import-submit"
                  onClick={handleBatchImport}
                  disabled={
                    importLoading ||
                    !importArxivIds.trim() ||
                    (importWlMode === 'new' && !importWlName.trim()) ||
                    (importWlMode === 'existing' && importExistingWlId === null)
                  }
                >
                  {importLoading
                    ? 'Importing...'
                    : importWlMode === 'new'
                      ? 'Create Worldline'
                      : 'Add to Worldline'}
                </button>
                {importStatus && (
                  <div className="wl-import-status">{importStatus}</div>
                )}
              </div>
            )}

            {/* Visibility toggles */}
            {mode === 'view' && (
              <div className="wl-section wl-view-section">
                <h4>Visibility</h4>
                <label className="wl-toggle-row">
                  <input
                    type="checkbox"
                    checked={showCitations}
                    onChange={() => setShowCitations(v => !v)}
                  />
                  <span>Citation Arrows</span>
                </label>
                <label className="wl-toggle-row">
                  <input
                    type="checkbox"
                    checked={showWorldlines}
                    onChange={() => setShowWorldlines(v => !v)}
                  />
                  <span>Worldline Paths</span>
                </label>
                <label className="wl-toggle-row">
                  <input
                    type="checkbox"
                    checked={showNonWorldlinePapers}
                    onChange={() => setShowNonWorldlinePapers(v => !v)}
                  />
                  <span>Unassigned Papers</span>
                </label>
              </div>
            )}

            {/* Selected papers */}
            {mode === 'select' && (
              <div className="wl-section">
                <div className="wl-section-header">
                  <h4>Selected ({selectedPaperIds.size})</h4>
                  {selectedPaperIds.size > 0 && (
                    <button className="btn-link" onClick={() => setSelectedPaperIds(new Set())}>
                      Clear
                    </button>
                  )}
                </div>
                {selectedPaperIds.size > 0 && (
                  <div className="wl-selected-list">
                    {Array.from(selectedPaperIds).map(id => {
                      const p = papers.find(pp => pp.id === id);
                      if (!p) return null;
                      return (
                        <div key={id} className="wl-selected-item">
                          <span className="wl-selected-name" title={p.title}>
                            {getFirstAuthor(p)} ({getYear(p)})
                          </span>
                          <button
                            className="btn-icon btn-danger-icon"
                            onClick={() => toggleSelection(id)}
                            title="Deselect"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Create worldline from selection */}
                {selectedPaperIds.size >= 1 && (
                  <div className="wl-create-form">
                    <input
                      type="text"
                      value={newWlName}
                      onChange={e => setNewWlName(e.target.value)}
                      placeholder="Worldline name..."
                      onKeyDown={e => e.key === 'Enter' && handleCreateWorldline()}
                    />
                    <input
                      type="color"
                      value={newWlColor}
                      onChange={e => setNewWlColor(e.target.value)}
                    />
                    <button
                      className="btn btn-sm btn-success"
                      onClick={handleCreateWorldline}
                      disabled={!newWlName.trim()}
                    >
                      Create
                    </button>
                  </div>
                )}

                {/* Add to existing worldline */}
                {selectedPaperIds.size > 0 && worldlines.length > 0 && (
                  <div className="wl-add-to-existing">
                    <span className="wl-label">Add to:</span>
                    {worldlines.map(wl => (
                      <button
                        key={wl.id}
                        className="btn btn-sm"
                        style={{ background: wl.color, color: '#fff' }}
                        onClick={() => handleAddPapersToWorldline(wl.id)}
                        title={`Add selected papers to "${wl.name}"`}
                      >
                        {wl.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Citations Discovery Panel */}
            {selectedPaperIds.size === 1 && (() => {
              const selectedId = Array.from(selectedPaperIds)[0];
              const selectedPaper = papers.find(p => p.id === selectedId);
              if (!selectedPaper) return null;

              // Filter and paginate discovery results
              const currentList = discoveryResult && discoveryPaperId === selectedId
                ? (discoveryTab === 'citations' ? discoveryResult.citations : discoveryResult.references)
                : [];
              const searchLower = discoverySearch.toLowerCase();
              const filtered = searchLower
                ? currentList.filter(s2p =>
                    s2p.title.toLowerCase().includes(searchLower) ||
                    (s2p.authors || []).some(a => a.name.toLowerCase().includes(searchLower))
                  )
                : currentList;
              const totalPages = Math.max(1, Math.ceil(filtered.length / DISCOVERY_PAGE_SIZE));
              const safePage = Math.min(discoveryPage, totalPages - 1);
              const pageItems = filtered.slice(safePage * DISCOVERY_PAGE_SIZE, (safePage + 1) * DISCOVERY_PAGE_SIZE);

              return (
                <div className="wl-section wl-discover-section">
                  <div className="wl-section-header">
                    <h4>Discover Citations</h4>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleDiscoverCitations(selectedId)}
                      disabled={discoveryLoading}
                    >
                      {discoveryLoading ? 'Loading...' : discoveryPaperId === selectedId && discoveryResult ? 'Refresh' : 'Fetch'}
                    </button>
                  </div>
                  <div className="wl-discover-paper-name" title={selectedPaper.title}>
                    <LaTeX>{selectedPaper.title.length > 60 ? selectedPaper.title.substring(0, 57) + '...' : selectedPaper.title}</LaTeX>
                  </div>

                  {discoveryLoading && (
                    <div className="wl-discover-loading">Querying Semantic Scholar...</div>
                  )}

                  {discoveryResult && discoveryPaperId === selectedId && (
                    <>
                      <div className="wl-discover-tabs">
                        <button
                          className={`btn btn-sm ${discoveryTab === 'citations' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => { setDiscoveryTab('citations'); setDiscoveryPage(0); }}
                        >
                          Cited by ({discoveryResult.citations.length})
                        </button>
                        <button
                          className={`btn btn-sm ${discoveryTab === 'references' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => { setDiscoveryTab('references'); setDiscoveryPage(0); }}
                        >
                          References ({discoveryResult.references.length})
                        </button>
                      </div>

                      <input
                        type="text"
                        className="wl-discover-search"
                        placeholder="Filter by title or author..."
                        value={discoverySearch}
                        onChange={e => { setDiscoverySearch(e.target.value); setDiscoveryPage(0); }}
                      />

                      <div className="wl-discover-list">
                        {pageItems.map((s2p, idx) => {
                          const arxivId = s2p.externalIds?.ArXiv;
                          const inLib = isInLibrary(s2p);
                          const importing = arxivId ? importingIds.has(arxivId) : false;
                          const authorStr = s2p.authors?.slice(0, 2).map(a => a.name).join(', ') || 'Unknown';
                          const direction = discoveryTab === 'citations' ? 'cited_by' as const : 'cites' as const;
                          const viewUrl = arxivId
                            ? `https://arxiv.org/abs/${arxivId}`
                            : s2p.url || `https://www.semanticscholar.org/paper/${s2p.paperId}`;

                          return (
                            <div key={s2p.paperId || idx} className="wl-discover-item">
                              <div className="wl-discover-item-info">
                                <span className="wl-discover-item-title" title={s2p.title}>
                                  {s2p.title.length > 50 ? s2p.title.substring(0, 47) + '...' : s2p.title}
                                </span>
                                <span className="wl-discover-item-meta">
                                  {authorStr}{s2p.year ? ` (${s2p.year})` : ''}
                                  {arxivId ? ' · arXiv' : ''}
                                </span>
                              </div>
                              <div className="wl-discover-item-actions">
                                <a
                                  className="btn btn-sm btn-secondary wl-discover-view-btn"
                                  href={viewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View paper"
                                >
                                  View
                                </a>
                                {arxivId && !inLib && (
                                  <button
                                    className="btn btn-sm btn-success wl-discover-import-btn"
                                    onClick={() => handleImportPaper(s2p, direction)}
                                    disabled={importing}
                                    title="Add to library with citation link"
                                  >
                                    {importing ? '...' : '+'}
                                  </button>
                                )}
                                {inLib && (
                                  <span className="wl-discover-in-lib" title="Already in library">&#10003;</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filtered.length === 0 && (
                          <p className="muted">
                            {discoverySearch ? 'No matches.' : `No ${discoveryTab} found.`}
                          </p>
                        )}
                      </div>

                      {totalPages > 1 && (
                        <div className="wl-discover-pager">
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={safePage === 0}
                            onClick={() => setDiscoveryPage(safePage - 1)}
                          >
                            Prev
                          </button>
                          <span className="wl-discover-pager-info">
                            {safePage + 1} / {totalPages}
                          </span>
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={safePage >= totalPages - 1}
                            onClick={() => setDiscoveryPage(safePage + 1)}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Worldlines list */}
            <div className="wl-section">
              <h4>Worldlines ({worldlines.length})</h4>
              {worldlines.length === 0 && (
                <p className="muted">Select papers and create a worldline to group them.</p>
              )}
              {worldlines.map(wl => (
                <div
                  key={wl.id}
                  className={`wl-item ${activeWorldlineId === wl.id ? 'active' : ''}`}
                >
                  <div className="wl-item-header">
                    <span
                      className="wl-item-dot"
                      style={{ background: wl.color }}
                    />
                    <span
                      className="wl-item-name"
                      onClick={() => handleSelectWorldlinePapers(wl)}
                      title="Click to select this worldline's papers"
                    >
                      {wl.name}
                    </span>
                    <span className="wl-item-count">{wl.paperIds.size}</span>
                    <button
                      className="btn-icon btn-danger-icon"
                      onClick={() => handleDeleteWorldline(wl.id)}
                      title="Delete worldline"
                    >
                      &times;
                    </button>
                  </div>
                  {activeWorldlineId === wl.id && (
                    <div className="wl-item-papers">
                      {Array.from(wl.paperIds).map(pid => {
                        const p = papers.find(pp => pp.id === pid);
                        if (!p) return null;
                        return (
                          <div key={pid} className="wl-item-paper">
                            <span title={p.title}>
                              {getFirstAuthor(p)} ({getYear(p)})
                            </span>
                            <button
                              className="btn-icon btn-danger-icon"
                              onClick={() => handleRemovePaperFromWorldline(wl.id, pid)}
                              title="Remove from worldline"
                            >
                              &times;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Paper list for reference */}
            <div className="wl-section">
              <h4
                className="wl-collapsible-header"
                onClick={() => setAllPapersOpen(prev => !prev)}
              >
                <span className={`wl-collapse-chevron ${allPapersOpen ? 'open' : ''}`}>{'\u25B6'}</span>
                All Papers ({papers.length})
              </h4>
              {allPapersOpen && (
                <div className="wl-paper-list">
                  {papers
                    .slice()
                    .sort((a, b) => new Date(a.published).getTime() - new Date(b.published).getTime())
                    .map(p => {
                      const isSelected = selectedPaperIds.has(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`wl-paper-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleSelection(p.id)}
                          onMouseEnter={() => setHoveredPaperId(p.id)}
                          onMouseLeave={() => setHoveredPaperId(null)}
                        >
                          <div className="wl-paper-item-info">
                            <span className="wl-paper-title" title={p.title}>
                              {p.title.length > 50 ? p.title.substring(0, 47) + '...' : p.title}
                            </span>
                            <span className="wl-paper-meta-small">
                              {getFirstAuthor(p)} &middot; {getYear(p)}
                            </span>
                          </div>
                          <button
                            className="btn-icon btn-danger-icon wl-paper-delete-btn"
                            onClick={(e) => { e.stopPropagation(); handleDeletePaper(p); }}
                            title="Delete from library"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
