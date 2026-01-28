import { useState, useEffect, useRef } from 'react';
import { ArxivPaper, CategoryGroup, PaperSimilarityResult, WorldlineSimilarityMatch } from '../types';
import * as api from '../services/api';
import LaTeX from './LaTeX';

interface Props {
  onSavePaper: (paper: ArxivPaper) => Promise<any>;
  onOpenPaper: (paper: ArxivPaper) => void;
  savedPaperIds: Set<string>;
  favoriteAuthorNames: Set<string>;
  onFavoriteAuthor: (name: string) => void;
  onPapersLoaded?: (papers: ArxivPaper[], pageOffset: number, totalResults: number) => void;
}

const SORT_OPTIONS = [
  { value: 'submittedDate', label: 'Newest First' },
  { value: 'lastUpdatedDate', label: 'Recently Updated' },
  { value: 'relevance', label: 'Relevance' },
];

export default function PaperBrowser({ onSavePaper, onOpenPaper, savedPaperIds, favoriteAuthorNames, onFavoriteAuthor, onPapersLoaded }: Props) {
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(
    () => localStorage.getItem('paperpile-navigate-category') || 'cs.AI'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('submittedDate');
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const [similarityMap, setSimilarityMap] = useState<Map<string, WorldlineSimilarityMatch[]>>(new Map());
  const [scanningWorldlines, setScanningWorldlines] = useState(false);
  const similarityAbortRef = useRef<AbortController | null>(null);

  const PAGE_SIZE = 100;

  useEffect(() => {
    api.getCategories().then(setCategoryGroups).catch(console.error);
  }, []);

  useEffect(() => {
    performSearch(0);
  }, [selectedCategory, sortBy]);

  // Compute worldline similarity when papers change
  useEffect(() => {
    if (papers.length === 0) {
      setSimilarityMap(new Map());
      return;
    }

    // Cancel any in-progress request
    if (similarityAbortRef.current) {
      similarityAbortRef.current.abort();
    }
    const controller = new AbortController();
    similarityAbortRef.current = controller;

    const settings = api.getSettings();

    setScanningWorldlines(true);
    api.checkWorldlineSimilarity(
      papers.map(p => ({ id: p.id, title: p.title, summary: p.summary })),
      settings.similarityThreshold
    ).then(results => {
      if (controller.signal.aborted) return;
      const map = new Map<string, WorldlineSimilarityMatch[]>();
      for (const r of results) {
        map.set(r.paperId, r.matches);
      }
      setSimilarityMap(map);
    }).catch(err => {
      if (controller.signal.aborted) return;
      console.error('Similarity check failed:', err);
    }).finally(() => {
      if (!controller.signal.aborted) {
        setScanningWorldlines(false);
      }
    });

    return () => controller.abort();
  }, [papers]);

  useEffect(() => {
    onPapersLoaded?.(papers, page * PAGE_SIZE, totalResults);
  }, [papers, page, totalResults, onPapersLoaded]);

  async function performSearch(startPage: number) {
    setLoading(true);
    try {
      const result = await api.searchArxiv({
        category: selectedCategory || undefined,
        query: searchQuery || undefined,
        start: startPage * PAGE_SIZE,
        maxResults: PAGE_SIZE,
        sortBy,
      });
      setPapers(result.papers);
      setTotalResults(result.totalResults);
      setPage(startPage);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(paper: ArxivPaper) {
    setSavingIds(prev => new Set(prev).add(paper.id));
    try {
      await onSavePaper(paper);
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  }

  function toggleAbstract(id: string) {
    setExpandedAbstracts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  return (
    <div className="paper-browser">
      <div className="browser-controls">
        <div className="control-row">
          <div className="control-group">
            <label>Category</label>
            <select
              value={selectedCategory}
              onChange={e => {
                const val = e.target.value;
                setSelectedCategory(val);
                localStorage.setItem('paperpile-navigate-category', val);
              }}
            >
              {categoryGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {Object.entries(group.categories).map(([key, name]) => (
                    <option key={key} value={key}>
                      {key} - {name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="control-group search-group">
            <label>Search</label>
            <div className="search-input-wrap">
              <input
                type="text"
                placeholder="Search within category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && performSearch(0)}
              />
              <button onClick={() => performSearch(0)} className="btn btn-primary">
                Search
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="loading">Searching ArXiv...</div>}

      {!loading && scanningWorldlines && (
        <div className="worldline-scanning-bar">
          Scanning worldline similarity...
        </div>
      )}

      {!loading && papers.length === 0 && (
        <div className="empty-state">No papers found. Try a different category or search term.</div>
      )}

      <div className="paper-list">
        {papers.map(paper => {
          const isSaved = savedPaperIds.has(paper.id);
          const isSaving = savingIds.has(paper.id);
          const isExpanded = expandedAbstracts.has(paper.id);
          const worldlineMatches = similarityMap.get(paper.id);

          return (
            <div key={paper.id} className={`paper-card ${worldlineMatches ? 'has-worldline-match' : ''}`}>
              <div className="paper-card-header">
                <h3 className="paper-title" onClick={() => onOpenPaper(paper)}>
                  <LaTeX>{paper.title}</LaTeX>
                </h3>
                <div className="paper-actions">
                  {isSaved ? (
                    <button className="btn btn-success btn-sm" disabled>
                      In Library
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSave(paper)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onOpenPaper(paper)}
                  >
                    Open
                  </button>
                </div>
              </div>

              {worldlineMatches && worldlineMatches.length > 0 && (
                <div className="worldline-matches">
                  {worldlineMatches.map(match => (
                    <span
                      key={match.worldlineId}
                      className="worldline-match-badge"
                      style={{
                        borderColor: match.worldlineColor,
                        color: match.worldlineColor,
                      }}
                      title={`Similarity score: ${match.score.toFixed(3)}`}
                    >
                      <span
                        className="worldline-match-dot"
                        style={{ background: match.worldlineColor }}
                      />
                      {match.worldlineName}
                      <span className="worldline-match-score">
                        {(match.score * 100).toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
              )}

              <div className="paper-meta">
                <span className="paper-authors">
                  {paper.authors.slice(0, 5).map((author, i) => (
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
                  {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
                </span>
                <span className="paper-date">
                  {new Date(paper.published).toLocaleDateString()}
                </span>
                <span className="paper-categories">
                  {paper.categories.slice(0, 3).map(c => (
                    <span key={c} className="category-badge">{c}</span>
                  ))}
                </span>
              </div>

              <p className={`paper-abstract ${isExpanded ? 'expanded' : ''}`}>
                <LaTeX>{paper.summary}</LaTeX>
              </p>
              {paper.summary.length > 300 && (
                <button
                  className="btn-link"
                  onClick={() => toggleAbstract(paper.id)}
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}

              <div className="paper-id">arXiv: {paper.id}</div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-secondary"
            disabled={page === 0}
            onClick={() => performSearch(page - 1)}
          >
            Previous
          </button>
          <span className="page-info">
            Page {page + 1} of {totalPages} ({totalResults} results)
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= totalPages - 1}
            onClick={() => performSearch(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
