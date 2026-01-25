import { Router, Request, Response } from 'express';
import * as db from '../services/database';
import { generateBibtex, generateBibtexBundle, generatePaperpileMetadata } from '../services/paperpile';
import { SavedPaper, Comment, Tag } from '../types';

const router = Router();

function paramInt(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// GET /api/export/bibtex/:id - Export single paper as BibTeX
router.get('/bibtex/:id', (req: Request, res: Response) => {
  try {
    const paper = db.getPaper(paramInt(req.params.id)) as SavedPaper | undefined;
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const tags = db.getPaperTags(paper.id) as Tag[];
    const comments = db.getComments(paper.id) as Comment[];
    const bibtex = generateBibtex(paper, tags, comments);

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/x-bibtex');
      res.setHeader('Content-Disposition', `attachment; filename="${paper.arxiv_id.replace('/', '_')}.bib"`);
    } else {
      res.setHeader('Content-Type', 'text/plain');
    }
    res.send(bibtex);
  } catch (error) {
    console.error('BibTeX export error:', error);
    res.status(500).json({ error: 'Failed to export BibTeX' });
  }
});

// GET /api/export/bibtex - Export all saved papers as BibTeX
router.get('/bibtex', (req: Request, res: Response) => {
  try {
    const papers = db.getPapers() as SavedPaper[];

    const bundle = papers.map(paper => ({
      paper,
      tags: db.getPaperTags(paper.id) as Tag[],
      comments: db.getComments(paper.id) as Comment[],
    }));

    const bibtex = generateBibtexBundle(bundle);

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/x-bibtex');
      res.setHeader('Content-Disposition', 'attachment; filename="papers.bib"');
    } else {
      res.setHeader('Content-Type', 'text/plain');
    }
    res.send(bibtex);
  } catch (error) {
    console.error('BibTeX bundle export error:', error);
    res.status(500).json({ error: 'Failed to export BibTeX bundle' });
  }
});

// GET /api/export/paperpile/:id - Export paper metadata for Paperpile
router.get('/paperpile/:id', (req: Request, res: Response) => {
  try {
    const paper = db.getPaper(paramInt(req.params.id)) as SavedPaper | undefined;
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const tags = db.getPaperTags(paper.id) as Tag[];
    const comments = db.getComments(paper.id) as Comment[];
    const metadata = generatePaperpileMetadata(paper, tags, comments);

    res.json(metadata);
  } catch (error) {
    console.error('Paperpile export error:', error);
    res.status(500).json({ error: 'Failed to export for Paperpile' });
  }
});

// GET /api/export/paperpile - Export all papers for Paperpile
router.get('/paperpile', (req: Request, res: Response) => {
  try {
    const papers = db.getPapers() as SavedPaper[];

    const metadata = papers.map(paper => {
      const tags = db.getPaperTags(paper.id) as Tag[];
      const comments = db.getComments(paper.id) as Comment[];
      return generatePaperpileMetadata(paper, tags, comments);
    });

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="paperpile_export.json"');
    }
    res.json(metadata);
  } catch (error) {
    console.error('Paperpile bundle export error:', error);
    res.status(500).json({ error: 'Failed to export for Paperpile' });
  }
});

// POST /api/export/mark-exported/:id - Mark a paper as exported
router.post('/mark-exported/:id', (req: Request, res: Response) => {
  try {
    db.updatePaperStatus(paramInt(req.params.id), 'exported');
    res.json({ success: true });
  } catch (error) {
    console.error('Mark exported error:', error);
    res.status(500).json({ error: 'Failed to mark as exported' });
  }
});

export default router;
