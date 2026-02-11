import { Router, Request, Response } from 'express';
import { getRelatedPaperTitlesByArxivId } from '../services/database';

const router = Router();

// Simple in-memory cache for fetched PDFs (base64), keyed by arxiv ID.
// Avoids re-downloading the same PDF across messages in a conversation.
const pdfCache = new Map<string, { data: string; fetchedAt: number }>();
const PDF_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchPdfBase64(arxivId: string): Promise<string> {
  const cached = pdfCache.get(arxivId);
  if (cached && Date.now() - cached.fetchedAt < PDF_CACHE_TTL) {
    return cached.data;
  }

  const pdfUrl = `https://arxiv.org/pdf/${arxivId}`;
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  pdfCache.set(arxivId, { data: base64, fetchedAt: Date.now() });

  // Evict stale entries
  for (const [key, entry] of pdfCache) {
    if (Date.now() - entry.fetchedAt > PDF_CACHE_TTL) {
      pdfCache.delete(key);
    }
  }

  return base64;
}

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  apiKey: string;
  paperContext: {
    title: string;
    summary: string;
    authors: string[];
    categories: string[];
    arxivId: string;
  };
}

// POST /api/chat - Send a message to Claude with the full PDF document
router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages, apiKey, paperContext } = req.body as ChatRequest;

    if (!apiKey) {
      return res.status(400).json({ error: 'Claude API key is required. Please set it in Settings.' });
    }

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    // Fetch the PDF and encode as base64
    let pdfBase64: string | null = null;
    try {
      pdfBase64 = await fetchPdfBase64(paperContext.arxivId);
    } catch (err) {
      console.error('Failed to fetch PDF for chat:', err);
      // Continue without PDF — fall back to metadata-only context
    }

    // Look up related papers from the same worldline(s)
    const relatedPapers = getRelatedPaperTitlesByArxivId(paperContext.arxivId);
    let relatedPapersSection = '';
    if (relatedPapers.length > 0) {
      const worldlineSections = relatedPapers.map(wl =>
        `Worldline "${wl.worldlineName}":\n${wl.titles.map(t => `  - ${t}`).join('\n')}`
      ).join('\n');
      relatedPapersSection = `\n\nRelated papers in the same research thread(s):\n${worldlineSections}\n\nThe user may ask about connections between these papers. Use this context when relevant.`;
    }

    // Build system prompt as content blocks with cache_control
    // so Anthropic caches the system instructions across turns.
    const systemContent = [
      {
        type: 'text' as const,
        text: `You are a research assistant helping analyze an academic paper.

Title: ${paperContext.title}
Authors: ${paperContext.authors.join(', ')}
ArXiv ID: ${paperContext.arxivId}
Categories: ${paperContext.categories.join(', ')}

${pdfBase64 ? 'The full PDF of the paper is attached to the first message.' : `Abstract:\n${paperContext.summary}\n\n(The PDF could not be loaded. Answer based on the abstract above.)`}${relatedPapersSection}

Help the user understand the paper, answer questions about its methodology, results, and implications. Be concise and precise in your responses.`,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    // Build the messages array for Claude, attaching the PDF document
    // to the first user message with cache_control so Anthropic caches
    // the (system + PDF) prefix across subsequent turns in a conversation.
    const claudeMessages: any[] = [];
    let pdfAttached = false;

    for (const msg of messages) {
      if (msg.role === 'user' && !pdfAttached && pdfBase64) {
        // First user message: include PDF document (cached) + text
        claudeMessages.push({
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text: msg.content,
            },
          ],
        });
        pdfAttached = true;
      } else {
        claudeMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemContent,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = (errorData as any)?.error?.message || `API request failed with status ${response.status}`;
      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json() as any;
    const assistantMessage = data.content?.[0]?.text || 'No response generated.';

    res.json({
      message: assistantMessage,
      model: data.model || 'unknown',
      usage: {
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        cache_creation_input_tokens: data.usage?.cache_creation_input_tokens || 0,
        cache_read_input_tokens: data.usage?.cache_read_input_tokens || 0,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// POST /api/chat/verify-key - Verify that a Claude API key is valid
router.post('/verify-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body as { apiKey: string };

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required', valid: false });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      res.json({ valid: true });
    } else {
      const errorData = await response.json().catch(() => ({}));
      res.json({ valid: false, error: (errorData as any)?.error?.message || 'Invalid API key' });
    }
  } catch (error) {
    console.error('Key verification error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify API key' });
  }
});

export default router;
