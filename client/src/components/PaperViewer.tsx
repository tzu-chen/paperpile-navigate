import { useState, useEffect, useCallback } from 'react';
import { SavedPaper, Comment, Tag } from '../types';
import * as api from '../services/api';
import PDFViewer from './PDFViewer';
import CommentPanel from './CommentPanel';
import TagPanel from './TagPanel';
import ExportPanel from './ExportPanel';
import ChatPanel from './ChatPanel';

interface Props {
  paper: SavedPaper;
  allTags: Tag[];
  onTagsChanged: () => Promise<void>;
  showNotification: (msg: string) => void;
  favoriteAuthorNames: Set<string>;
  onFavoriteAuthor: (name: string) => void;
}

type SidePanel = 'chat' | 'comments' | 'tags' | 'export' | 'info';

export default function PaperViewer({ paper, allTags, onTagsChanged, showNotification, favoriteAuthorNames, onFavoriteAuthor }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [paperTags, setPaperTags] = useState<Tag[]>([]);
  const [activePanel, setActivePanel] = useState<SidePanel>('comments');
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];

  const loadComments = useCallback(async () => {
    try {
      const data = await api.getComments(paper.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }, [paper.id]);

  const loadPaperTags = useCallback(async () => {
    try {
      const data = await api.getPaperTags(paper.id);
      setPaperTags(data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [paper.id]);

  useEffect(() => {
    loadComments();
    loadPaperTags();
  }, [loadComments, loadPaperTags]);

  return (
    <div className="paper-viewer">
      <div className="viewer-header">
        <div className="viewer-title-row">
          <h2>{paper.title}</h2>
          <a
            href={paper.abs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            ArXiv Page
          </a>
        </div>
        <div className="viewer-meta">
          <span className="paper-authors">
            {authors.map((author, i) => (
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
          </span>
          <span>{new Date(paper.published).toLocaleDateString()}</span>
          {categories.map(c => (
            <span key={c} className="category-badge">{c}</span>
          ))}
          {paperTags.map(t => (
            <span key={t.id} className="tag-badge" style={{ backgroundColor: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-pdf">
          <PDFViewer
            pdfUrl={api.getPdfProxyUrl(paper.arxiv_id)}
          />
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarVisible(v => !v)}
          title={sidebarVisible ? 'Hide panel' : 'Show panel'}
        >
          {sidebarVisible ? '\u25B6' : '\u25C0'}
        </button>

        {sidebarVisible && <div className="viewer-sidebar">
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${activePanel === 'chat' ? 'active' : ''}`}
              onClick={() => setActivePanel('chat')}
            >
              Chat
            </button>
            <button
              className={`sidebar-tab ${activePanel === 'comments' ? 'active' : ''}`}
              onClick={() => setActivePanel('comments')}
            >
              Comments ({comments.length})
            </button>
            <button
              className={`sidebar-tab ${activePanel === 'tags' ? 'active' : ''}`}
              onClick={() => setActivePanel('tags')}
            >
              Tags ({paperTags.length})
            </button>
            <button
              className={`sidebar-tab ${activePanel === 'export' ? 'active' : ''}`}
              onClick={() => setActivePanel('export')}
            >
              Export
            </button>
            <button
              className={`sidebar-tab ${activePanel === 'info' ? 'active' : ''}`}
              onClick={() => setActivePanel('info')}
            >
              Info
            </button>
          </div>

          <div className={`sidebar-content ${activePanel === 'chat' ? 'sidebar-content-chat' : ''}`}>
            {activePanel === 'chat' && (
              <ChatPanel
                paper={paper}
                showNotification={showNotification}
              />
            )}
            {activePanel === 'comments' && (
              <CommentPanel
                paperId={paper.id}
                comments={comments}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onRefresh={loadComments}
                showNotification={showNotification}
              />
            )}
            {activePanel === 'tags' && (
              <TagPanel
                paperId={paper.id}
                paperTags={paperTags}
                allTags={allTags}
                onRefresh={async () => { await loadPaperTags(); await onTagsChanged(); }}
                showNotification={showNotification}
              />
            )}
            {activePanel === 'export' && (
              <ExportPanel
                paper={paper}
                showNotification={showNotification}
              />
            )}
            {activePanel === 'info' && (
              <div className="info-panel">
                <div className="info-section">
                  <h4>Abstract</h4>
                  <p>{paper.summary}</p>
                </div>
                <div className="info-section">
                  <h4>Authors</h4>
                  <p className="paper-authors">
                    {authors.map((author, i) => (
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
                  </p>
                </div>
                <div className="info-section">
                  <h4>Categories</h4>
                  <p>{categories.join(', ')}</p>
                </div>
                <div className="info-section">
                  <h4>ArXiv ID</h4>
                  <p>{paper.arxiv_id}</p>
                </div>
                {paper.doi && (
                  <div className="info-section">
                    <h4>DOI</h4>
                    <p>{paper.doi}</p>
                  </div>
                )}
                {paper.journal_ref && (
                  <div className="info-section">
                    <h4>Journal</h4>
                    <p>{paper.journal_ref}</p>
                  </div>
                )}
                <div className="info-section">
                  <h4>Published</h4>
                  <p>{new Date(paper.published).toLocaleDateString()}</p>
                </div>
                <div className="info-section">
                  <h4>Last Updated</h4>
                  <p>{new Date(paper.updated).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
