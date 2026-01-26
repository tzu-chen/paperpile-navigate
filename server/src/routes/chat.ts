import { Router, Request, Response } from 'express';

const router = Router();

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

// POST /api/chat - Send a message to Claude with paper context
router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages, apiKey, paperContext } = req.body as ChatRequest;

    if (!apiKey) {
      return res.status(400).json({ error: 'Claude API key is required. Please set it in Settings.' });
    }

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    const systemPrompt = `You are a research assistant helping analyze an academic paper. Here is the paper context:

Title: ${paperContext.title}
Authors: ${paperContext.authors.join(', ')}
ArXiv ID: ${paperContext.arxivId}
Categories: ${paperContext.categories.join(', ')}

Abstract:
${paperContext.summary}

You have access to the paper's content through the PDF the user is viewing. Help the user understand the paper, answer questions about its methodology, results, and implications. Be concise and precise in your responses.`;

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
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = (errorData as any)?.error?.message || `API request failed with status ${response.status}`;
      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json() as any;
    const assistantMessage = data.content?.[0]?.text || 'No response generated.';

    res.json({ message: assistantMessage });
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
