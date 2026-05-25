import { useState, useEffect, useCallback, useRef } from 'react';
import { SavedPaper, Tag, Worldline } from '../types';
import * as api from '../services/api';
import LaTeX from './LaTeX';
import ImportPanel from './ImportPanel';

interface Props {
  papers: SavedPaper[];
  tags: Tag[];
  onOpenPaper: (paper: SavedPaper) => void;
  onRefresh: () => Promise<void>;
  showNotification: (msg: string) => void;
  favoriteAuthorNames: Set<string>;
  onFavoriteAuthor: (name: string) => void;
  onSearchAuthor: (name: string) => void;
}

const TIER_LABELS: Record<number, string> = {
  0: 'T0',
  1: 'T1',
  2: 'T2',
  3: 'T3',
  4: 'T4',
};

const TIER_RUBRIC: { tier: string; name: string; body: string }[] = [
  {
    tier: 'T0',
    name: 'Mirror',
    body: "Reshaped the field. If you removed this paper, a chunk of subsequent work doesn't exist or looks very different. Decade+ of citations, named techniques, textbook entry. Polish is irrelevant at this tier — the idea carries it. Expect <1% of saves.",
  },
  {
    tier: 'T1',
    name: 'Exalted',
    body: "Major contribution. Introduced a technique, framework, or result that's now standard in a subfield. Heavily cited, well-written, you'd hand it to someone entering the area. Not civilization-altering, but the subfield genuinely pivoted. Roughly the top ~5%.",
  },
  {
    tier: 'T2',
    name: 'Rare',
    body: 'Solid, important work you actively want to remember. Either (a) a clean novel result, (b) a definitive survey/benchmark, or (c) a paper that changed your thinking even if the field shrugged. Polish matters here — a T2 should be worth re-reading. ~15–20%.',
  },
  {
    tier: 'T3',
    name: 'Magic',
    body: "Competent contribution. Fills in a gap, replicates with a twist, useful negative result, or a well-executed application. You're glad you read it; you probably won't revisit. The bulk of decent papers. ~50%.",
  },
  {
    tier: 'T4',
    name: 'Normal',
    body: 'Minor or narrow. Incremental, niche, or only mattered for one citation you needed. Worth keeping for completeness, not for re-reading. ~25%.',
  },
];

type TierFilter = number | 'ungraded' | null;

