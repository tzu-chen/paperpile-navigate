import { Router, Request, Response } from 'express';
import * as db from '../services/database';

const router = Router();

function paramInt(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// GET /api/tags - List all tags
router.get('/', (_req: Request, res: Response) => {
  try {
    const tags = db.getTags();
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// POST /api/tags - Create a new tag
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = db.createTag(name, color || '#6366f1');
    res.status(201).json({ id: result.lastInsertRowid, name, color: color || '#6366f1' });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Tag already exists' });
    }
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/tags/:id - Update a tag
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    db.updateTag(paramInt(req.params.id), name, color);
    res.json({ success: true });
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/tags/:id - Delete a tag
router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.deleteTag(paramInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;
