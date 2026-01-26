import { useState } from 'react';

interface Props {
  pdfUrl: string;
}

export default function PDFViewer({ pdfUrl }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
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
