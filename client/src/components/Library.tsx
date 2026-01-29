import { useState, useEffect } from 'react';
import { SavedPaper, Tag, Worldline } from '../types';
import * as api from '../services/api';
import LaTeX from './LaTeX';

interface Props {
  papers: SavedPaper[];
  tags: Tag[];
  onOpenPaper: (paper: SavedPaper) => void;
  onRefresh: () => Promise<void>;
  showNotification: (msg: string) => void;
  favoriteAuthorNames: Set<string>;
  onFavoriteAuthor: (name: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  reading: 'Reading',
  reviewed: 'Reviewed',
  exported: 'Exported',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1',
  reading: '#f59e0b',
  reviewed: '#10b981',
  exported: '#8b5cf6',
};

export default function Library({ papers, tags, onOpenPaper, onRefresh, showNotification, favoriteAuthorNames, onFavoriteAuthor }: Props) {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterWorldline, setFilterWorldline] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [showTagManager, setShowTagManager] = useState(false);
  const [taggedPaperIds, setTaggedPaperIds] = useState<Set<number> | null>(null);
  const [worldlinePaperIds, setWorldlinePaperIds] = useState<Set<number> | null>(null);
  const [filterWorldlines, setFilterWorldlines] = useState<Worldline[]>([]);

  // Batch import state
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [importArxivIds, setImportArxivIds] = useState('');
  const [importSelectedTagIds, setImportSelectedTagIds] = useState<Set<number>>(new Set());
  const [importWlMode, setImportWlMode] = useState<'none' | 'new' | 'existing'>('none');
  const [importWlName, setImportWlName] = useState('');
  const [importWlColor, setImportWlColor] = useState('#6366f1');
  const [importExistingWlId, setImportExistingWlId] = useState<number | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [worldlines, setWorldlines] = useState<Worldline[]>([]);

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

  // Load worldlines for filter row
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

