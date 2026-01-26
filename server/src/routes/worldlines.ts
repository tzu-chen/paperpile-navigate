import { Router, Request, Response } from 'express';
import * as db from '../services/database';
import { getArxivPaper } from '../services/arxiv';

const router = Router();

function paramInt(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// --- Semantic Scholar ---

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1/paper';
const S2_FIELDS = 'title,authors,year,externalIds,url,abstract';

// GET /api/worldlines/citations/discover/:arxivId — fetch citing & referenced papers from Semantic Scholar
router.get('/citations/discover/:arxivId', async (req: Request, res: Response) => {
  try {
    const { arxivId } = req.params;
    const paperId = `ARXIV:${arxivId}`;

    const [citationsRes, referencesRes] = await Promise.all([
      fetch(`${S2_API_BASE}/${paperId}/citations?fields=${S2_FIELDS}&limit=50`),
      fetch(`${S2_API_BASE}/${paperId}/references?fields=${S2_FIELDS}&limit=50`),
    ]);

    if (!citationsRes.ok && !referencesRes.ok) {
      return res.status(502).json({ error: 'Semantic Scholar API unavailable' });
    }

    const citationsData: any = citationsRes.ok ? await citationsRes.json() : { data: [] };
    const referencesData: any = referencesRes.ok ? await referencesRes.json() : { data: [] };

    // Normalize the data: citations returns {citingPaper}, references returns {citedPaper}
    const citations = (citationsData.data || [])
      .map((item: any) => item.citingPaper)
      .filter((p: any) => p && p.title);

    const references = (referencesData.data || [])
      .map((item: any) => item.citedPaper)
      .filter((p: any) => p && p.title);

    res.json({ citations, references });
  } catch (error) {
    console.error('Semantic Scholar fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch from Semantic Scholar' });
  }
});

// POST /api/worldlines/citations/import — save a paper by arxiv ID and create citation link
router.post('/citations/import', async (req: Request, res: Response) => {
  try {
    const { arxiv_id, source_paper_id, direction } = req.body;
    // direction: 'cites' means source paper cites the imported paper
    //            'cited_by' means imported paper cites the source paper

    if (!arxiv_id || !source_paper_id || !direction) {
      return res.status(400).json({ error: 'arxiv_id, source_paper_id, and direction are required' });
    }

    // Check if paper already exists in library
    let paper = db.getPaperByArxivId(arxiv_id) as any;

    if (!paper) {
      // Fetch paper details from ArXiv
      const arxivPaper = await getArxivPaper(arxiv_id);
      if (!arxivPaper) {
        return res.status(404).json({ error: 'Paper not found on ArXiv' });
      }

      const result = db.savePaper({
        arxiv_id: arxivPaper.id,
        title: arxivPaper.title,
        summary: arxivPaper.summary,
        authors: JSON.stringify(arxivPaper.authors),
        published: arxivPaper.published,
        updated: arxivPaper.updated,
        categories: JSON.stringify(arxivPaper.categories),
        pdf_url: arxivPaper.pdfUrl,
        abs_url: arxivPaper.absUrl,
        doi: arxivPaper.doi,
        journal_ref: arxivPaper.journalRef,
      });
      paper = db.getPaper(result.lastInsertRowid as number);
    }

    // Create citation link
    if (direction === 'cites') {
      // source paper cites the imported paper
      db.addCitation(source_paper_id, paper.id);
    } else {
      // imported paper cites the source paper (imported paper is the citing paper)
      db.addCitation(paper.id, source_paper_id);
    }

    res.status(201).json({ paper, success: true });
  } catch (error) {
    console.error('Import citation error:', error);
    res.status(500).json({ error: 'Failed to import paper and create citation' });
  }
});

// POST /api/worldlines/batch-import — batch import papers, infer citations, create worldline
router.post('/batch-import', async (req: Request, res: Response) => {
  try {
    const { arxiv_ids, worldline_name, worldline_color } = req.body;

    if (!arxiv_ids || !Array.isArray(arxiv_ids) || arxiv_ids.length === 0) {
      return res.status(400).json({ error: 'arxiv_ids array is required' });
    }
    if (!worldline_name || !worldline_name.trim()) {
      return res.status(400).json({ error: 'worldline_name is required' });
    }

    // Normalize IDs: strip version suffixes (e.g. "2301.00001v1" -> "2301.00001")
    const cleanIds = arxiv_ids
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0)
      .map((id: string) => id.replace(/v\d+$/, ''));

    const uniqueIds = [...new Set(cleanIds)] as string[];

    // Step 1: Save all papers to library
    const paperMap = new Map<string, number>(); // arxiv_id -> paper.id
    const savedPapers: any[] = [];
    const errors: string[] = [];

    for (const arxivId of uniqueIds) {
      let paper = db.getPaperByArxivId(arxivId) as any;
      if (!paper) {
        try {
          const arxivPaper = await getArxivPaper(arxivId);
          if (!arxivPaper) {
            errors.push(`Not found: ${arxivId}`);
            continue;
          }
          const result = db.savePaper({
            arxiv_id: arxivPaper.id,
            title: arxivPaper.title,
            summary: arxivPaper.summary,
            authors: JSON.stringify(arxivPaper.authors),
            published: arxivPaper.published,
            updated: arxivPaper.updated,
            categories: JSON.stringify(arxivPaper.categories),
            pdf_url: arxivPaper.pdfUrl,
            abs_url: arxivPaper.absUrl,
            doi: arxivPaper.doi,
            journal_ref: arxivPaper.journalRef,
          });
          paper = db.getPaper(result.lastInsertRowid as number);
        } catch (err) {
          errors.push(`Failed to fetch: ${arxivId}`);
          continue;
        }
      }
      paperMap.set(arxivId, paper.id);
      savedPapers.push(paper);
    }

    // Step 2: Infer citations via Semantic Scholar
    let citationsCreated = 0;
    const batchArxivIds = new Set(paperMap.keys());

    for (const arxivId of batchArxivIds) {
      const paperId = paperMap.get(arxivId)!;
      try {
        const s2Res = await fetch(
          `${S2_API_BASE}/ARXIV:${arxivId}/references?fields=externalIds&limit=500`
        );
        if (!s2Res.ok) continue;
        const s2Data: any = await s2Res.json();
        const refs = s2Data.data || [];

        for (const ref of refs) {
          const refArxivId = ref.citedPaper?.externalIds?.ArXiv;
          if (refArxivId && batchArxivIds.has(refArxivId) && refArxivId !== arxivId) {
            const citedPaperId = paperMap.get(refArxivId)!;
            try {
              db.addCitation(paperId, citedPaperId);
              citationsCreated++;
            } catch {
              // duplicate citation — ignore
            }
          }
        }
      } catch {
        // Semantic Scholar request failed for this paper — continue with others
      }
    }

    // Step 3: Create worldline
    const wlResult = db.createWorldline(worldline_name.trim(), worldline_color || '#6366f1');
    const worldlineId = wlResult.lastInsertRowid as number;

    // Add papers sorted by publication date
    const sortedPapers = savedPapers.sort(
      (a, b) => new Date(a.published).getTime() - new Date(b.published).getTime()
    );
    for (let i = 0; i < sortedPapers.length; i++) {
      db.addWorldlinePaper(worldlineId, sortedPapers[i].id, i);
    }

    res.status(201).json({
      success: true,
      papers_added: savedPapers.length,
      citations_created: citationsCreated,
      worldline_id: worldlineId,
      errors,
    });
  } catch (error) {
    console.error('Batch import error:', error);
    res.status(500).json({ error: 'Failed to batch import papers' });
  }
});

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
