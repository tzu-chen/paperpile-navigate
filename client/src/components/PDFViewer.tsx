import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  pdfUrl: string;
  onPageChange?: (page: number) => void;
}

export default function PDFViewer({ pdfUrl, onPageChange }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(1);
  const [pageInputValue, setPageInputValue] = useState('1');

  const updateCurrentPage = useCallback((page: number) => {
    if (page !== currentPageRef.current) {
      currentPageRef.current = page;
      setCurrentPage(page);
      setPageInputValue(String(page));
      onPageChange?.(page);
    }
  }, [onPageChange]);

  // Track current page via scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const handleScroll = () => {
      const pages = container.querySelectorAll('[data-page-number]');
      if (pages.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      let visiblePage = 1;

      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        if (rect.top <= containerTop + 50) {
          visiblePage = Number(page.getAttribute('data-page-number'));
        }
      }

      updateCurrentPage(visiblePage);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [numPages, updateCurrentPage]);

  function onDocumentLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    setError(false);
  }

  function onDocumentLoadError() {
    setError(true);
  }

  const scrollToPage = useCallback((page: number) => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-page-number="${page}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, numPages));
    updateCurrentPage(clamped);
    scrollToPage(clamped);
  }, [numPages, updateCurrentPage, scrollToPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputCommit = () => {
    const val = parseInt(pageInputValue, 10);
    if (!isNaN(val) && val >= 1 && val <= numPages) {
      goToPage(val);
    } else {
      setPageInputValue(String(currentPage));
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputCommit();
    }
  };

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3));
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.4));

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Previous page"
          >
            &#9664;
          </button>
          <span className="pdf-page-info">
            <input
              type="text"
              className="pdf-page-input"
              value={pageInputValue}
              onChange={handlePageInputChange}
              onBlur={handlePageInputCommit}
              onKeyDown={handlePageInputKeyDown}
            />
            <span className="pdf-page-total">/ {numPages}</span>
          </span>
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            title="Next page"
          >
            &#9654;
          </button>
        </div>

        <div className="pdf-toolbar-group">
          <button className="pdf-nav-btn" onClick={zoomOut} title="Zoom out">
            &#8722;
          </button>
          <span className="pdf-zoom-level">{Math.round(scale * 100)}%</span>
          <button className="pdf-nav-btn" onClick={zoomIn} title="Zoom in">
            &#43;
          </button>
        </div>

        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
        >
          Open in New Tab
        </a>
      </div>

      {error && (
        <div className="pdf-error">
          <p>Failed to load PDF.</p>
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

      <div className="pdf-pages-container" ref={containerRef}>
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="pdf-loading">Loading PDF...</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i + 1}
              data-page-number={i + 1}
              className="pdf-page-wrapper"
            >
              <Page
                pageNumber={i + 1}
                scale={scale}
                loading=""
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
