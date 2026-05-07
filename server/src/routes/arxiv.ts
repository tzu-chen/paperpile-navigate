import { Router, Request, Response } from 'express';
import { searchArxiv, getArxivPaper, fetchLatestArxiv, fetchRecentArxiv } from '../services/arxiv';
import { ARXIV_CATEGORY_GROUPS, ArxivPaper } from '../types';
import { getLocalPdfPathForArxivId, initializePdfStorage } from '../services/pdf';
import { getSetting } from '../services/database';
import fs from 'fs';
import path from 'path';

const MAX_FAVORITE_CATEGORIES = 5;
const FAVORITES_CACHE_TTL_MS = 15 * 60 * 1000;

interface FavoritesPaper extends ArxivPaper {
  matchedCategories: string[];
}

interface FavoritesCacheEntry {
  papers: FavoritesPaper[];
  totalResults: number;
  fetchedAt: number;
  categoriesKey: string;
}

let favoritesCache: FavoritesCacheEntry | null = null;

const router = Router();

const PROXY_CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'pdf-cache');
const MAX_CACHE_FILES = 50;

if (!fs.existsSync(PROXY_CACHE_DIR)) fs.mkdirSync(PROXY_CACHE_DIR, { recursive: true });

/** Remove least-recently-accessed files when cache exceeds MAX_CACHE_FILES. */
function evictProxyCache() {
  try {
    const entries = fs.readdirSync(PROXY_CACHE_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => {
        const filePath = path.join(PROXY_CACHE_DIR, f);
        return { filePath, atime: fs.statSync(filePath).atimeMs };
      });

    if (entries.length <= MAX_CACHE_FILES) return;

    // Sort oldest-accessed first, remove excess
    entries.sort((a, b) => a.atime - b.atime);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_FILES);
    for (const entry of toRemove) {
      fs.unlinkSync(entry.filePath);
    }
  } catch (err) {
    console.warn('Proxy cache eviction error:', err);
  }
}

// GET /api/arxiv/categories - List available category groups
router.get('/categories', (_req: Request, res: Response) => {
  res.json(ARXIV_CATEGORY_GROUPS);
});

// GET /api/arxiv/search - Search arxiv papers
router.get('/search', async (req: Request, res: Response) => {
  try {
    const {
      category,
      query,
      start = '0',
      maxResults = '20',
      sortBy = 'submittedDate',
    } = req.query as Record<string, string>;

    const result = await searchArxiv({
      category,
      query,
      start: parseInt(start, 10),
      maxResults: Math.min(parseInt(maxResults, 10), 50),
      sortBy: sortBy as 'relevance' | 'lastUpdatedDate' | 'submittedDate',
    });

    res.json(result);
  } catch (error) {
    console.error('ArXiv search error:', error);
    res.status(500).json({ error: 'Failed to search ArXiv' });
  }
});

// GET /api/arxiv/latest - Get all papers from the latest ArXiv announcement via RSS
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const { category = 'cs.AI' } = req.query as Record<string, string>;
    const result = await fetchLatestArxiv(category);
    res.json(result);
  } catch (error) {
    console.error('ArXiv latest fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch latest ArXiv papers' });
  }
});

// GET /api/arxiv/favorites - Aggregate latest listings across the user's favorite categories
router.get('/favorites', async (_req: Request, res: Response) => {
  try {
    const raw = getSetting('favoriteCategories') || '';
    const categories = raw
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .slice(0, MAX_FAVORITE_CATEGORIES);

    if (categories.length === 0) {
      return res.json({ papers: [], totalResults: 0, categories: [], cached: false });
    }

    const categoriesKey = [...categories].sort().join('|');

    if (
      favoritesCache &&
      favoritesCache.categoriesKey === categoriesKey &&
      Date.now() - favoritesCache.fetchedAt < FAVORITES_CACHE_TTL_MS
    ) {
      return res.json({
        papers: favoritesCache.papers,
        totalResults: favoritesCache.totalResults,
        categories,
        cached: true,
        fetchedAt: new Date(favoritesCache.fetchedAt).toISOString(),
      });
    }

    // Sequential fetches; the underlying arxivFetch enforces minimum intervals.
    const seen = new Map<string, FavoritesPaper>();
    const errors: string[] = [];
    for (const category of categories) {
      try {
        const result = await fetchLatestArxiv(category);
        for (const paper of result.papers) {
          const existing = seen.get(paper.id);
          if (existing) {
            if (!existing.matchedCategories.includes(category)) {
              existing.matchedCategories.push(category);
            }
          } else {
            seen.set(paper.id, { ...paper, matchedCategories: [category] });
          }
        }
      } catch (err) {
        console.warn(`Favorites: failed to fetch ${category}:`, err);
        errors.push(category);
      }
    }

    const papers = Array.from(seen.values()).sort((a, b) => {
      const da = new Date(a.published).getTime();
      const db = new Date(b.published).getTime();
      return db - da;
    });

    favoritesCache = {
      papers,
      totalResults: papers.length,
      fetchedAt: Date.now(),
      categoriesKey,
    };

    res.json({
      papers,
      totalResults: papers.length,
      categories,
      cached: false,
      fetchedAt: new Date(favoritesCache.fetchedAt).toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('ArXiv favorites fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch favorite categories' });
  }
});

// GET /api/arxiv/recent - Get papers from recent days (past ~5 business days)
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const { category = 'cs.AI' } = req.query as Record<string, string>;
    const result = await fetchRecentArxiv(category);
    res.json(result);
  } catch (error) {
    console.error('ArXiv recent fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch recent ArXiv papers' });
  }
});

// GET /api/arxiv/paper/:id - Get a specific paper by arxiv ID
router.get('/paper/:id(*)', async (req: Request, res: Response) => {
  try {
    const paper = await getArxivPaper(String(req.params.id));
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    res.json(paper);
  } catch (error) {
    console.error('ArXiv paper fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch paper' });
  }
});

// GET /api/arxiv/pdf-proxy/:id - Proxy PDF from arxiv to avoid CORS issues
router.get('/pdf-proxy/:id(*)', async (req: Request, res: Response) => {
  try {
    const arxivId = String(req.params.id);

    // Serve from local storage if available
    const localPath = getLocalPdfPathForArxivId(arxivId);
    if (localPath) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${arxivId.replace('/', '_')}.pdf"`);
      return res.sendFile(localPath);
    }

    // Check for a cached optimized copy in the proxy cache
    initializePdfStorage();
    const cachedPath = path.join(PROXY_CACHE_DIR, arxivId.replace(/\//g, '_') + '.pdf');

    if (fs.existsSync(cachedPath)) {
      // Touch atime so LRU eviction keeps recently viewed files
      const now = new Date();
      fs.utimesSync(cachedPath, now, fs.statSync(cachedPath).mtime);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${arxivId.replace('/', '_')}.pdf"`);
      return res.sendFile(cachedPath);
    }

    const pdfUrl = `https://arxiv.org/pdf/${arxivId}`;
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch PDF' });
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(cachedPath, Buffer.from(buffer));

    // Evict oldest cached files if cache has grown too large
    evictProxyCache();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arxivId.replace('/', '_')}.pdf"`);
    res.sendFile(cachedPath);
  } catch (error) {
    console.error('PDF proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy PDF' });
  }
});

export default router;
