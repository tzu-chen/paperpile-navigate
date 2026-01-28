import { Router, Request, Response } from 'express';
import { searchArxiv, getArxivPaper, fetchLatestArxiv } from '../services/arxiv';
import { ARXIV_CATEGORY_GROUPS } from '../types';

const router = Router();

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
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}`;

    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch PDF' });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arxivId.replace('/', '_')}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('PDF proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy PDF' });
  }
});

export default router;
