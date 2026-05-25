import { useState, useEffect, useRef } from 'react';
import { SavedPaper, Worldline } from '../types';
import * as api from '../services/api';
import LaTeX from './LaTeX';

interface Props {
  paper: SavedPaper;
  onOpenPaper: (paper: SavedPaper) => void;
  onClose: () => void;
  showNotification: (msg: string) => void;
}

interface WorldlineWithPapers extends Worldline {
  papers: SavedPaper[];
}

function getFirstAuthor(p: SavedPaper): string {
  try {
    const authors = JSON.parse(p.authors) as string[];
    if (authors.length === 0) return 'Unknown';
    const name = authors[0];
    const parts = name.split(' ');
    return parts[parts.length - 1] + (authors.length > 1 ? ' et al.' : '');
  } catch {
    return 'Unknown';
  }
}

function getYear(p: SavedPaper): string {
  return new Date(p.published).getFullYear().toString();
}

export default function WorldlineNavOverlay({ paper, onOpenPaper, onClose, showNotification }: Props) {
  const [worldlines, setWorldlines] = useState<WorldlineWithPapers[]>([]);
  const [loading, setLoading] = useState(true);
  const [worldlineIdx, setWorldlineIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await api.getWorldlines();
        const results: WorldlineWithPapers[] = [];
        for (const wl of all) {
          const wlPapers = await api.getWorldlinePapers(wl.id);
          if (wlPapers.some(p => p.id === paper.id)) {
            wlPapers.sort((a, b) => new Date(a.published).getTime() - new Date(b.published).getTime());
            results.push({ ...wl, papers: wlPapers });
          }
        }
        if (cancelled) return;
        setWorldlines(results);
        if (results.length === 0) {
          showNotification('This paper does not belong to any worldline');
          onClose();
          return;
        }
        const initialPaperIdx = results[0].papers.findIndex(p => p.id === paper.id);
        setSelectedIdx(initialPaperIdx >= 0 ? initialPaperIdx : 0);
      } catch {
        if (cancelled) return;
        showNotification('Failed to load worldlines');
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paper.id, onClose, showNotification]);

  const activeWorldline = worldlines[worldlineIdx];

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (!activeWorldline) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (worldlineIdx + dir + worldlines.length) % worldlines.length;
        setWorldlineIdx(nextIdx);
        const wl = worldlines[nextIdx];
        const here = wl.papers.findIndex(p => p.id === paper.id);
        setSelectedIdx(here >= 0 ? here : 0);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIdx(i => Math.min(activeWorldline.papers.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIdx(i => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const target = activeWorldline.papers[selectedIdx];
        if (target && target.id !== paper.id) {
          onOpenPaper(target);
        }
        onClose();
        return;
      }
      // Swallow other keys so they don't trigger viewer shortcuts (tiers, etc)
      if (e.key.length === 1) {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeWorldline, worldlines, worldlineIdx, selectedIdx, paper.id, onClose, onOpenPaper]);

  // Keep selected row in view as it changes
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIdx, worldlineIdx]);

  return (
    <div className="wl-nav-overlay" onClick={onClose}>
      <div className="wl-nav-panel" onClick={e => e.stopPropagation()}>
        {loading && <div className="wl-nav-loading">Loading worldlines...</div>}
        {!loading && activeWorldline && (
          <>
            <div
              className="wl-nav-title"
              style={{ color: activeWorldline.color }}
            >
              {activeWorldline.name}
            </div>
            <div
              className="wl-nav-list"
              style={{ '--wl-color': activeWorldline.color } as React.CSSProperties}
            >
              {activeWorldline.papers.map((p, idx) => {
                const isCurrent = p.id === paper.id;
                const isSelected = idx === selectedIdx;
                return (
                  <div
                    key={p.id}
                    ref={isSelected ? selectedRowRef : undefined}
                    className={`wl-nav-row ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => {
                      if (!isCurrent) onOpenPaper(p);
                      onClose();
                    }}
                  >
                    <span
                      className="wl-nav-row-dot"
                      style={{
                        background: isCurrent ? activeWorldline.color : 'var(--bg-primary)',
                        borderColor: activeWorldline.color,
                      }}
                    />
                    <div className="wl-nav-row-info">
                      <div className="wl-nav-row-title">
                        <LaTeX>{p.title}</LaTeX>
                      </div>
                      <div className="wl-nav-row-meta">
                        {getFirstAuthor(p)} &middot; {getYear(p)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
