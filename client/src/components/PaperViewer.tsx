import { useState, useEffect, useCallback, useRef } from 'react';
import { SavedPaper, ArxivPaper, Comment, CommentPositionRect, Tag } from '../types';
import * as api from '../services/api';
import PDFViewer from './PDFViewer';
import CommentPanel from './CommentPanel';
import ChatPanel from './ChatPanel';
import WorldlineSidebarPanel from './WorldlineSidebarPanel';
import WorldlineNavOverlay from './WorldlineNavOverlay';
import FloatingCommentBox from './FloatingCommentBox';
import LaTeX from './LaTeX';
import Icon from './Icon';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

function isSavedPaper(paper: SavedPaper | ArxivPaper): paper is SavedPaper {
  return 'arxiv_id' in paper;
}

interface Props {
  paper: SavedPaper | ArxivPaper;
  isInLibrary: boolean;
  onSavePaper?: () => Promise<void>;
  onDeletePaper?: () => Promise<void>;
  showNotification: (msg: string) => void;
  favoriteAuthorNames: Set<string>;
  onFavoriteAuthor: (name: string) => void;
  onSearchAuthor: (name: string) => void;
  onOpenPaper: (paper: SavedPaper) => void;
  browsePapers?: ArxivPaper[];
  browsePageOffset?: number;
  browseTotalResults?: number;
  onBrowseNavigate?: (paper: ArxivPaper) => void;
  onImmersiveModeChange?: (immersive: boolean) => void;
  initialPage?: number;
}

type SidebarSection = 'comments' | 'chat' | 'worldline';

