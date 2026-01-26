import { Router, Request, Response } from 'express';
import * as db from '../services/database';

const router = Router();

function paramInt(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// --- Citations ---

// GET /api/worldlines/citations - Get all citations
router.get('/citations', (_req: Request, res: Response) => {
  try {
    const citations = db.getCitations();
    res.json(citations);
  } catch (error) {
    console.error('Get citations error:', error);
    res.status(500).json({ error: 'Failed to get citations' });
  }
});

// POST /api/worldlines/citations - Add a citation
router.post('/citations', (req: Request, res: Response) => {
  try {
    const { citing_paper_id, cited_paper_id } = req.body;
    if (!citing_paper_id || !cited_paper_id) {
      return res.status(400).json({ error: 'citing_paper_id and cited_paper_id are required' });
    }
    if (citing_paper_id === cited_paper_id) {
      return res.status(400).json({ error: 'A paper cannot cite itself' });
    }
    db.addCitation(citing_paper_id, cited_paper_id);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Add citation error:', error);
    res.status(500).json({ error: 'Failed to add citation' });
  }
});

// DELETE /api/worldlines/citations - Remove a citation
router.delete('/citations', (req: Request, res: Response) => {
  try {
    const { citing_paper_id, cited_paper_id } = req.body;
    if (!citing_paper_id || !cited_paper_id) {
      return res.status(400).json({ error: 'citing_paper_id and cited_paper_id are required' });
    }
    db.removeCitation(citing_paper_id, cited_paper_id);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove citation error:', error);
    res.status(500).json({ error: 'Failed to remove citation' });
  }
});

// --- Worldlines ---

// GET /api/worldlines - List all worldlines
router.get('/', (_req: Request, res: Response) => {
  try {
    const worldlines = db.getWorldlines();
    res.json(worldlines);
  } catch (error) {
    console.error('Get worldlines error:', error);
    res.status(500).json({ error: 'Failed to get worldlines' });
  }
});

// POST /api/worldlines - Create a worldline
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const result = db.createWorldline(name, color || '#6366f1');
    res.status(201).json({ id: result.lastInsertRowid, name, color: color || '#6366f1' });
  } catch (error) {
    console.error('Create worldline error:', error);
    res.status(500).json({ error: 'Failed to create worldline' });
  }
});

// PUT /api/worldlines/:id - Update a worldline
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    db.updateWorldline(paramInt(req.params.id), name, color || '#6366f1');
    res.json({ success: true });
  } catch (error) {
    console.error('Update worldline error:', error);
    res.status(500).json({ error: 'Failed to update worldline' });
  }
});

// DELETE /api/worldlines/:id - Delete a worldline
router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.deleteWorldline(paramInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete worldline error:', error);
    res.status(500).json({ error: 'Failed to delete worldline' });
  }
});

// GET /api/worldlines/:id/papers - Get papers in a worldline
router.get('/:id/papers', (req: Request, res: Response) => {
  try {
    const papers = db.getWorldlinePapers(paramInt(req.params.id));
    res.json(papers);
  } catch (error) {
    console.error('Get worldline papers error:', error);
    res.status(500).json({ error: 'Failed to get worldline papers' });
  }
});

// POST /api/worldlines/:id/papers - Add a paper to a worldline
router.post('/:id/papers', (req: Request, res: Response) => {
  try {
    const { paper_id, position } = req.body;
    if (!paper_id) {
      return res.status(400).json({ error: 'paper_id is required' });
    }
    db.addWorldlinePaper(paramInt(req.params.id), paper_id, position ?? 0);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Add worldline paper error:', error);
    res.status(500).json({ error: 'Failed to add paper to worldline' });
  }
});

// DELETE /api/worldlines/:id/papers/:paperId - Remove a paper from a worldline
router.delete('/:id/papers/:paperId', (req: Request, res: Response) => {
  try {
    db.removeWorldlinePaper(paramInt(req.params.id), paramInt(req.params.paperId));
    res.json({ success: true });
  } catch (error) {
    console.error('Remove worldline paper error:', error);
    res.status(500).json({ error: 'Failed to remove paper from worldline' });
  }
});

export default router;
