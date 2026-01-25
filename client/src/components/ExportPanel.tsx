import { useState, useEffect } from 'react';
import { SavedPaper } from '../types';
import * as api from '../services/api';

interface Props {
  paper: SavedPaper;
  showNotification: (msg: string) => void;
}

export default function ExportPanel({ paper, showNotification }: Props) {
  const [bibtex, setBibtex] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getBibtexText(paper.id)
      .then(setBibtex)
      .catch(() => setBibtex('Failed to generate BibTeX'))
      .finally(() => setLoading(false));
  }, [paper.id]);

  async function handleCopyBibtex() {
    try {
      await navigator.clipboard.writeText(bibtex);
      showNotification('BibTeX copied to clipboard');
    } catch {
      showNotification('Failed to copy to clipboard');
    }
  }

  function handleDownloadBibtex() {
    window.open(api.getBibtexUrl(paper.id, true), '_blank');
  }

  async function handleMarkExported() {
    try {
      await api.markExported(paper.id);
      showNotification('Paper marked as exported');
    } catch {
      showNotification('Failed to mark as exported');
    }
  }

  return (
    <div className="export-panel">
      <div className="export-section">
        <h4>Export to Paperpile</h4>
        <p className="export-instructions">
          Use the BibTeX entry below to import this paper into Paperpile.
          In Paperpile, go to <strong>Add Papers &rarr; Import BibTeX</strong> and
          paste the entry, or upload the downloaded .bib file.
        </p>
        <p className="export-instructions">
          Comments are included in the <code>note</code> field, and tags are
          included in the <code>keywords</code> field. Both will be preserved
          in Paperpile after import.
        </p>
      </div>

      <div className="export-section">
        <h4>BibTeX Entry</h4>
        {loading ? (
          <div className="loading">Generating BibTeX...</div>
        ) : (
          <pre className="bibtex-preview">{bibtex}</pre>
        )}
        <div className="export-actions">
          <button className="btn btn-primary btn-sm" onClick={handleCopyBibtex} disabled={loading}>
            Copy to Clipboard
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadBibtex}>
            Download .bib File
          </button>
          <button className="btn btn-success btn-sm" onClick={handleMarkExported}>
            Mark as Exported
          </button>
        </div>
      </div>

      <div className="export-section">
        <h4>Quick Reference</h4>
        <table className="ref-table">
          <tbody>
            <tr>
              <td><strong>ArXiv ID</strong></td>
              <td>{paper.arxiv_id}</td>
            </tr>
            {paper.doi && (
              <tr>
                <td><strong>DOI</strong></td>
                <td>{paper.doi}</td>
              </tr>
            )}
            <tr>
              <td><strong>PDF URL</strong></td>
              <td>
                <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
                  {paper.pdf_url}
                </a>
              </td>
            </tr>
            <tr>
              <td><strong>Abstract URL</strong></td>
              <td>
                <a href={paper.abs_url} target="_blank" rel="noopener noreferrer">
                  {paper.abs_url}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
