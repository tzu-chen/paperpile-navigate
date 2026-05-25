import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import Icon from './Icon';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { Comment, CommentPositionRect } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const documentOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  // Cap decoded image size to ~25 megapixels to prevent mobile browser crashes
  // from papers with oversized embedded graphics (e.g. 10000x6000 figures).
  maxImageSize: 25 * 1024 * 1024,
};

interface OutlineItem {
  title: string;
  bold: boolean;
  italic: boolean;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineItem[];
}

interface Props {
  pdfUrl: string;
  onPageChange?: (page: number) => void;
  immersiveMode?: boolean;
  onToggleImmersive?: () => void;
  jumpToPage?: number;
  onJumpApplied?: () => void;
  onTextSelected?: (selection: {
    text: string;
    pageNumber: number;
    rects: CommentPositionRect[];
  } | null) => void;
  onRequestAddComment?: (anchor: { x: number; y: number }) => void;
  comments?: Comment[];
  onDeleteComment?: (commentId: number) => void | Promise<void>;
}

// Detect mobile once — used to tune buffer sizes and canvas resolution
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

// Cap canvas resolution at 2x for crisp text without excess memory use.
const canvasPixelRatio = Math.min(window.devicePixelRatio || 1, 2);


export default function PDFViewer({ pdfUrl, onPageChange, immersiveMode, onToggleImmersive, jumpToPage, onJumpApplied, onTextSelected, onRequestAddComment, comments, onDeleteComment }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [pdfDarkTheme, setPdfDarkTheme] = useState(() => {
    const stored = localStorage.getItem('pdfDarkTheme');
    if (stored !== null) return stored === 'true';
    return document.documentElement.getAttribute('data-theme-type') === 'dark';
  });
  const [pdfThemeOverride, setPdfThemeOverride] = useState(() => {
    return localStorage.getItem('pdfDarkTheme') !== null;
  });
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(1);
  // Browser-style back/forward history for in-PDF jumps (TOC clicks, internal
  // links). Manual scrolling does not push entries; only "jumps" do. ArrowLeft
  // walks back, ArrowRight walks forward.
  const jumpHistoryRef = useRef<number[]>([]);
  const jumpIndexRef = useRef(-1);
  const [jumpHint, setJumpHint] = useState<number | null>(null);
  const jumpHintTimerRef = useRef<number | null>(null);
  const [pageInputValue, setPageInputValue] = useState('1');
  // Stores the bounding rect of the active text selection in viewport coords.
  // Used to position the "Add comment" popup AND the floating box that opens on click.
  const [selectionPopup, setSelectionPopup] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null);
  const selectionPopupRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const hasInitialScale = useRef(false);
  const pageWidthRef = useRef(0);
  const lastContainerWidthRef = useRef(0);
  const pageHeightRef = useRef(0);

  const updateCurrentPage = useCallback((page: number) => {
    if (page !== currentPageRef.current) {
      currentPageRef.current = page;
      setCurrentPage(page);
      setPageInputValue(String(page));
      onPageChange?.(page);
    }
  }, [onPageChange]);

  // Reset state when PDF changes
  useEffect(() => {
    hasInitialScale.current = false;
    pageWidthRef.current = 0;
    pageHeightRef.current = 0;
    setVisiblePages(new Set([1]));
    jumpHistoryRef.current = [];
    jumpIndexRef.current = -1;
  }, [pdfUrl]);

  // Re-fit PDF to width on container resize (e.g. orientation change on mobile)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (pageWidthRef.current <= 0) return;
      const currentWidth = container.clientWidth;
      // Only refit when width change is significant (>50px) to filter out scrollbar jitter
      if (Math.abs(currentWidth - lastContainerWidthRef.current) > 50) {
        lastContainerWidthRef.current = currentWidth;
        const containerWidth = currentWidth - 20;
        if (containerWidth > 0) {
          setScale(containerWidth / pageWidthRef.current);
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Sync PDF dark mode with app theme when no user override
  useEffect(() => {
    if (pdfThemeOverride) return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute('data-theme-type') === 'dark';
      setPdfDarkTheme(isDark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-type'] });
    return () => observer.disconnect();
  }, [pdfThemeOverride]);

  // Track current page via scroll position and update visible pages for virtualization
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const BUFFER = isMobile ? 1 : 3; // fewer buffered pages on mobile to save memory

    const updateVisibility = () => {
      const pages = container.querySelectorAll('[data-page-number]');
      if (pages.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      const containerBottom = containerTop + container.clientHeight;
      let visiblePage = 1;
      const newVisible = new Set<number>();

      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        if (rect.top <= containerTop + 50) {
          const pageNum = Number(page.getAttribute('data-page-number'));
          if (!isNaN(pageNum)) {
            visiblePage = pageNum;
          }
        }
        // Check if page is in or near the viewport
        const pageNum = Number(page.getAttribute('data-page-number'));
        if (!isNaN(pageNum) && rect.bottom >= containerTop - container.clientHeight * BUFFER && rect.top <= containerBottom + container.clientHeight * BUFFER) {
          newVisible.add(pageNum);
        }
      }

      // Always include a buffer around current page as fallback
      for (let i = Math.max(1, visiblePage - BUFFER); i <= Math.min(numPages, visiblePage + BUFFER); i++) {
        newVisible.add(i);
      }

      updateCurrentPage(visiblePage);
      setVisiblePages(prev => {
        // Avoid unnecessary re-renders by checking if the set actually changed
        if (prev.size === newVisible.size && [...newVisible].every(p => prev.has(p))) return prev;
        return newVisible;
      });
    };

    // Initial visibility calculation
    updateVisibility();

    container.addEventListener('scroll', updateVisibility, { passive: true });
    return () => container.removeEventListener('scroll', updateVisibility);
  }, [numPages, updateCurrentPage]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDocumentLoadSuccess(pdf: any) {
    setNumPages(pdf.numPages);
    pdfDocRef.current = pdf;
    setError(false);

    // Calculate fit-to-width scale from the first page
    if (!hasInitialScale.current) {
      hasInitialScale.current = true;
      pdf.getPage(1).then((page: { getViewport: (opts: { scale: number }) => { width: number; height: number } }) => {
        const container = containerRef.current;
        if (!container) return;
        const viewport = page.getViewport({ scale: 1 });
        // Account for padding/scrollbar in the container
        const containerWidth = container.clientWidth - 20;
        pageWidthRef.current = viewport.width;
        pageHeightRef.current = viewport.height;
        lastContainerWidthRef.current = container.clientWidth;
        if (viewport.width > 0 && containerWidth > 0) {
          const fitScale = containerWidth / viewport.width;
          setScale(fitScale);
        }
      }).catch(() => {
        // Keep default scale on error
      });
    }

    pdf.getOutline().then((items: OutlineItem[] | null) => {
      if (items && items.length > 0) {
        setOutline(items);
        // Expand top-level items by default
        const topLevel = new Set(items.map((_: OutlineItem, i: number) => String(i)));
        setExpandedItems(topLevel);
      } else {
        setOutline([]);
      }
    }).catch(() => {
      setOutline([]);
    });
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
    if (isNaN(page)) return;
    const clamped = Math.max(1, Math.min(page, numPages));
    updateCurrentPage(clamped);
    scrollToPage(clamped);
  }, [numPages, updateCurrentPage, scrollToPage]);

  // Capture text selections inside the PDF and forward to the parent. Only emit
  // on non-empty selections — clearing the selection (e.g., focusing the
  // comment textarea) must not wipe the parent's captured snapshot.
  useEffect(() => {
    if (!onTextSelected && !onRequestAddComment) return;
    const container = containerRef.current;
    if (!container) return;

    const captureSelection = () => {
      // Defer one tick so the browser finalizes the selection after mouseup/touchend.
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const text = sel.toString().trim();
        if (!text) return;
        const anchor = sel.anchorNode;
        if (!anchor || !container.contains(anchor)) return;
        const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element);
        const pageEl = el?.closest('[data-page-number]');
        const pageNum = pageEl ? Number(pageEl.getAttribute('data-page-number')) : NaN;
        if (!pageEl || isNaN(pageNum)) return;

        // Compute normalized rects (x,y,w,h as fractions of the page's rendered size)
        // so underline marks scale with zoom. getClientRects() returns one rect per
        // visual fragment (typically one per line of the selection).
        const range = sel.getRangeAt(0);
        const clientRects = range.getClientRects();
        const pageWrappers = container.querySelectorAll('[data-page-number]');
        const pageRectCache = new Map<number, DOMRect>();
        const rects: CommentPositionRect[] = [];
        for (let i = 0; i < clientRects.length; i++) {
          const cr = clientRects[i];
          if (cr.width <= 0 || cr.height <= 0) continue;
          const cx = (cr.left + cr.right) / 2;
          const cy = (cr.top + cr.bottom) / 2;
          let matchedPage: number | null = null;
          let matchedRect: DOMRect | null = null;
          for (const wrapper of pageWrappers) {
            const p = Number(wrapper.getAttribute('data-page-number'));
            let pr = pageRectCache.get(p);
            if (!pr) {
              const pageDiv = wrapper.querySelector('.react-pdf__Page') || wrapper;
              pr = (pageDiv as Element).getBoundingClientRect();
              pageRectCache.set(p, pr);
            }
            if (cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom) {
              matchedPage = p;
              matchedRect = pr;
              break;
            }
          }
          if (matchedPage === null || !matchedRect || matchedRect.width === 0 || matchedRect.height === 0) continue;
          rects.push({
            page: matchedPage,
            x: (cr.left - matchedRect.left) / matchedRect.width,
            y: (cr.top - matchedRect.top) / matchedRect.height,
            w: cr.width / matchedRect.width,
            h: cr.height / matchedRect.height,
          });
        }

        onTextSelected?.({ text, pageNumber: pageNum, rects });
        if (onRequestAddComment) {
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            setSelectionPopup({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
          }
        }
      }, 0);
    };

    container.addEventListener('mouseup', captureSelection);
    container.addEventListener('touchend', captureSelection);
    return () => {
      container.removeEventListener('mouseup', captureSelection);
      container.removeEventListener('touchend', captureSelection);
    };
  }, [onTextSelected, onRequestAddComment]);

  // Dismiss the selection popup on scroll, page-input typing, or clicks outside it.
  useEffect(() => {
    if (!selectionPopup) return;
    const container = containerRef.current;
    const onScroll = () => setSelectionPopup(null);
    const onDocMouseDown = (e: MouseEvent) => {
      if (selectionPopupRef.current?.contains(e.target as Node)) return;
      setSelectionPopup(null);
    };
    container?.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      container?.removeEventListener('scroll', onScroll);
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [selectionPopup]);

  // Apply externally-requested page jumps once the document is loaded.
  // Waits for numPages > 0 so a jump issued before load still lands correctly.
  useEffect(() => {
    if (jumpToPage === undefined || numPages === 0) return;
    goToPage(jumpToPage);
    onJumpApplied?.();
  }, [jumpToPage, numPages, goToPage, onJumpApplied]);

  // Briefly overlay the destination page number — gives a clear visual cue
  // during smooth-scroll jumps where the page change isn't immediate.
  const showJumpHint = useCallback((page: number) => {
    setJumpHint(page);
    if (jumpHintTimerRef.current !== null) {
      window.clearTimeout(jumpHintTimerRef.current);
    }
    jumpHintTimerRef.current = window.setTimeout(() => {
      setJumpHint(null);
      jumpHintTimerRef.current = null;
    }, 900);
  }, []);

  useEffect(() => () => {
    if (jumpHintTimerRef.current !== null) {
      window.clearTimeout(jumpHintTimerRef.current);
    }
  }, []);

  // Record a TOC/link jump: snapshot the page we're leaving (so ArrowLeft can
  // return there), then push the destination. Discards forward history because
  // a new jump branches off the current point.
  const recordJump = useCallback((target: number) => {
    const current = currentPageRef.current;
    const history = jumpHistoryRef.current.slice(0, jumpIndexRef.current + 1);
    if (history.length === 0 || history[history.length - 1] !== current) {
      history.push(current);
    }
    if (history[history.length - 1] !== target) {
      history.push(target);
    }
    jumpHistoryRef.current = history;
    jumpIndexRef.current = history.length - 1;
  }, []);

  const jumpBack = useCallback(() => {
    if (jumpIndexRef.current <= 0) return false;
    jumpIndexRef.current -= 1;
    const target = jumpHistoryRef.current[jumpIndexRef.current];
    showJumpHint(target);
    goToPage(target);
    return true;
  }, [goToPage, showJumpHint]);

  const jumpForward = useCallback(() => {
    if (jumpIndexRef.current >= jumpHistoryRef.current.length - 1) return false;
    jumpIndexRef.current += 1;
    const target = jumpHistoryRef.current[jumpIndexRef.current];
    showJumpHint(target);
    goToPage(target);
    return true;
  }, [goToPage, showJumpHint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      if (e.key === 'ArrowLeft') {
        if (jumpBack()) e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        if (jumpForward()) e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jumpBack, jumpForward]);

  // react-pdf's <Document> captures onItemClick inside a useRef on first render,
  // so any closure passed inline would see numPages=0 and clamp every jump to page 1.
  // Route through a ref to always hit the current goToPage.
  const goToPageRef = useRef(goToPage);
  useEffect(() => {
    goToPageRef.current = goToPage;
  }, [goToPage]);
  const handleItemClick = useCallback(({ pageNumber }: { pageNumber: number }) => {
    recordJump(pageNumber);
    showJumpHint(pageNumber);
    goToPageRef.current(pageNumber);
  }, [recordJump, showJumpHint]);

  const navigateToOutlineDest = useCallback(async (dest: string | unknown[] | null) => {
    if (!dest || !pdfDocRef.current) return;

    try {
      let explicitDest = dest;
      if (typeof dest === 'string') {
        explicitDest = await pdfDocRef.current.getDestination(dest);
      }
      if (Array.isArray(explicitDest)) {
        const ref = explicitDest[0];
        const pageIndex = await pdfDocRef.current.getPageIndex(ref);
        if (typeof pageIndex === 'number' && !isNaN(pageIndex)) {
          recordJump(pageIndex + 1);
          showJumpHint(pageIndex + 1);
          goToPage(pageIndex + 1);
        }
      }
    } catch (err) {
      console.error('Failed to navigate to outline destination:', err);
    }
  }, [goToPage, recordJump, showJumpHint]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

  // Index comments with stored position rects by page so we can render
  // underline marks inside each visible page wrapper.
  const annotationsByPage = useMemo(() => {
    const map = new Map<number, Array<{ comment: Comment; rect: CommentPositionRect }>>();
    if (!comments) return map;
    for (const c of comments) {
      if (!c.position_rects) continue;
      let parsed: CommentPositionRect[];
      try {
        parsed = JSON.parse(c.position_rects) as CommentPositionRect[];
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const r of parsed) {
        if (typeof r?.page !== 'number') continue;
        const list = map.get(r.page) || [];
        list.push({ comment: c, rect: r });
        map.set(r.page, list);
      }
    }
    return map;
  }, [comments]);

  const toggleOutline = useCallback(() => setOutlineOpen(o => !o), []);
  useKeyboardShortcut('pdfTocToggle', toggleOutline, outline.length > 0);

  const togglePdfDarkTheme = () => {
    setPdfDarkTheme(prev => {
      const next = !prev;
      localStorage.setItem('pdfDarkTheme', String(next));
      setPdfThemeOverride(true);
      return next;
    });
  };

  const resetPdfThemeToAuto = () => {
    localStorage.removeItem('pdfDarkTheme');
    setPdfThemeOverride(false);
    const isDark = document.documentElement.getAttribute('data-theme-type') === 'dark';
    setPdfDarkTheme(isDark);
  };

  function renderOutlineItems(items: OutlineItem[], level: number = 0, parentKey: string = '') {
    return items.map((item, index) => {
      const key = parentKey ? `${parentKey}-${index}` : String(index);
      const hasChildren = item.items && item.items.length > 0;
      const isExpanded = expandedItems.has(key);

      return (
        <div key={key} className="pdf-outline-item">
          <div
            className="pdf-outline-item-row"
            style={{ paddingLeft: `${8 + level * 16}px` }}
          >
            {hasChildren ? (
              <button
                className="pdf-outline-toggle"
                onClick={() => toggleExpanded(key)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <span className={`pdf-outline-chevron ${isExpanded ? 'open' : ''}`}>&#9654;</span>
              </button>
            ) : (
              <span className="pdf-outline-toggle-spacer" />
            )}
            <button
              className={`pdf-outline-link ${item.bold ? 'bold' : ''}`}
              onClick={() => navigateToOutlineDest(item.dest)}
              title={item.title}
            >
              {item.title}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <div className="pdf-outline-children">
              {renderOutlineItems(item.items, level + 1, key)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className={`pdf-viewer ${pdfDarkTheme ? 'pdf-dark-theme' : ''}`}>
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Previous page"
          >
            <Icon name="triangle-left" />
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
            <Icon name="triangle-right" />
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

        <div className="pdf-toolbar-group">
          <button
            className={`pdf-nav-btn ${pdfDarkTheme ? 'pdf-nav-btn-active' : ''} ${pdfThemeOverride ? 'pdf-theme-override' : ''}`}
            onClick={togglePdfDarkTheme}
            onDoubleClick={resetPdfThemeToAuto}
            title={pdfDarkTheme
              ? `Switch to light mode${pdfThemeOverride ? ' (double-click to reset to auto)' : ''}`
              : `Switch to dark mode${pdfThemeOverride ? ' (double-click to reset to auto)' : ''}`}
          >
            {pdfDarkTheme ? <Icon name="sun" /> : <Icon name="moon" />}
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            Open in New Tab
          </a>
        </div>
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

      <div className="pdf-content-area">
        {outlineOpen && outline.length > 0 && (
          <div className="pdf-outline-panel">
            <div className="pdf-outline-header">
              <span className="pdf-outline-title">Outline</span>
              <button
                className="pdf-outline-close"
                onClick={() => setOutlineOpen(false)}
                title="Close outline"
              >
                <Icon name="x-mark" />
              </button>
            </div>
            <div className="pdf-outline-list">
              {renderOutlineItems(outline)}
            </div>
          </div>
        )}

        <div className="pdf-pages-wrapper">
          {outline.length > 0 && (
            <div className="toc-zone">
              <button
                className={`floating-toggle ${outlineOpen ? 'floating-toggle-active' : ''}`}
                onClick={() => setOutlineOpen(o => !o)}
                title="Table of contents"
              >
                <Icon name="sidebar-left" />
              </button>
            </div>
          )}
          {onToggleImmersive && (
            <div className="immersive-zone">
              <button
                className={`floating-toggle ${immersiveMode ? 'floating-toggle-active' : ''}`}
                onClick={onToggleImmersive}
                title={immersiveMode ? 'Exit immersive mode (Esc)' : 'Immersive mode — hide all toolbars'}
              >
                {immersiveMode ? <Icon name="close" /> : <Icon name="expand" />}
              </button>
            </div>
          )}
          {jumpHint !== null && (
            <div key={`hint-${jumpHint}-${jumpIndexRef.current}`} className="pdf-jump-hint" aria-hidden="true">
              <span className="pdf-jump-hint-page">{jumpHint}</span>
              <span className="pdf-jump-hint-total">/ {numPages}</span>
            </div>
          )}
          <div className="pdf-pages-container" ref={containerRef}>
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="pdf-loading">Loading PDF...</div>}
            options={documentOptions}
            externalLinkTarget="_blank"
            externalLinkRel="noopener noreferrer"
            onItemClick={handleItemClick}
          >
            {Array.from({ length: numPages }, (_, i) => {
              const pageNum = i + 1;
              const isVisible = visiblePages.has(pageNum);
              const pageAnnotations = annotationsByPage.get(pageNum);
              const pageW = pageWidthRef.current > 0 ? pageWidthRef.current * scale : 0;
              const pageH = pageHeightRef.current > 0 ? pageHeightRef.current * scale : 0;
              return (
                <div
                  key={pageNum}
                  data-page-number={pageNum}
                  className="pdf-page-wrapper"
                  style={!isVisible && pageHeightRef.current > 0
                    ? { height: `${pageH}px`, minHeight: `${pageH}px` }
                    : undefined}
                >
                  {isVisible ? (
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      devicePixelRatio={canvasPixelRatio}
                      loading=""
                      error={
                        <div className="pdf-page-error">
                          <p>Page {pageNum} failed to render</p>
                        </div>
                      }
                    />
                  ) : null}
                  {isVisible && pageAnnotations && pageAnnotations.length > 0 && pageW > 0 && pageH > 0 && (
                    <div
                      className="pdf-page-comment-overlay"
                      style={{ width: pageW, height: pageH }}
                    >
                      {pageAnnotations.map((a, idx) => (
                        <div
                          key={`${a.comment.id}-${idx}`}
                          className="pdf-comment-mark"
                          style={{
                            left: `${a.rect.x * 100}%`,
                            // Sit on the text baseline — slightly above the bottom
                            // of the line box (which includes descenders).
                            top: `${(a.rect.y + a.rect.h * 0.78) * 100}%`,
                            width: `${a.rect.w * 100}%`,
                          }}
                        >
                          <div className="pdf-comment-tooltip">
                            {onDeleteComment && (
                              <button
                                type="button"
                                className="pdf-comment-tooltip-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteComment(a.comment.id);
                                }}
                                title="Delete comment"
                              >
                                &times;
                              </button>
                            )}
                            <div className="pdf-comment-tooltip-content">{a.comment.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Document>
        </div>
        </div>
      </div>
      {selectionPopup && onRequestAddComment && (
        <div
          ref={selectionPopupRef}
          className="pdf-selection-popup"
          style={{ left: (selectionPopup.left + selectionPopup.right) / 2, top: selectionPopup.top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="pdf-selection-popup-btn"
            onClick={() => {
              onRequestAddComment({ x: selectionPopup.left, y: selectionPopup.bottom + 8 });
              setSelectionPopup(null);
            }}
          >
            <Icon name="pencil" />
            <span>Add comment</span>
          </button>
        </div>
      )}
    </div>
  );
}
