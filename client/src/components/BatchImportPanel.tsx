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
  const [importWlMode, setImportWlMode] = useState<'none' | 'new' | 'existing'>('none');
  const [importWlName, setImportWlName] = useState('');
  const [importWlColor, setImportWlColor] = useState('#6366f1');
  const [importExistingWlId, setImportExistingWlId] = useState<number | null>(null);
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
  );
}
