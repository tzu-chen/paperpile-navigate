import { Router, Request, Response } from 'express';
import * as db from '../services/database';

const router = Router();

function paramInt(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// GET /api/papers - List all saved papers
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, tag_id } = req.query as Record<string, string>;
    const papers = db.getPapers({
      status,
      tag_id: tag_id ? parseInt(tag_id, 10) : undefined,
    });
    res.json(papers);
  } catch (error) {
    console.error('Get papers error:', error);
    res.status(500).json({ error: 'Failed to get papers' });
  }
});

// GET /api/papers/:id - Get a specific paper
router.get('/:id', (req: Request, res: Response) => {
  try {
    const paper = db.getPaper(paramInt(req.params.id));
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    res.json(paper);
  } catch (error) {
    console.error('Get paper error:', error);
    res.status(500).json({ error: 'Failed to get paper' });
  }
});

// POST /api/papers - Save a paper from arxiv
router.post('/', (req: Request, res: Response) => {
  try {
    const { arxiv_id, title, summary, authors, published, updated, categories, pdf_url, abs_url, doi, journal_ref } = req.body;

    if (!arxiv_id || !title) {
      return res.status(400).json({ error: 'arxiv_id and title are required' });
    }

    // Check if already saved
    const existing = db.getPaperByArxivId(arxiv_id);
    if (existing) {
      return res.json(existing);
    }

    const result = db.savePaper({
      arxiv_id,
      title,
      summary: summary || '',
      authors: typeof authors === 'string' ? authors : JSON.stringify(authors || []),
      published: published || new Date().toISOString(),
      updated: updated || new Date().toISOString(),
      categories: typeof categories === 'string' ? categories : JSON.stringify(categories || []),
      pdf_url: pdf_url || `https://arxiv.org/pdf/${arxiv_id}`,
      abs_url: abs_url || `https://arxiv.org/abs/${arxiv_id}`,
      doi,
      journal_ref,
    });

    const paper = db.getPaper(result.lastInsertRowid as number);
    res.status(201).json(paper);
  } catch (error) {
    console.error('Save paper error:', error);
    res.status(500).json({ error: 'Failed to save paper' });
  }
});

// PATCH /api/papers/:id/status - Update paper status
router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['new', 'reading', 'reviewed', 'exported'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.updatePaperStatus(paramInt(req.params.id), status);
    res.json({ success: true });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/papers/:id - Delete a paper
router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.deletePaper(paramInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete paper error:', error);
    res.status(500).json({ error: 'Failed to delete paper' });
  }
});

// --- Comments ---

// GET /api/papers/:id/comments
router.get('/:id/comments', (req: Request, res: Response) => {
  try {
    const comments = db.getComments(paramInt(req.params.id));
    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// POST /api/papers/:id/comments
router.post('/:id/comments', (req: Request, res: Response) => {
  try {
    const { content, page_number } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const result = db.addComment(
      paramInt(req.params.id),
      content,
      page_number
    );
    res.status(201).json({ id: result.lastInsertRowid, success: true });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// PUT /api/papers/:id/comments/:commentId
router.put('/:id/comments/:commentId', (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    db.updateComment(paramInt(req.params.commentId), content);
    res.json({ success: true });
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/papers/:id/comments/:commentId
router.delete('/:id/comments/:commentId', (req: Request, res: Response) => {
  try {
    db.deleteComment(paramInt(req.params.commentId));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// --- Tags ---

// GET /api/papers/:id/tags
router.get('/:id/tags', (req: Request, res: Response) => {
  try {
    const tags = db.getPaperTags(paramInt(req.params.id));
    res.json(tags);
  } catch (error) {
    console.error('Get paper tags error:', error);
    res.status(500).json({ error: 'Failed to get paper tags' });
  }
});

// POST /api/papers/:id/tags
router.post('/:id/tags', (req: Request, res: Response) => {
  try {
    const { tag_id } = req.body;
    if (!tag_id) {
      return res.status(400).json({ error: 'tag_id is required' });
    }
    db.addPaperTag(paramInt(req.params.id), tag_id);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Add paper tag error:', error);
    res.status(500).json({ error: 'Failed to add paper tag' });
  }
});

// DELETE /api/papers/:id/tags/:tagId
router.delete('/:id/tags/:tagId', (req: Request, res: Response) => {
  try {
    db.removePaperTag(paramInt(req.params.id), paramInt(req.params.tagId));
    res.json({ success: true });
  } catch (error) {
    console.error('Remove paper tag error:', error);
    res.status(500).json({ error: 'Failed to remove paper tag' });
  }
});

export default router;
