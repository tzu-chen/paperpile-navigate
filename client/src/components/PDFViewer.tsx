import { useState } from 'react';

interface Props {
  pdfUrl: string;
  onPageChange?: (page: number) => void;
}

export default function PDFViewer({ pdfUrl, onPageChange }: Props) {
  const [pageInput, setPageInput] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function handlePageInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPageInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && onPageChange) {
      onPageChange(num);
    }
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="pdf-page-control">
          <label>Current Page:</label>
          <input
            type="number"
            min="1"
            value={pageInput}
            onChange={handlePageInput}
            className="page-input"
          />
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
        >
          Open PDF in New Tab
        </a>
      </div>

      {loading && !error && (
        <div className="pdf-loading">Loading PDF...</div>
      )}

      {error && (
        <div className="pdf-error">
          <p>Failed to load PDF inline.</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Open PDF in New Tab
          </a>
        </div>
      )}

      <iframe
        src={pdfUrl}
        className="pdf-frame"
        title="PDF Viewer"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        style={{ display: error ? 'none' : 'block' }}
      />
    </div>
  );
}
