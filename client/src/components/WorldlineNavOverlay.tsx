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

const TRANSITION_MS = 360;

type Slot =
  | 'center'
  | 'right'
  | 'leaving-left'
  | 'incoming-from-right'
  | 'peek-incoming'
  | 'incoming-from-left'
  | 'moving-to-right'
  | 'leaving-right';

type AnimState = { direction: 'forward' | 'backward'; leavingIdx: number } | null;

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

interface CardProps {
  wl: WorldlineWithPapers;
  slot: Slot;
  isInteractive: boolean;
  currentPaperId: number;
  selectedIdx: number;
  selectedRowRef?: React.RefObject<HTMLDivElement>;
  onHoverRow?: (idx: number) => void;
  onClickRow?: (p: SavedPaper) => void;
}

function WorldlineCard({
  wl,
  slot,
  isInteractive,
  currentPaperId,
  selectedIdx,
  selectedRowRef,
  onHoverRow,
  onClickRow,
}: CardProps) {
  return (
    <div className={`wl-nav-carousel-item slot-${slot}`} aria-hidden={!isInteractive}>
      <div className="wl-nav-title" style={{ color: wl.color }}>
        {wl.name}
      </div>
      <div
        className="wl-nav-list"
        style={{ '--wl-color': wl.color } as React.CSSProperties}
      >
        {wl.papers.map((p, idx) => {
          const isCurrent = p.id === currentPaperId;
          const isSelected = isInteractive && idx === selectedIdx;
          return (
            <div
              key={p.id}
              ref={isSelected ? selectedRowRef : undefined}
              className={`wl-nav-row ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
              onMouseEnter={isInteractive && onHoverRow ? () => onHoverRow(idx) : undefined}
              onClick={isInteractive && onClickRow ? () => onClickRow(p) : undefined}
            >
              <span
                className="wl-nav-row-dot"
                style={{
                  background: isCurrent ? wl.color : 'var(--bg-primary)',
                  borderColor: wl.color,
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
    </div>
  );
}

export default function WorldlineNavOverlay({ paper, onOpenPaper, onClose, showNotification }: Props) {
  const [worldlines, setWorldlines] = useState<WorldlineWithPapers[]>([]);
  const [loading, setLoading] = useState(true);
  const [worldlineIdx, setWorldlineIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [anim, setAnim] = useState<AnimState>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => {
    if (animTimer.current) clearTimeout(animTimer.current);
  }, []);

  const N = worldlines.length;
  const activeWorldline = worldlines[worldlineIdx];

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
        if (N < 2 || anim !== null) return;
        const forward = !e.shiftKey;
        const oldIdx = worldlineIdx;
        const newIdx = forward ? (oldIdx + 1) % N : (oldIdx - 1 + N) % N;
        setAnim({ direction: forward ? 'forward' : 'backward', leavingIdx: oldIdx });
        setWorldlineIdx(newIdx);
        const newWl = worldlines[newIdx];
        const here = newWl.papers.findIndex(p => p.id === paper.id);
        setSelectedIdx(here >= 0 ? here : 0);
        if (animTimer.current) clearTimeout(animTimer.current);
        animTimer.current = setTimeout(() => setAnim(null), TRANSITION_MS);
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
      if (e.key.length === 1) {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeWorldline, worldlines, worldlineIdx, selectedIdx, paper.id, onClose, onOpenPaper, N, anim]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIdx, worldlineIdx]);

  type RenderItem = { wl: WorldlineWithPapers; slot: Slot; isInteractive: boolean };
  const items: RenderItem[] = [];
  if (activeWorldline) {
    if (anim === null) {
      items.push({ wl: activeWorldline, slot: 'center', isInteractive: true });
      if (N >= 2) {
        const peekIdx = (worldlineIdx + 1) % N;
        items.push({ wl: worldlines[peekIdx], slot: 'right', isInteractive: false });
      }
    } else if (anim.direction === 'forward') {
      items.push({ wl: worldlines[anim.leavingIdx], slot: 'leaving-left', isInteractive: false });
      items.push({ wl: activeWorldline, slot: 'incoming-from-right', isInteractive: true });
      if (N >= 2) {
        const newPeekIdx = (worldlineIdx + 1) % N;
        items.push({ wl: worldlines[newPeekIdx], slot: 'peek-incoming', isInteractive: false });
      }
    } else {
      items.push({ wl: activeWorldline, slot: 'incoming-from-left', isInteractive: true });
      items.push({ wl: worldlines[anim.leavingIdx], slot: 'moving-to-right', isInteractive: false });
      if (N >= 2) {
        const oldPeekIdx = (anim.leavingIdx + 1) % N;
        items.push({ wl: worldlines[oldPeekIdx], slot: 'leaving-right', isInteractive: false });
      }
    }
  }

  return (
    <div className="wl-nav-overlay" onClick={onClose}>
      <div className="wl-nav-carousel" onClick={e => e.stopPropagation()}>
        {loading && <div className="wl-nav-loading">Loading worldlines...</div>}
        {!loading && items.map(({ wl, slot, isInteractive }) => (
          <WorldlineCard
            key={`${wl.id}-${slot}`}
            wl={wl}
            slot={slot}
            isInteractive={isInteractive}
            currentPaperId={paper.id}
            selectedIdx={selectedIdx}
            selectedRowRef={isInteractive ? selectedRowRef : undefined}
            onHoverRow={isInteractive ? (idx) => setSelectedIdx(idx) : undefined}
            onClickRow={isInteractive ? (p) => {
              if (p.id !== paper.id) onOpenPaper(p);
              onClose();
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
