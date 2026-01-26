import { Router, Request, Response } from 'express';
import * as db from '../services/database';
import { searchByAuthor } from '../services/arxiv';
import { ArxivPaper } from '../types';

const router = Router();

// GET /api/authors/favorites - List all favorite authors
router.get('/favorites', (_req: Request, res: Response) => {
  try {
    const authors = db.getFavoriteAuthors();
    res.json(authors);
  } catch (error) {
    console.error('Failed to get favorite authors:', error);
    res.status(500).json({ error: 'Failed to get favorite authors' });
  }
});

// POST /api/authors/favorites - Add a favorite author
router.post('/favorites', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Author name is required' });
    }

    const trimmed = name.trim();
    const existing = db.getFavoriteAuthorByName(trimmed);
    if (existing) {
      return res.status(409).json({ error: 'Author is already in favorites' });
    }

    const result = db.addFavoriteAuthor(trimmed);
    res.status(201).json({ id: result.lastInsertRowid, name: trimmed });
  } catch (error) {
    console.error('Failed to add favorite author:', error);
    res.status(500).json({ error: 'Failed to add favorite author' });
  }
});

// DELETE /api/authors/favorites/:id - Remove a favorite author
router.delete('/favorites/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    db.removeFavoriteAuthor(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove favorite author:', error);
    res.status(500).json({ error: 'Failed to remove favorite author' });
  }
});

// GET /api/authors/favorites/publications - Get recent publications from all favorite authors
router.get('/favorites/publications', async (_req: Request, res: Response) => {
  try {
    const authors = db.getFavoriteAuthors() as Array<{ id: number; name: string; added_at: string }>;
    if (authors.length === 0) {
      return res.json({ papers: [] });
    }

    const allPapers: (ArxivPaper & { matchedAuthor: string })[] = [];
    const seenIds = new Set<string>();

    // Fetch papers for each author (limited concurrency with Promise.all in batches)
    const batchSize = 3;
    for (let i = 0; i < authors.length; i += batchSize) {
      const batch = authors.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (author) => {
          try {
            const result = await searchByAuthor(author.name, 10);
            return result.papers.map(p => ({ ...p, matchedAuthor: author.name }));
          } catch (err) {
            console.error(`Failed to search papers for ${author.name}:`, err);
            return [];
          }
        })
      );

      for (const papers of results) {
        for (const paper of papers) {
          if (!seenIds.has(paper.id)) {
            seenIds.add(paper.id);
            allPapers.push(paper);
          }
        }
      }
    }

    // Sort by published date descending
    allPapers.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

    res.json({ papers: allPapers });
  } catch (error) {
    console.error('Failed to get favorite author publications:', error);
    res.status(500).json({ error: 'Failed to get publications' });
  }
});

export default router;