  const filteredPapers = papers.filter(p => {
    if (taggedPaperIds !== null && !taggedPaperIds.has(p.id)) return false;
    if (worldlinePaperIds !== null && !worldlinePaperIds.has(p.id)) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(term);
      const matchAuthors = p.authors.toLowerCase().includes(term);
      if (!matchTitle && !matchAuthors) return false;
    }
    return true;
  });

  async function handleDelete(paper: SavedPaper) {
    if (!confirm(`Delete "${paper.title}" from your library?`)) return;
    try {
      await api.deletePaper(paper.id);
      showNotification('Paper deleted');
      await onRefresh();
    } catch {
      showNotification('Failed to delete paper');
    }
  }

  async function handleStatusChange(paper: SavedPaper, status: string) {
    try {
      await api.updatePaperStatus(paper.id, status);
      await onRefresh();
    } catch {
      showNotification('Failed to update status');
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      await api.createTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      showNotification(`Tag "${newTagName}" created`);
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

  function handleExportAll() {
    window.open(api.getBibtexUrl(undefined, true), '_blank');
  }

  // Load worldlines when batch import section is opened
  useEffect(() => {
    if (showBatchImport) {
      api.getWorldlines().then(setWorldlines).catch(() => {});
    }
  }, [showBatchImport]);

  function toggleImportTag(tagId: number) {
    setImportSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handleBatchImport() {
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
      const options: Parameters<typeof api.batchImport>[1] = {};

      if (importWlMode === 'new') {
        options.worldline = { name: importWlName.trim(), color: importWlColor };
      } else if (importWlMode === 'existing' && importExistingWlId !== null) {
        options.worldline = { id: importExistingWlId };
      }

      if (importSelectedTagIds.size > 0) {
        options.tagIds = Array.from(importSelectedTagIds);
      }

      const result = await api.batchImport(ids, options);
      const parts: string[] = [];
      parts.push(`${result.papers_added} papers added`);
      parts.push(`${result.citations_created} citations inferred`);
      if (result.tags_applied > 0) parts.push(`${result.tags_applied} tag assignments`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);
      setImportStatus(`Done: ${parts.join(', ')}`);

      if (result.errors.length > 0) {
        showNotification(`Import finished with errors: ${result.errors.join('; ')}`);
      } else {
        showNotification(`Imported ${result.papers_added} papers, ${result.citations_created} citations`);
      }
      setImportArxivIds('');
      setImportWlName('');
      setImportSelectedTagIds(new Set());
      await onRefresh();
    } catch (err: any) {
      setImportStatus(null);
      showNotification(err.message || 'Batch import failed');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="library">
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
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTagManager(!showTagManager)}
            >
              Manage Tags
            </button>
          </div>

          <div className="control-group">
            <button
              className={`btn btn-sm ${showBatchImport ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBatchImport(!showBatchImport)}
            >
              Batch Import
            </button>
          </div>

          <div className="control-group">
            <button className="btn btn-primary btn-sm" onClick={handleExportAll}>
              Export All (BibTeX)
            </button>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="tag-filter-row">
            <button
              className={`tag-filter-btn ${!filterTag ? 'active' : ''}`}
              onClick={() => setFilterTag(null)}
            >
              All
            </button>
            {tags.map(tag => (
              <button
                key={tag.id}
                className={`tag-filter-btn ${filterTag === tag.id ? 'active' : ''}`}
                style={{ borderColor: tag.color, color: filterTag === tag.id ? '#fff' : tag.color, backgroundColor: filterTag === tag.id ? tag.color : 'transparent' }}
                onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {filterWorldlines.length > 0 && (
          <div className="tag-filter-row">
            <span className="filter-row-label">Worldline:</span>
            <button
              className={`tag-filter-btn ${!filterWorldline ? 'active' : ''}`}
              onClick={() => setFilterWorldline(null)}
            >
              All
            </button>
            {filterWorldlines.map(wl => (
              <button
                key={wl.id}
                className={`tag-filter-btn ${filterWorldline === wl.id ? 'active' : ''}`}
                style={{ borderColor: wl.color, color: filterWorldline === wl.id ? '#fff' : wl.color, backgroundColor: filterWorldline === wl.id ? wl.color : 'transparent' }}
                onClick={() => setFilterWorldline(filterWorldline === wl.id ? null : wl.id)}
              >
                {wl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {showTagManager && (
        <div className="tag-manager">
          <h3>Tags</h3>
          <div className="tag-create-row">
            <input
              type="text"
              placeholder="New tag name"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={e => setNewTagColor(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={handleCreateTag}>
              Add Tag
            </button>
          </div>
          <div className="tag-list">
            {tags.map(tag => (
              <div key={tag.id} className="tag-item">
                <span className="tag-badge" style={{ backgroundColor: tag.color }}>
                  {tag.name}
                </span>
                <button
                  className="btn-icon btn-danger-icon"
                  onClick={() => handleDeleteTag(tag)}
                  title="Delete tag"
                >
                  &times;
                </button>
              </div>
            ))}
            {tags.length === 0 && <p className="muted">No tags yet. Create one above.</p>}
          </div>
        </div>
      )}

      {showBatchImport && (
        <div className="batch-import-section">
          <h3>Batch Import</h3>
          <p className="batch-import-hint">
            Paste ArXiv IDs (one per line or comma-separated). Papers will be saved to the library with citations inferred from Semantic Scholar.
          </p>
          <div className="batch-import-body">
            <div className="batch-import-left">
              <textarea
                className="batch-import-textarea"
                placeholder={"2301.00001\n2302.12345\n2303.54321"}
                value={importArxivIds}
                onChange={e => setImportArxivIds(e.target.value)}
                rows={5}
                disabled={importLoading}
              />
            </div>
            <div className="batch-import-right">
              {/* Tag selection */}
              {tags.length > 0 && (
                <div className="batch-import-group">
                  <label className="batch-import-label">Apply Tags</label>
                  <div className="batch-import-tag-list">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        className={`tag-filter-btn ${importSelectedTagIds.has(tag.id) ? 'active' : ''}`}
                        style={{
                          borderColor: tag.color,
                          color: importSelectedTagIds.has(tag.id) ? '#fff' : tag.color,
                          backgroundColor: importSelectedTagIds.has(tag.id) ? tag.color : 'transparent',
                        }}
                        onClick={() => toggleImportTag(tag.id)}
                        disabled={importLoading}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Worldline selection */}
              <div className="batch-import-group">
                <label className="batch-import-label">Worldline</label>
                <div className="batch-import-wl-toggle">
                  <button
                    className={`btn btn-sm ${importWlMode === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setImportWlMode('none')}
                    disabled={importLoading}
                  >
                    None
                  </button>
                  <button
                    className={`btn btn-sm ${importWlMode === 'new' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setImportWlMode('new')}
                    disabled={importLoading}
                  >
                    New
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
                  <div className="batch-import-wl-form">
                    <input
                      type="text"
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
                    className="batch-import-wl-select"
                    value={importExistingWlId ?? ''}
                    onChange={e => setImportExistingWlId(e.target.value ? Number(e.target.value) : null)}
                    disabled={importLoading}
                  >
                    <option value="">Select a worldline...</option>
                    {worldlines.map(wl => (
                      <option key={wl.id} value={wl.id}>{wl.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                className="btn btn-primary batch-import-submit"
                onClick={handleBatchImport}
                disabled={
                  importLoading ||
                  !importArxivIds.trim() ||
                  (importWlMode === 'new' && !importWlName.trim()) ||
                  (importWlMode === 'existing' && importExistingWlId === null)
                }
              >
                {importLoading ? 'Importing...' : 'Import Papers'}
              </button>
              {importStatus && (
                <div className="batch-import-status">{importStatus}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {filteredPapers.length === 0 ? (
        <div className="empty-state">
          {papers.length === 0
            ? 'Your library is empty. Browse ArXiv to add papers.'
            : 'No papers match your filters.'}
        </div>
      ) : (
        <div className="paper-list">
          {filteredPapers.map(paper => {
            const authors = JSON.parse(paper.authors) as string[];
            const categories = JSON.parse(paper.categories) as string[];

            return (
              <div key={paper.id} className="paper-card library-card">
                <div className="paper-card-header">
                  <h3 className="paper-title" onClick={() => onOpenPaper(paper)}>
                    <LaTeX>{paper.title}</LaTeX>
                  </h3>
                  <div className="paper-actions">
                    <select
                      value={paper.status}
                      onChange={e => handleStatusChange(paper, e.target.value)}
                      className="status-select"
                      style={{ borderColor: STATUS_COLORS[paper.status] }}
                    >
                      {Object.entries(STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onOpenPaper(paper)}
                    >
                      View
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(paper)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="paper-meta">
                  <span className="paper-authors">
                    {authors.slice(0, 3).map((author, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <button
                          className={`author-name-btn ${favoriteAuthorNames.has(author) ? 'is-favorite' : ''}`}
                          onClick={() => !favoriteAuthorNames.has(author) && onFavoriteAuthor(author)}
                          title={favoriteAuthorNames.has(author) ? 'Already in favorites' : `Add ${author} to favorites`}
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
                  <span className="paper-categories">
                    {categories.slice(0, 3).map(c => (
                      <span key={c} className="category-badge">{c}</span>
                    ))}
                  </span>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: STATUS_COLORS[paper.status] }}
                  >
                    {STATUS_LABELS[paper.status]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
