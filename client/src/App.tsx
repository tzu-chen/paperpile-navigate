import { useState, useEffect, useCallback } from 'react';
import { ArxivPaper, SavedPaper, Tag, FavoriteAuthor, ViewMode } from './types';
import * as api from './services/api';
import PaperBrowser from './components/PaperBrowser';
import Library from './components/Library';
import PaperViewer from './components/PaperViewer';
import FavoriteAuthors from './components/FavoriteAuthors';
import ChatHistory from './components/ChatHistory';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [favoriteAuthors, setFavoriteAuthors] = useState<FavoriteAuthor[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<SavedPaper | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const loadLibrary = useCallback(async () => {
    try {
      const [papers, allTags] = await Promise.all([
        api.getSavedPapers(),
        api.getTags(),
      ]);
      setSavedPapers(papers);
      setTags(allTags);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, []);

  const loadFavoriteAuthors = useCallback(async () => {
    try {
      const authors = await api.getFavoriteAuthors();
      setFavoriteAuthors(authors);
    } catch (err) {
      console.error('Failed to load favorite authors:', err);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
    loadFavoriteAuthors();
  }, [loadLibrary, loadFavoriteAuthors]);

  const favoriteAuthorNames = new Set(favoriteAuthors.map(a => a.name));

  const handleFavoriteAuthor = async (name: string) => {
    try {
      await api.addFavoriteAuthor(name);
      showNotification(`Added "${name}" to favorite authors`);
      await loadFavoriteAuthors();
    } catch (err: any) {
      showNotification(err.message || 'Failed to add author');
    }
  };

  const handleSavePaper = async (paper: ArxivPaper) => {
    try {
      const saved = await api.savePaper(paper);
      await loadLibrary();
      showNotification(`Saved "${saved.title}" to library`);
      return saved;
    } catch (err) {
      showNotification('Failed to save paper');
      throw err;
    }
  };

  const handleOpenPaper = (paper: SavedPaper) => {
    setSelectedPaper(paper);
    setViewMode('viewer');
  };

  const handleOpenArxivPaper = async (paper: ArxivPaper) => {
    try {
      const saved = await api.savePaper(paper);
      await loadLibrary();
      setSelectedPaper(saved);
      setViewMode('viewer');
    } catch (err) {
      showNotification('Failed to open paper');
    }
  };

  const handleBackFromViewer = () => {
    setSelectedPaper(null);
    setViewMode('library');
    loadLibrary();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title" onClick={() => { setSelectedPaper(null); setViewMode('browse'); }}>
            Paperpile Navigate
          </h1>
          {viewMode !== 'viewer' && (
            <nav className="nav-tabs">
              <button
                className={`nav-tab ${viewMode === 'browse' ? 'active' : ''}`}
                onClick={() => setViewMode('browse')}
              >
                Browse ArXiv
              </button>
              <button
                className={`nav-tab ${viewMode === 'library' ? 'active' : ''}`}
                onClick={() => setViewMode('library')}
              >
                My Library ({savedPapers.length})
              </button>
              <button
                className={`nav-tab ${viewMode === 'authors' ? 'active' : ''}`}
                onClick={() => setViewMode('authors')}
              >
                Favorite Authors ({favoriteAuthors.length})
              </button>
              <button
                className={`nav-tab ${viewMode === 'chatHistory' ? 'active' : ''}`}
                onClick={() => setViewMode('chatHistory')}
              >
                Chat History
              </button>
            </nav>
          )}
          {viewMode === 'viewer' && (
            <button className="back-btn" onClick={handleBackFromViewer}>
              &larr; Back to Library
            </button>
          )}
        </div>
        <div className="header-right">
          <button
            className="settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            &#9881;
          </button>
        </div>
      </header>

      {notification && (
        <div className="notification">{notification}</div>
      )}

      <main className="app-main">
        {viewMode === 'browse' && (
          <PaperBrowser
            onSavePaper={handleSavePaper}
            onOpenPaper={handleOpenArxivPaper}
            savedPaperIds={new Set(savedPapers.map(p => p.arxiv_id))}
            favoriteAuthorNames={favoriteAuthorNames}
            onFavoriteAuthor={handleFavoriteAuthor}
          />
        )}
        {viewMode === 'library' && (
          <Library
            papers={savedPapers}
            tags={tags}
            onOpenPaper={handleOpenPaper}
            onRefresh={loadLibrary}
            showNotification={showNotification}
            favoriteAuthorNames={favoriteAuthorNames}
            onFavoriteAuthor={handleFavoriteAuthor}
          />
        )}
        {viewMode === 'authors' && (
          <FavoriteAuthors
            favoriteAuthors={favoriteAuthors}
            onAuthorsChanged={loadFavoriteAuthors}
            onSavePaper={handleSavePaper}
            onOpenPaper={handleOpenArxivPaper}
            savedPaperIds={new Set(savedPapers.map(p => p.arxiv_id))}
            showNotification={showNotification}
          />
        )}
        {viewMode === 'chatHistory' && (
          <ChatHistory
            savedPapers={savedPapers}
            onOpenPaper={handleOpenPaper}
            showNotification={showNotification}
          />
        )}
        {viewMode === 'viewer' && selectedPaper && (
          <PaperViewer
            paper={selectedPaper}
            allTags={tags}
            onTagsChanged={loadLibrary}
            showNotification={showNotification}
            favoriteAuthorNames={favoriteAuthorNames}
            onFavoriteAuthor={handleFavoriteAuthor}
          />
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showNotification={showNotification}
      />
    </div>
  );
}
