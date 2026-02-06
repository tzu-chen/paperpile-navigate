import { useState, useEffect } from 'react';
import { Tag, Worldline } from '../types';
import * as api from '../services/api';

interface Props {
  tags: Tag[];
  showNotification: (msg: string) => void;
  onImportComplete: () => Promise<void>;
  compact?: boolean;
}

export default function BatchImportPanel({ tags, showNotification, onImportComplete, compact = false }: Props) {
  const [importArxivIds, setImportArxivIds] = useState('');
  const [importSelectedTagIds, setImportSelectedTagIds] = useState<Set<number>>(new Set());
  const [selectedWorldlineIds, setSelectedWorldlineIds] = useState<Set<number>>(new Set());
  const [newWorldlines, setNewWorldlines] = useState<Array<{ name: string; color: string }>>([]);
  const [newWlName, setNewWlName] = useState('');
  const [newWlColor, setNewWlColor] = useState('#6366f1');
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [worldlines, setWorldlines] = useState<Worldline[]>([]);

  useEffect(() => {
    api.getWorldlines().then(setWorldlines).catch(() => {});
  }, []);

  function toggleImportTag(tagId: number) {
    setImportSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleWorldline(wlId: number) {
    setSelectedWorldlineIds(prev => {
      const next = new Set(prev);
      if (next.has(wlId)) next.delete(wlId);
      else next.add(wlId);
      return next;
    });
  }

  function addNewWorldline() {
    if (!newWlName.trim()) return;
    setNewWorldlines(prev => [...prev, { name: newWlName.trim(), color: newWlColor }]);
    setNewWlName('');
  }

  function removeNewWorldline(index: number) {
    setNewWorldlines(prev => prev.filter((_, i) => i !== index));
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
    setImportLoading(true);
    setImportStatus(`Importing ${ids.length} papers and inferring citations...`);
    try {
      const options: Parameters<typeof api.batchImport>[1] = {};

      if (selectedWorldlineIds.size > 0) {
        options.worldlineIds = Array.from(selectedWorldlineIds);
      }
      if (newWorldlines.length > 0) {
        options.newWorldlines = newWorldlines;
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
      setSelectedWorldlineIds(new Set());
      setNewWorldlines([]);
      setImportSelectedTagIds(new Set());
      // Refresh worldlines list since new ones may have been created
      api.getWorldlines().then(setWorldlines).catch(() => {});
      await onImportComplete();
    } catch (err: any) {
      setImportStatus(null);
      showNotification(err.message || 'Batch import failed');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className={`batch-import-section ${compact ? 'batch-import-compact' : ''}`}>
      {!compact && <h3>Batch Import</h3>}
      <p className="batch-import-hint">
        Paste ArXiv IDs (one per line or comma-separated). Papers will be saved to the library with citations inferred from Semantic Scholar.
      </p>
      <div className={`batch-import-body ${compact ? 'batch-import-body-vertical' : ''}`}>
        <div className="batch-import-left">
          <textarea
            className="batch-import-textarea"
            placeholder={"2301.00001\n2302.12345\n2303.54321"}
            value={importArxivIds}
            onChange={e => setImportArxivIds(e.target.value)}
            rows={compact ? 4 : 5}
            disabled={importLoading}
          />
        </div>
        <div className="batch-import-right">
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

          <div className="batch-import-group">
            <label className="batch-import-label">Worldlines</label>

            {(selectedWorldlineIds.size > 0 || newWorldlines.length > 0) && (
              <div className="tag-chip-list">
                {worldlines.filter(wl => selectedWorldlineIds.has(wl.id)).map(wl => (
                  <span key={wl.id} className="tag-chip" style={{ backgroundColor: wl.color }}>
                    {wl.name}
                    <button
                      className="tag-chip-remove"
                      onClick={() => toggleWorldline(wl.id)}
                      title="Remove from import"
                      disabled={importLoading}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                {newWorldlines.map((nw, idx) => (
                  <span key={`new-${idx}`} className="tag-chip" style={{ backgroundColor: nw.color }}>
                    {nw.name} <span className="muted-inline">(new)</span>
                    <button
                      className="tag-chip-remove"
                      onClick={() => removeNewWorldline(idx)}
                      title="Remove new worldline"
                      disabled={importLoading}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {worldlines.filter(wl => !selectedWorldlineIds.has(wl.id)).length > 0 && (
              <div className="tag-chip-list">
                {worldlines.filter(wl => !selectedWorldlineIds.has(wl.id)).map(wl => (
                  <span
                    key={wl.id}
                    className="tag-chip tag-chip-add"
                    style={{ borderColor: wl.color, color: wl.color }}
                    onClick={() => !importLoading && toggleWorldline(wl.id)}
                    title="Click to add"
                  >
                    + {wl.name}
                  </span>
                ))}
              </div>
            )}

            <div className="tag-create-form">
              <input
                type="text"
                placeholder="Worldline name"
                value={newWlName}
                onChange={e => setNewWlName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNewWorldline()}
                disabled={importLoading}
              />
              <input
                type="color"
                value={newWlColor}
                onChange={e => setNewWlColor(e.target.value)}
                disabled={importLoading}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={addNewWorldline}
                disabled={!newWlName.trim() || importLoading}
              >
                Add
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary batch-import-submit"
            onClick={handleBatchImport}
            disabled={importLoading || !importArxivIds.trim()}
          >
            {importLoading ? 'Importing...' : 'Import Papers'}
          </button>
          {importStatus && (
            <div className="batch-import-status">{importStatus}</div>
          )}
        </div>
      </div>
    </div>
  );
}