export default function Library({ papers, tags, onOpenPaper, onRefresh, showNotification, favoriteAuthorNames, onFavoriteAuthor, onSearchAuthor }: Props) {
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterWorldline, setFilterWorldline] = useState<number | null>(null);
  const [filterTier, setFilterTier] = useState<TierFilter>(null);
  const [showTierRubric, setShowTierRubric] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [creatingTag, setCreatingTag] = useState(false);
  const [taggedPaperIds, setTaggedPaperIds] = useState<Set<number> | null>(null);

  // Tag editing state
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tag: Tag } | null>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const editTagInputRef = useRef<HTMLInputElement>(null);
  const [worldlinePaperIds, setWorldlinePaperIds] = useState<Set<number> | null>(null);
  const [filterWorldlines, setFilterWorldlines] = useState<Worldline[]>([]);

  // Import panel state
  const [showImport, setShowImport] = useState(false);

  // Export choice state (revealed after clicking Export with selection)
  const [showExportChoice, setShowExportChoice] = useState(false);

  // Bulk selection state
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  // Mobile actions toggle
  const [showMobileActions, setShowMobileActions] = useState(false);

  useEffect(() => {
    if (filterTag === null) {
      setTaggedPaperIds(null);
      return;
    }
    api.getSavedPapers({ tag_id: filterTag }).then(taggedPapers => {
      setTaggedPaperIds(new Set(taggedPapers.map(p => p.id)));
    }).catch(() => {
      setTaggedPaperIds(null);
    });
  }, [filterTag, papers]);

  // Load worldlines for sidebar
  useEffect(() => {
    api.getWorldlines().then(setFilterWorldlines).catch(() => {});
  }, [papers]);

  // Fetch paper IDs for selected worldline filter
  useEffect(() => {
    if (filterWorldline === null) {
      setWorldlinePaperIds(null);
      return;
    }
    api.getWorldlinePapers(filterWorldline).then(wlPapers => {
      setWorldlinePaperIds(new Set(wlPapers.map(p => p.id)));
    }).catch(() => {
      setWorldlinePaperIds(null);
    });
  }, [filterWorldline, papers]);

  // Clear selection and exit select mode when filters change
  useEffect(() => {
    setSelectedPaperIds(new Set());
    setSelectMode(false);
  }, [filterTag, filterWorldline, filterTier, searchTerm]);

  const filteredPapers = papers.filter(p => {
    if (taggedPaperIds !== null && !taggedPaperIds.has(p.id)) return false;
    if (worldlinePaperIds !== null && !worldlinePaperIds.has(p.id)) return false;
    if (filterTier !== null) {
      if (filterTier === 'ungraded') {
        if (p.tier !== null && p.tier !== undefined) return false;
      } else if (p.tier !== filterTier) {
        return false;
      }
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(term);
      const matchAuthors = p.authors.toLowerCase().includes(term);
      if (!matchTitle && !matchAuthors) return false;
    }
    return true;
  });

  // Selection helpers
  function toggleSelection(paperId: number) {
    setSelectedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }

  function selectAll() {
    setSelectedPaperIds(new Set(filteredPapers.map(p => p.id)));
  }

  function selectNone() {
    setSelectedPaperIds(new Set());
  }

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedPaperIds(new Set());
      return !prev;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedPaperIds(new Set());
  }

  // Card click handler
  function handleCardClick(paper: SavedPaper, e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('select') || target.closest('option') || target.closest('.author-name-btn')) return;
    if (selectMode) {
      toggleSelection(paper.id);
    } else {
      onOpenPaper(paper);
    }
  }

  async function handleTierChange(paper: SavedPaper, tier: number | null) {
    try {
      await api.updatePaperTier(paper.id, tier);
      await onRefresh();
    } catch {
      showNotification('Failed to update tier');
    }
  }

  async function handleBulkTierChange(tier: number | null) {
    setBulkLoading(true);
    setBulkAction('Updating tier');
    try {
      const result = await api.bulkUpdateTier(Array.from(selectedPaperIds), tier);
      showNotification(`Updated tier for ${result.updated} paper(s)`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to update tier');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  useEffect(() => {
    if (creatingTag && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [creatingTag]);

  useEffect(() => {
    if (editingTagId && editTagInputRef.current) {
      editTagInputRef.current.focus();
      editTagInputRef.current.select();
    }
  }, [editingTagId]);

  // Close tag context menu on click outside
  useEffect(() => {
    if (!tagContextMenu) return;
    const handler = () => setTagContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [tagContextMenu]);

  async function handleCreateTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setCreatingTag(false);
      setNewTagName('');
      return;
    }
    try {
      await api.createTag(trimmed, newTagColor);
      setNewTagName('');
      setNewTagColor('#6366f1');
      setCreatingTag(false);
      showNotification(`Tag "${trimmed}" created`);
      await onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create tag');
    }
  }

  async function handleDeleteTag(tag: Tag) {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    try {
      await api.deleteTag(tag.id);
      showNotification(`Tag "${tag.name}" deleted`);
      if (filterTag === tag.id) setFilterTag(null);
      await onRefresh();
    } catch {
      showNotification('Failed to delete tag');
    }
  }

  function startEditTag(tag: Tag) {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  }

  async function commitEditTag() {
    if (!editingTagId) return;
    const trimmed = editTagName.trim();
    const tag = tags.find(t => t.id === editingTagId);
    if (trimmed && tag && (trimmed !== tag.name || editTagColor !== tag.color)) {
      try {
        await api.updateTag(editingTagId, trimmed, editTagColor);
        await onRefresh();
      } catch (err: any) {
        showNotification(err.message || 'Failed to update tag');
      }
    }
    setEditingTagId(null);
    setEditTagName('');
    setEditTagColor('');
  }

  function cancelEditTag() {
    setEditingTagId(null);
    setEditTagName('');
    setEditTagColor('');
  }

  function handleExportSelectedBibtex() {
    if (selectedPaperIds.size === 0) return;
    const ids = Array.from(selectedPaperIds);
    window.open(api.getBibtexUrl(undefined, true, ids), '_blank');
    setShowExportChoice(false);
  }

  function handleExportSelectedPdfs() {
    if (selectedPaperIds.size === 0) return;
    const ids = Array.from(selectedPaperIds);
    window.open(api.getPdfZipUrl(ids), '_blank');
    setShowExportChoice(false);
  }

  function handleExportClick() {
    if (selectedPaperIds.size === 0) {
      showNotification('Select papers to export first');
      return;
    }
    setShowExportChoice(prev => !prev);
  }

  // Hide the export choice if selection becomes empty or select mode is exited
  useEffect(() => {
    if (selectedPaperIds.size === 0) setShowExportChoice(false);
  }, [selectedPaperIds]);

  // Bulk operation handlers
  async function handleBulkDownloadPdfs() {
    setBulkLoading(true);
    setBulkAction('Downloading PDFs');
    try {
      const result = await api.bulkDownloadPdfs(Array.from(selectedPaperIds));
      showNotification(`Downloaded ${result.downloaded} PDFs${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to download PDFs');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  async function handleBulkDeletePdfs() {
    if (!confirm(`Delete local PDFs for ${selectedPaperIds.size} paper(s)?`)) return;
    setBulkLoading(true);
    setBulkAction('Deleting PDFs');
    try {
      const result = await api.bulkDeletePdfs(Array.from(selectedPaperIds));
      showNotification(`Deleted ${result.deleted} local PDF(s)`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to delete PDFs');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  async function handleBulkSendToScribe() {
    if (!confirm(`Send ${selectedPaperIds.size} paper(s) to Scribe? Papers will be removed from Navigate.`)) return;
    setBulkLoading(true);
    setBulkAction('Sending to Scribe');
    try {
      const result = await api.sendToScribe(Array.from(selectedPaperIds));
      const msg = `Sent ${result.sent} paper(s) to Scribe${result.failed > 0 ? `, ${result.failed} failed` : ''}`;
      showNotification(msg);
      if (result.errors.length > 0) console.warn('Send to Scribe errors:', result.errors);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to send papers to Scribe. Is Scribe running?');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedPaperIds.size} paper(s) from your library? This cannot be undone.`)) return;
    setBulkLoading(true);
    setBulkAction('Deleting papers');
    try {
      const result = await api.bulkDeletePapers(Array.from(selectedPaperIds));
      showNotification(`Deleted ${result.deleted} paper(s)`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to delete papers');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  async function handleBulkAddTag(tagId: number) {
    setBulkLoading(true);
    setBulkAction('Adding tag');
    try {
      const result = await api.bulkAddTag(Array.from(selectedPaperIds), tagId);
      showNotification(`Added tag to ${result.applied} paper(s)`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to add tag');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }

  async function handleBulkRemoveTag(tagId: number) {
    setBulkLoading(true);
    setBulkAction('Removing tag');
    try {
      const result = await api.bulkRemoveTag(Array.from(selectedPaperIds), tagId);
      showNotification(`Removed tag from ${result.removed} paper(s)`);
      exitSelectMode();
      await onRefresh();
    } catch {
      showNotification('Failed to remove tag');
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
    }
  }



  return (
    <div className="library">
      {/* Sidebar */}
      <nav className="library-sidebar">
        {filterWorldlines.length > 0 && (
          <div className="sidebar-section">
            <h4 className="sidebar-section-title">Worldlines</h4>
            <button
              className={`sidebar-item${filterWorldline === null ? ' active' : ''}`}
              onClick={() => setFilterWorldline(null)}
            >
              All
            </button>
            {filterWorldlines.map(wl => (
              <button
                key={wl.id}
                className={`sidebar-item${filterWorldline === wl.id ? ' active' : ''}`}
                onClick={() => setFilterWorldline(filterWorldline === wl.id ? null : wl.id)}
              >
                <span className="sidebar-item-dot" style={{ backgroundColor: wl.color }} />
                {wl.name}
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-section">
          <h4 className="sidebar-section-title sidebar-section-title-row">
            <span>Tiers</span>
            <button
              type="button"
              className="sidebar-help-btn"
              onClick={() => setShowTierRubric(true)}
              title="Tiering rubric"
              aria-label="Show tiering rubric"
            >
              ?
            </button>
          </h4>
          <button
            className={`sidebar-item${filterTier === null ? ' active' : ''}`}
            onClick={() => setFilterTier(null)}
          >
            All
          </button>
          {[0, 1, 2, 3, 4].map(t => (
            <button
              key={t}
              className={`sidebar-item sidebar-item-tier sidebar-item-tier-${t}${filterTier === t ? ' active' : ''}`}
              onClick={() => setFilterTier(filterTier === t ? null : t)}
              title={t === 0 ? 'Groundbreaking' : t === 4 ? 'Skim' : `Tier ${t}`}
            >
              <span className={`tier-dot tier-dot-${t}`}>{TIER_LABELS[t]}</span>
            </button>
          ))}
          <button
            className={`sidebar-item${filterTier === 'ungraded' ? ' active' : ''}`}
            onClick={() => setFilterTier(filterTier === 'ungraded' ? null : 'ungraded')}
            title="Ungraded"
          >
            <span className="tier-dot tier-dot-ungraded">—</span>
          </button>
        </div>

        <div className="sidebar-section">
          <h4 className="sidebar-section-title">Tags</h4>
          {tags.length > 0 && (
            <button
              className={`sidebar-item${filterTag === null ? ' active' : ''}`}
              onClick={() => setFilterTag(null)}
            >
              All
            </button>
          )}
          {tags.map(tag => (
            <div key={tag.id}>
              {editingTagId === tag.id ? (
                <div className="sidebar-tag-edit">
                  <input
                    ref={editTagInputRef}
                    className="sidebar-rename-input"
                    value={editTagName}
                    onChange={e => setEditTagName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEditTag();
                      if (e.key === 'Escape') cancelEditTag();
                    }}
                    onBlur={commitEditTag}
                  />
                  <input
                    type="color"
                    className="sidebar-color-input"
                    value={editTagColor}
                    onChange={e => setEditTagColor(e.target.value)}
                  />
                </div>
              ) : (
                <button
                  className={`sidebar-item${filterTag === tag.id ? ' active' : ''}`}
                  onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
                  onContextMenu={e => {
                    e.preventDefault();
                    setTagContextMenu({ x: e.clientX, y: e.clientY, tag });
                  }}
                >
                  <span className="sidebar-item-dot" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              )}
            </div>
          ))}
          {creatingTag ? (
            <div className="sidebar-tag-edit">
              <input
                ref={newTagInputRef}
                className="sidebar-rename-input"
                value={newTagName}
                placeholder="Tag name"
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTag();
                  if (e.key === 'Escape') {
                    setCreatingTag(false);
                    setNewTagName('');
                  }
                }}
                onBlur={handleCreateTag}
              />
              <input
                type="color"
                className="sidebar-color-input"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
              />
            </div>
          ) : (
            <button
              className="sidebar-new-btn"
              onClick={() => setCreatingTag(true)}
            >
              + New Tag
            </button>
          )}
        </div>

        {filterWorldlines.length === 0 && tags.length === 0 && !creatingTag && (
          <div className="sidebar-section">
            <p className="sidebar-empty">No worldlines yet.</p>
          </div>
        )}
      </nav>

      {/* Main content */}
      <div className="library-main">
        <div className="library-controls">
          <div className="control-row">
            <div className="control-group search-group">
              <input
                type="text"
                placeholder="Filter papers by title or author..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="control-group">
              <button
                className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={toggleSelectMode}
              >
                {selectMode ? `Done (${selectedPaperIds.size})` : 'Select'}
              </button>
            </div>

            <div className="control-group mobile-actions-toggle">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowMobileActions(!showMobileActions)}
              >
                {showMobileActions ? 'Hide Actions' : 'Actions\u2026'}
              </button>
            </div>

            <div className={`library-action-buttons ${showMobileActions ? 'expanded' : ''}`}>
              <div className="control-group">
                <button
                  className={`btn btn-sm ${showImport ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setShowImport(!showImport)}
                >
                  Import
                </button>
              </div>

              <div className="control-group export-group">
                <button
                  className={`btn btn-sm ${showExportChoice ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleExportClick}
                  title={selectedPaperIds.size === 0 ? 'Select papers first' : `Export ${selectedPaperIds.size} selected`}
                >
                  Export{selectedPaperIds.size > 0 ? ` (${selectedPaperIds.size})` : ''}
                </button>
                {showExportChoice && selectedPaperIds.size > 0 && (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportSelectedBibtex}
                    >
                      BibTeX
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportSelectedPdfs}
                    >
                      PDFs
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {showImport && (
          <ImportPanel
            tags={tags}
            showNotification={showNotification}
            onImportComplete={onRefresh}
          />
        )}

        {/* Bulk operations toolbar */}
        {selectMode && selectedPaperIds.size > 0 && (
          <div className="bulk-toolbar">
            <span className="bulk-count">{selectedPaperIds.size} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={selectAll} disabled={bulkLoading}>
              Select All ({filteredPapers.length})
            </button>
            <button className="btn btn-secondary btn-sm" onClick={selectNone} disabled={bulkLoading}>
              Deselect All
            </button>
            <span className="bulk-separator" />
            <button className="btn btn-primary btn-sm" onClick={handleBulkDownloadPdfs} disabled={bulkLoading}>
              Download PDFs
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleBulkDeletePdfs} disabled={bulkLoading}>
              Delete PDFs
            </button>
            <select
              onChange={e => {
                if (e.target.value === '') return;
                const v = e.target.value;
                handleBulkTierChange(v === 'ungraded' ? null : parseInt(v, 10));
                e.target.value = '';
              }}
              defaultValue=""
              disabled={bulkLoading}
            >
              <option value="">Set Tier...</option>
              <option value="0">T0 — Groundbreaking</option>
              <option value="1">T1</option>
              <option value="2">T2</option>
              <option value="3">T3</option>
              <option value="4">T4</option>
              <option value="ungraded">Ungrade</option>
            </select>
            <select
              onChange={e => { if (e.target.value) handleBulkAddTag(parseInt(e.target.value, 10)); e.target.value = ''; }}
              defaultValue=""
              disabled={bulkLoading}
            >
              <option value="">Add Tag...</option>
              {tags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <select
              onChange={e => { if (e.target.value) handleBulkRemoveTag(parseInt(e.target.value, 10)); e.target.value = ''; }}
              defaultValue=""
              disabled={bulkLoading}
            >
              <option value="">Remove Tag...</option>
              {tags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={handleBulkSendToScribe} disabled={bulkLoading}>
              Send to Scribe
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkLoading}>
              Delete Papers
            </button>
            {bulkLoading && <span className="bulk-status">{bulkAction}...</span>}
          </div>
        )}

        {filteredPapers.length === 0 ? (
          <div className="empty-state">
            {papers.length === 0
              ? 'Your library is empty. Browse ArXiv or upload a PDF to add papers.'
              : 'No papers match your filters.'}
          </div>
        ) : (
          <div className="paper-list">
            {filteredPapers.map(paper => {
              const authors = JSON.parse(paper.authors) as string[];

              const tierValue = paper.tier ?? null;
              const tierClass = tierValue !== null ? ` tier-${tierValue}` : ' tier-ungraded';

              return (
                <div
                  key={paper.id}
                  className={`paper-card library-card${tierClass}${selectedPaperIds.has(paper.id) ? ' selected' : ''}`}
                  onClick={e => handleCardClick(paper, e)}
                >
                  <div className="paper-tier-marker" onClick={e => e.stopPropagation()}>
                    <select
                      className={`tier-select tier-select-${tierValue ?? 'ungraded'}`}
                      value={tierValue === null ? '' : String(tierValue)}
                      onChange={e => {
                        const v = e.target.value;
                        handleTierChange(paper, v === '' ? null : parseInt(v, 10));
                      }}
                      title={tierValue === null ? 'Ungraded — click to grade' : `${TIER_LABELS[tierValue]} — click to change`}
                    >
                      <option value="">—</option>
                      <option value="0">T0</option>
                      <option value="1">T1</option>
                      <option value="2">T2</option>
                      <option value="3">T3</option>
                      <option value="4">T4</option>
                    </select>
                  </div>
                  <div className="paper-card-body">
                  <div className="paper-card-header">
                    <div className="paper-select-title">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedPaperIds.has(paper.id)}
                          onChange={() => toggleSelection(paper.id)}
                          className="paper-checkbox"
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <h3 className="paper-title">
                        <LaTeX>{paper.title}</LaTeX>
                      </h3>
                    </div>
                  </div>

                  <div className="paper-meta">
                    <span className="paper-authors">
                      {authors.slice(0, 3).map((author, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          <button
                            className={`author-name-btn ${favoriteAuthorNames.has(author) ? 'is-favorite' : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (!favoriteAuthorNames.has(author)) onFavoriteAuthor(author); }}
                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSearchAuthor(author); }}
                            title={favoriteAuthorNames.has(author) ? 'Already in favorites' : `Add ${author} to favorites | Right-click to search`}
                          >
                            {author}
                          </button>
                        </span>
                      ))}
                      {authors.length > 3 && ` +${authors.length - 3} more`}
                    </span>
                    <span className="paper-date">
                      Added {new Date(paper.added_at).toLocaleDateString()}
                    </span>
                    {paper.arxiv_id.startsWith('upload-') && (
                      <span className="category-badge" style={{ backgroundColor: '#8b5cf6' }}>Uploaded</span>
                    )}
                    <span className={`pdf-badge ${paper.pdf_path ? 'pdf-badge-local' : 'pdf-badge-none'}`}>
                      {paper.pdf_path ? 'PDF' : 'No PDF'}
                    </span>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tier rubric modal */}
      {showTierRubric && (
        <div
          className="settings-overlay"
          onClick={() => setShowTierRubric(false)}
        >
          <div
            className="rubric-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Tiering rubric"
          >
            <div className="rubric-modal-header">
              <h2>Tiering rubric</h2>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowTierRubric(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="rubric-modal-body">
              {TIER_RUBRIC.map(entry => (
                <div key={entry.tier} className={`rubric-row rubric-row-${entry.tier.toLowerCase()}`}>
                  <div className="rubric-row-head">
                    <span className={`tier-dot tier-dot-${entry.tier.slice(1)}`}>{entry.tier}</span>
                    <span className="rubric-row-name">{entry.name}</span>
                  </div>
                  <p className="rubric-row-body">{entry.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tag context menu */}
      {tagContextMenu && (
        <div
          className="tag-context-menu"
          style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="tag-context-menu-item"
            onClick={() => { startEditTag(tagContextMenu.tag); setTagContextMenu(null); }}
          >
            Rename / Recolor
          </button>
          <button
            className="tag-context-menu-item danger"
            onClick={() => { handleDeleteTag(tagContextMenu.tag); setTagContextMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
