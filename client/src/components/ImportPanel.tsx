import { useState } from 'react';
import { Tag } from '../types';
import * as api from '../services/api';
import BatchImportPanel from './BatchImportPanel';

interface Props {
  tags: Tag[];
  showNotification: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}

type ImportTab = 'arxiv' | 'bibtex' | 'pdf';

export default function ImportPanel({ tags, showNotification, onImportComplete }: Props) {
  const [tab, setTab] = useState<ImportTab>('arxiv');

  // BibTeX import state
  const [bibtexText, setBibtexText] = useState('');
  const [bibtexImporting, setBibtexImporting] = useState(false);

  // PDF upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthors, setUploadAuthors] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleBibtexImport() {
    if (!bibtexText.trim()) {
      showNotification('Paste or load a BibTeX file first');
      return;
    }
    setBibtexImporting(true);
    try {
      const result = await api.importBibtex(bibtexText);
      const parts: string[] = [];
      parts.push(`${result.papers_added} added`);
      if (result.papers_skipped > 0) parts.push(`${result.papers_skipped} already in library`);
      if (result.tags_applied > 0) parts.push(`${result.tags_applied} tag assignments`);
      if (result.comments_added > 0) parts.push(`${result.comments_added} comments restored`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);
      showNotification(`BibTeX import: ${parts.join(', ')}`);
      if (result.errors.length > 0) console.warn('BibTeX import errors:', result.errors);
      setBibtexText('');
      await onImportComplete();
    } catch (err: any) {
      showNotification(err.message || 'BibTeX import failed');
    } finally {
      setBibtexImporting(false);
    }
  }

  function handleBibtexFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBibtexText(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handlePdfUpload() {
    if (!uploadFile || !uploadTitle.trim()) {
      showNotification('PDF file and title are required');
      return;
    }
    const authors = uploadAuthors.split(',').map(a => a.trim()).filter(a => a.length > 0);
    if (authors.length === 0) {
      showNotification('At least one author is required');
      return;
    }
    setUploading(true);
    try {
      await api.uploadPaper(uploadFile, {
        title: uploadTitle.trim(),
        authors,
        summary: uploadSummary.trim() || undefined,
      });
      showNotification('Paper uploaded successfully');
      setUploadFile(null);
      setUploadTitle('');
      setUploadAuthors('');
      setUploadSummary('');
      await onImportComplete();
    } catch (err: any) {
      showNotification(err.message || 'Failed to upload paper');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="import-panel">
      <div className="import-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'arxiv'}
          className={`import-tab${tab === 'arxiv' ? ' active' : ''}`}
          onClick={() => setTab('arxiv')}
        >
          ArXiv IDs
        </button>
        <button
          role="tab"
          aria-selected={tab === 'bibtex'}
          className={`import-tab${tab === 'bibtex' ? ' active' : ''}`}
          onClick={() => setTab('bibtex')}
        >
          BibTeX
        </button>
        <button
          role="tab"
          aria-selected={tab === 'pdf'}
          className={`import-tab${tab === 'pdf' ? ' active' : ''}`}
          onClick={() => setTab('pdf')}
        >
          Upload PDF
        </button>
      </div>

      <div className="import-tab-body">
        {tab === 'arxiv' && (
          <BatchImportPanel
            tags={tags}
            showNotification={showNotification}
            onImportComplete={onImportComplete}
            compact
          />
        )}

        {tab === 'bibtex' && (
          <div className="batch-import-section">
            <p className="batch-import-hint">
              Paste BibTeX entries below or load a .bib file. Papers with ArXiv eprint fields will be imported into your library with their tags and comments preserved.
            </p>
            <div className="batch-import-body">
              <div className="batch-import-left" style={{ flex: 1 }}>
                <textarea
                  className="batch-import-textarea"
                  placeholder={"@article{key,\n  author = {Author Name},\n  title = {Paper Title},\n  eprint = {2301.00001},\n  ...\n}"}
                  value={bibtexText}
                  onChange={e => setBibtexText(e.target.value)}
                  rows={8}
                  disabled={bibtexImporting}
                />
              </div>
              <div className="batch-import-right">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  Load .bib File
                  <input
                    type="file"
                    accept=".bib,.bibtex,text/plain"
                    onChange={handleBibtexFileLoad}
                    style={{ display: 'none' }}
                    disabled={bibtexImporting}
                  />
                </label>
                <button
                  className="btn btn-primary batch-import-submit"
                  onClick={handleBibtexImport}
                  disabled={bibtexImporting || !bibtexText.trim()}
                >
                  {bibtexImporting ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'pdf' && (
          <div className="batch-import-section">
            <p className="batch-import-hint">
              Upload a PDF file as an external reference. It will be added to your library and can be tagged, commented on, added to worldlines, and chatted about.
            </p>
            <div className="batch-import-body" style={{ flexDirection: 'column', gap: '0.5rem' }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-block', alignSelf: 'flex-start' }}>
                {uploadFile ? uploadFile.name : 'Choose PDF File'}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                  disabled={uploading}
                />
              </label>
              <input
                type="text"
                placeholder="Title (required)"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                disabled={uploading}
                style={{ width: '100%' }}
              />
              <input
                type="text"
                placeholder="Authors (comma-separated, required)"
                value={uploadAuthors}
                onChange={e => setUploadAuthors(e.target.value)}
                disabled={uploading}
                style={{ width: '100%' }}
              />
              <textarea
                placeholder="Abstract / summary (optional)"
                value={uploadSummary}
                onChange={e => setUploadSummary(e.target.value)}
                rows={3}
                disabled={uploading}
                style={{ width: '100%' }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handlePdfUpload}
                disabled={uploading || !uploadFile || !uploadTitle.trim() || !uploadAuthors.trim()}
                style={{ alignSelf: 'flex-start' }}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
