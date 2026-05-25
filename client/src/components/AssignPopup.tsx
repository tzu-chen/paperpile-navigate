import { useState, useEffect, useRef, useMemo } from 'react';
import { Tag, Worldline } from '../types';
import * as api from '../services/api';

interface Props {
  selectedPaperIds: Set<number>;
  worldlines: Worldline[];
  tags: Tag[];
  tagsByPaper: Record<number, number[]>;
  worldlinesByPaper: Record<number, number[]>;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
  showNotification: (msg: string) => void;
}

type AppliedState = 'all' | 'partial' | 'none';

type Item = {
  kind: 'worldline' | 'tag';
  id: number;
  name: string;
  color: string;
  applied: AppliedState;
  appliedCount: number;
};

export default function AssignPopup({
  selectedPaperIds,
  worldlines,
  tags,
  tagsByPaper,
  worldlinesByPaper,
  onClose,
  onApplied,
  showNotification,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [applying, setApplying] = useState(false);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  const selectedSize = selectedPaperIds.size;

  const allItems: Item[] = useMemo(() => {
    const paperIds = Array.from(selectedPaperIds);
    function appliedFor(getIds: (paperId: number) => number[] | undefined, targetId: number): { state: AppliedState; count: number } {
      let count = 0;
      for (const pid of paperIds) {
        const ids = getIds(pid);
        if (ids && ids.includes(targetId)) count++;
      }
      let state: AppliedState = 'none';
      if (count === selectedSize && selectedSize > 0) state = 'all';
      else if (count > 0) state = 'partial';
      return { state, count };
    }

    const wlItems: Item[] = worldlines.map(w => {
      const { state, count } = appliedFor(pid => worldlinesByPaper[pid], w.id);
      return { kind: 'worldline', id: w.id, name: w.name, color: w.color, applied: state, appliedCount: count };
    });
    const tagItems: Item[] = tags.map(t => {
      const { state, count } = appliedFor(pid => tagsByPaper[pid], t.id);
      return { kind: 'tag', id: t.id, name: t.name, color: t.color, applied: state, appliedCount: count };
    });
    return [...wlItems, ...tagItems];
  }, [worldlines, tags, worldlinesByPaper, tagsByPaper, selectedPaperIds, selectedSize]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? allItems.filter(it => it.name.toLowerCase().includes(q)) : allItems;
    // Stable partition: applied (all > partial) first, then unapplied. Preserve original order within groups.
    const rank = (s: AppliedState) => (s === 'all' ? 0 : s === 'partial' ? 1 : 2);
    return matched.slice().sort((a, b) => rank(a.applied) - rank(b.applied));
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  async function applyItem(item: Item) {
    if (applying) return;
    setApplying(true);
    const paperIds = Array.from(selectedPaperIds);
    try {
      if (item.kind === 'tag') {
        const result = await api.bulkAddTag(paperIds, item.id);
        showNotification(`Applied "${item.name}" to ${result.applied} paper(s)`);
      } else {
        const existing = await api.getWorldlinePapers(item.id);
        const existingIds = new Set(existing.map(p => p.id));
        const toAdd = paperIds.filter(id => !existingIds.has(id));
        for (let i = 0; i < toAdd.length; i++) {
          await api.addWorldlinePaper(item.id, toAdd[i], existing.length + i);
        }
        const skipped = paperIds.length - toAdd.length;
        const msg = skipped > 0
          ? `Added ${toAdd.length} to "${item.name}" (${skipped} already in worldline)`
          : `Added ${toAdd.length} paper(s) to "${item.name}"`;
        showNotification(msg);
      }
      await onApplied();
      onClose();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to apply');
      setApplying(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(Math.max(filtered.length - 1, 0), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selectedIdx];
      if (item) applyItem(item);
    }
  }

  return (
    <div className="assign-popup-overlay" onClick={onClose}>
      <div className="assign-popup" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          className="assign-popup-search"
          placeholder={`Apply worldline or tag to ${selectedSize} paper(s)…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="assign-popup-list">
          {filtered.length === 0 ? (
            <div className="assign-popup-empty">
              {allItems.length === 0 ? 'No worldlines or tags yet' : 'No matches'}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIdx;
              const appliedLabel =
                item.applied === 'all'
                  ? 'Applied'
                  : item.applied === 'partial'
                    ? `Applied to ${item.appliedCount}/${selectedSize}`
                    : null;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  ref={isSelected ? selectedRowRef : undefined}
                  className={`assign-popup-row${isSelected ? ' selected' : ''} applied-${item.applied}`}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => applyItem(item)}
                >
                  <span className="assign-popup-dot" style={{ background: item.color }} />
                  <span className="assign-popup-name">{item.name}</span>
                  {appliedLabel && (
                    <span className={`assign-popup-applied applied-${item.applied}`}>
                      {item.applied === 'all' && <span className="assign-popup-check">✓</span>}
                      {appliedLabel}
                    </span>
                  )}
                  <span className={`assign-popup-kind assign-popup-kind-${item.kind}`}>
                    {item.kind}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