export default function PaperViewer({ paper, isInLibrary, onSavePaper, onDeletePaper, showNotification, favoriteAuthorNames, onFavoriteAuthor, onSearchAuthor, onOpenPaper, browsePapers, browsePageOffset = 0, browseTotalResults = 0, onBrowseNavigate, onImmersiveModeChange, initialPage }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [paperTags, setPaperTags] = useState<Tag[]>([]);
  const [currentTier, setCurrentTier] = useState<number | null>(
    isSavedPaper(paper) ? paper.tier : null,
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<SidebarSection>>(new Set());
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [jumpToPage, setJumpToPage] = useState<number | undefined>(initialPage);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingToScribe, setSendingToScribe] = useState(false);
  const [pdfSelection, setPdfSelection] = useState<{ text: string; pageNumber: number; rects: CommentPositionRect[] } | null>(null);
  const [floatingCommentAnchor, setFloatingCommentAnchor] = useState<{ x: number; y: number } | null>(null);
  const [worldlineNavOpen, setWorldlineNavOpen] = useState(false);

  const handleRequestAddComment = useCallback((anchor: { x: number; y: number }) => {
    setFloatingCommentAnchor(anchor);
  }, []);

  const closeFloatingComment = useCallback(() => {
    setFloatingCommentAnchor(null);
    setPdfSelection(null);
  }, []);

  const saved = isSavedPaper(paper) ? paper : null;
  const arxivId = saved ? saved.arxiv_id : (paper as ArxivPaper).id;
  const absUrl = saved ? saved.abs_url : (paper as ArxivPaper).absUrl;
  const authors = saved ? JSON.parse(saved.authors) as string[] : (paper as ArxivPaper).authors;
  const categories = saved ? JSON.parse(saved.categories) as string[] : (paper as ArxivPaper).categories;

  // Browse navigation
  const browseIndex = browsePapers && browsePapers.length > 0
    ? browsePapers.findIndex(p => p.id === arxivId)
    : -1;
  const canBrowseNav = browseIndex >= 0 && onBrowseNavigate;
  const hasPrev = canBrowseNav && browseIndex > 0;
  const hasNext = canBrowseNav && browseIndex < browsePapers!.length - 1;

  const loadComments = useCallback(async () => {
    const s = isSavedPaper(paper) ? paper : null;
    if (!s) return;
    try {
      const data = await api.getComments(s.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }, [paper]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    const s = isSavedPaper(paper) ? paper : null;
    if (!s) return;
    try {
      await api.deleteComment(s.id, commentId);
      await loadComments();
    } catch {
      showNotification('Failed to delete comment');
    }
  }, [paper, loadComments, showNotification]);

  const loadPaperTags = useCallback(async () => {
    const s = isSavedPaper(paper) ? paper : null;
    if (!s) return;
    try {
      const data = await api.getPaperTags(s.id);
      setPaperTags(data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [paper]);

  useEffect(() => {
    loadComments();
    loadPaperTags();
    setPdfSelection(null);
    setFloatingCommentAnchor(null);
    setCurrentTier(isSavedPaper(paper) ? paper.tier : null);
  }, [loadComments, loadPaperTags, paper]);

  // Notify parent when immersive mode changes
  useEffect(() => {
    onImmersiveModeChange?.(immersiveMode);
  }, [immersiveMode, onImmersiveModeChange]);

  // Escape key exits immersive mode
  useEffect(() => {
    if (!immersiveMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImmersiveMode(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [immersiveMode]);

  // Re-arm page jump + open sidebar whenever parent supplies a new initialPage
  useEffect(() => {
    if (initialPage !== undefined) {
      setJumpToPage(initialPage);
      setSidebarVisible(true);
      setCollapsedSections(prev => {
        if (!prev.has('comments')) return prev;
        const next = new Set(prev);
        next.delete('comments');
        return next;
      });
    }
  }, [initialPage]);

  const toggleSection = useCallback((section: SidebarSection) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const togglePanel = useCallback(() => setSidebarVisible(v => !v), []);
  useKeyboardShortcut('pdfPanelToggle', togglePanel);

  const toggleImmersive = useCallback(() => setImmersiveMode(m => !m), []);
  useKeyboardShortcut('pdfImmersiveToggle', toggleImmersive);

  const openWorldlineNav = useCallback(() => {
    if (saved) setWorldlineNavOpen(true);
  }, [saved]);
  useKeyboardShortcut('pdfWorldlineToggle', openWorldlineNav, !!saved && !worldlineNavOpen);

  const handleTierChange = useCallback(async (tier: number | null) => {
    if (!saved) return;
    const prev = currentTier;
    setCurrentTier(tier);
    try {
      await api.updatePaperTier(saved.id, tier);
    } catch {
      setCurrentTier(prev);
      showNotification('Failed to update tier');
    }
  }, [saved, currentTier, showNotification]);

  const setTier0 = useCallback(() => { handleTierChange(0); }, [handleTierChange]);
  const setTier1 = useCallback(() => { handleTierChange(1); }, [handleTierChange]);
  const setTier2 = useCallback(() => { handleTierChange(2); }, [handleTierChange]);
  const setTier3 = useCallback(() => { handleTierChange(3); }, [handleTierChange]);
  const setTier4 = useCallback(() => { handleTierChange(4); }, [handleTierChange]);
  useKeyboardShortcut('pdfTierSet0', setTier0, !!saved);
  useKeyboardShortcut('pdfTierSet1', setTier1, !!saved);
  useKeyboardShortcut('pdfTierSet2', setTier2, !!saved);
  useKeyboardShortcut('pdfTierSet3', setTier3, !!saved);
  useKeyboardShortcut('pdfTierSet4', setTier4, !!saved);

  // Swipe left/right to navigate between papers (mobile)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const viewerBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canBrowseNav) return;
    const el = viewerBodyRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
      if (dx > 0 && hasPrev) {
        onBrowseNavigate!(browsePapers![browseIndex - 1]);
      } else if (dx < 0 && hasNext) {
        onBrowseNavigate!(browsePapers![browseIndex + 1]);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [canBrowseNav, hasPrev, hasNext, browseIndex, browsePapers, onBrowseNavigate]);

  return (
    <div className={`paper-viewer ${immersiveMode ? 'immersive-mode' : ''}`}>
      <div className="viewer-header">
        <div className="viewer-title-row">
          <h2><LaTeX>{paper.title}</LaTeX></h2>
          <div className="viewer-title-actions">
            {canBrowseNav && (
              <div className="browse-nav">
                <button
                  className="btn btn-secondary btn-sm browse-nav-btn"
                  disabled={!hasPrev}
                  onClick={() => hasPrev && onBrowseNavigate!(browsePapers![browseIndex - 1])}
                  title="Previous paper in browse list"
                >
                  &#8592; Prev
                </button>
                <span className="browse-nav-index">
                  {browsePageOffset + browseIndex + 1}/{browseTotalResults || browsePapers!.length}
                </span>
                <button
                  className="btn btn-secondary btn-sm browse-nav-btn"
                  disabled={!hasNext}
                  onClick={() => hasNext && onBrowseNavigate!(browsePapers![browseIndex + 1])}
                  title="Next paper in browse list"
                >
                  Next &#8594;
                </button>
              </div>
            )}
            {saved && (
              <select
                className={`tier-select tier-select-header tier-select-${currentTier ?? 'ungraded'}`}
                value={currentTier === null ? '' : String(currentTier)}
                onChange={e => {
                  const v = e.target.value;
                  handleTierChange(v === '' ? null : parseInt(v, 10));
                }}
                title={currentTier === null ? 'Ungraded — press 0–4 to grade' : `T${currentTier} — press 0–4 to change`}
              >
                <option value="">—</option>
                <option value="0">T0</option>
                <option value="1">T1</option>
                <option value="2">T2</option>
                <option value="3">T3</option>
                <option value="4">T4</option>
              </select>
            )}
            {absUrl && !arxivId.startsWith('upload-') && (
              <a
                href={absUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                ArXiv Page
              </a>
            )}
            {isInLibrary ? (
              <>
                <button className="btn btn-success btn-sm" disabled>
                  In Library
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={sendingToScribe}
                  onClick={async () => {
                    if (!saved) return;
                    if (!confirm(`Send "${paper.title}" to Scribe? It will be removed from Navigate.`)) return;
                    setSendingToScribe(true);
                    try {
                      const result = await api.sendToScribe([saved.id]);
                      if (result.sent > 0) {
                        showNotification('Sent to Scribe');
                        if (onDeletePaper) await onDeletePaper();
                      } else {
                        showNotification(result.errors[0] || 'Failed to send to Scribe');
                      }
                    } catch {
                      showNotification('Failed to send to Scribe. Is Scribe running?');
                    } finally {
                      setSendingToScribe(false);
                    }
                  }}
                >
                  {sendingToScribe ? 'Sending...' : 'Send to Scribe'}
                </button>
                {onDeletePaper && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!confirm(`Delete "${paper.title}" from your library?`)) return;
                      await onDeletePaper();
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  if (onSavePaper) {
                    setSaving(true);
                    try {
                      await onSavePaper();
                    } finally {
                      setSaving(false);
                    }
                  }
                }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
        <div className="viewer-meta">
          <span className="paper-authors">
            {authors.map((author, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <button
                  className={`author-name-btn ${favoriteAuthorNames.has(author) ? 'is-favorite' : ''}`}
                  onClick={() => !favoriteAuthorNames.has(author) && onFavoriteAuthor(author)}
                  onContextMenu={(e) => { e.preventDefault(); onSearchAuthor(author); }}
                  title={favoriteAuthorNames.has(author) ? 'Already in favorites' : `Add ${author} to favorites | Right-click to search`}
                >
                  {author}
                </button>
              </span>
            ))}
          </span>
          <span>{new Date(paper.published).toLocaleDateString()}</span>
          {categories.map(c => (
            <span key={c} className={`category-badge cat-${c.includes('.') ? c.split('.')[0] : c}`}>{c}</span>
          ))}
          {paperTags.map(t => (
            <span key={t.id} className="tag-badge" style={{ backgroundColor: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className="viewer-body" ref={viewerBodyRef}>
        <div className="viewer-pdf">
          <PDFViewer
            pdfUrl={saved?.pdf_path ? api.getLocalPdfUrl(saved.id) : (arxivId.startsWith('upload-') ? '' : api.getPdfProxyUrl(arxivId))}
            onPageChange={setCurrentPage}
            immersiveMode={immersiveMode}
            onToggleImmersive={() => setImmersiveMode(m => !m)}
            jumpToPage={jumpToPage}
            onJumpApplied={() => setJumpToPage(undefined)}
            onTextSelected={saved ? setPdfSelection : undefined}
            onRequestAddComment={saved ? handleRequestAddComment : undefined}
            comments={comments}
            onDeleteComment={saved ? handleDeleteComment : undefined}
          />
          {saved && (
            <div className="panel-zone">
              <button
                className={`floating-toggle ${sidebarVisible ? 'floating-toggle-active' : ''}`}
                onClick={() => setSidebarVisible(v => !v)}
                title={sidebarVisible ? 'Hide panel' : 'Show panel'}
              >
                <Icon name="sidebar-right" />
              </button>
            </div>
          )}
        </div>

        {sidebarVisible && <div className="viewer-sidebar-backdrop active" onClick={() => setSidebarVisible(false)} />}
        {sidebarVisible && saved && <div className="viewer-sidebar">
          <div className={`sidebar-stack-section ${collapsedSections.has('comments') ? 'collapsed' : ''}`}>
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('comments')}
            >
              <span className="sidebar-section-caret">{collapsedSections.has('comments') ? '▸' : '▾'}</span>
              <span>Comments ({comments.length})</span>
            </button>
            {!collapsedSections.has('comments') && (
              <div className="sidebar-section-body">
                <CommentPanel
                  paperId={saved.id}
                  comments={comments}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onRefresh={loadComments}
                  showNotification={showNotification}
                  selection={pdfSelection}
                  onClearSelection={() => setPdfSelection(null)}
                />
              </div>
            )}
          </div>

          <div className={`sidebar-stack-section sidebar-stack-section-grow ${collapsedSections.has('chat') ? 'collapsed' : ''}`}>
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('chat')}
            >
              <span className="sidebar-section-caret">{collapsedSections.has('chat') ? '▸' : '▾'}</span>
              <span>Chat</span>
            </button>
            {!collapsedSections.has('chat') && (
              <div className="sidebar-section-body sidebar-section-body-chat">
                <ChatPanel
                  paper={saved}
                  showNotification={showNotification}
                />
              </div>
            )}
          </div>

          <div className={`sidebar-stack-section ${collapsedSections.has('worldline') ? 'collapsed' : ''}`}>
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('worldline')}
            >
              <span className="sidebar-section-caret">{collapsedSections.has('worldline') ? '▸' : '▾'}</span>
              <span>Worldline</span>
            </button>
            {!collapsedSections.has('worldline') && (
              <div className="sidebar-section-body">
                <WorldlineSidebarPanel
                  paper={saved}
                  onOpenPaper={onOpenPaper}
                  showNotification={showNotification}
                />
              </div>
            )}
          </div>
        </div>}
      </div>
      {saved && floatingCommentAnchor && pdfSelection && (
        <FloatingCommentBox
          paperId={saved.id}
          selection={pdfSelection}
          position={floatingCommentAnchor}
          onClose={closeFloatingComment}
          onAdded={loadComments}
          showNotification={showNotification}
        />
      )}
      {saved && worldlineNavOpen && (
        <WorldlineNavOverlay
          paper={saved}
          onOpenPaper={onOpenPaper}
          onClose={() => setWorldlineNavOpen(false)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}
