import { useState, useRef, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import { ChatMessage, ChatSession, SavedPaper } from '../types';
import * as api from '../services/api';

interface Props {
  paper: SavedPaper;
  showNotification: (msg: string) => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function ChatPanel({ paper, showNotification }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];

  const loadSessions = useCallback(() => {
    const paperSessions = api.getChatSessionsForPaper(paper.arxiv_id);
    setSessions(paperSessions);
    return paperSessions;
  }, [paper.arxiv_id]);

  // Load sessions on mount; resume the most recent one if it exists
  useEffect(() => {
    const paperSessions = loadSessions();
    if (paperSessions.length > 0) {
      setActiveSessionId(paperSessions[0].id);
      setMessages(paperSessions[0].messages);
    }
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const persistSession = useCallback((sessionMessages: ChatMessage[], sessionId: string | null) => {
    if (!sessionId || sessionMessages.length === 0) return;
    const existing = api.getChatSession(sessionId);
    const session: ChatSession = {
      id: sessionId,
      arxivId: paper.arxiv_id,
      paperTitle: paper.title,
      messages: sessionMessages,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    api.saveChatSession(session);
    loadSessions();
  }, [paper.arxiv_id, paper.title, loadSessions]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const settings = api.getSettings();
    if (!settings.claudeApiKey) {
      showNotification('Please set your Claude API key in Settings first.');
      return;
    }

    // Create a new session if none active
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = generateId();
      setActiveSessionId(currentSessionId);
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await api.sendChatMessage(
        updatedMessages,
        settings.claudeApiKey,
        {
          title: paper.title,
          summary: paper.summary,
          authors,
          categories,
          arxivId: paper.arxiv_id,
        }
      );

      // Calculate estimated cost based on model pricing
      const usage = response.usage;
      let estimatedCost: number | undefined;
      if (usage) {
        // Pricing per token for claude-sonnet-4: $3/M input, $15/M output
        const inputCost = (usage.input_tokens / 1_000_000) * 3;
        const outputCost = (usage.output_tokens / 1_000_000) * 15;
        estimatedCost = inputCost + outputCost;
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message,
        usage: usage ? {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          estimated_cost: estimatedCost,
          model: response.model,
        } : undefined,
      };

      const withResponse = [...updatedMessages, assistantMessage];
      setMessages(withResponse);
      persistSession(withResponse, currentSessionId);
    } catch (err: any) {
      showNotification(err.message || 'Failed to get response from Claude');
      const withError = [...updatedMessages, { role: 'assistant' as const, content: 'Error: Failed to get a response. Please check your API key in Settings.' }];
      setMessages(withError);
      persistSession(withError, currentSessionId);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    const newId = generateId();
    setActiveSessionId(newId);
    setMessages([]);
    setShowSessionList(false);
  };

  const handleSwitchSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setShowSessionList(false);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.deleteChatSession(sessionId);
    const updated = loadSessions();
    if (sessionId === activeSessionId) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
  };

  const hasApiKey = !!api.getSettings().claudeApiKey;

  const firstUserMsg = (s: ChatSession) => {
    const first = s.messages.find(m => m.role === 'user');
    return first ? first.content.slice(0, 60) + (first.content.length > 60 ? '...' : '') : 'Empty session';
  };

  return (
    <div className="chat-panel">
      {!hasApiKey && (
        <div className="chat-no-key">
          <p>Claude API key not configured.</p>
          <p>Go to <strong>Settings</strong> (gear icon in the header) to add your API key.</p>
        </div>
      )}

      {/* Session toolbar */}
      <div className="chat-session-bar">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowSessionList(!showSessionList)}
          title="Past conversations for this paper"
        >
          History ({sessions.length})
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleNewChat}>
          + New Chat
        </button>
      </div>

      {showSessionList && sessions.length > 0 && (
        <div className="chat-session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`chat-session-item ${s.id === activeSessionId ? 'active' : ''}`}
              onClick={() => handleSwitchSession(s)}
            >
              <div className="chat-session-item-text">
                <span className="chat-session-preview">{firstUserMsg(s)}</span>
                <span className="chat-session-date">
                  {new Date(s.updatedAt).toLocaleDateString()} &middot; {s.messages.length} msgs
                </span>
              </div>
              <button
                className="chat-session-delete"
                onClick={e => handleDeleteSession(s.id, e)}
                title="Delete this session"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && hasApiKey && (
          <div className="chat-welcome">
            <p>Ask Claude about this paper. Examples:</p>
            <ul>
              <li>"Summarize the key contributions"</li>
              <li>"Explain the methodology"</li>
              <li>"What are the limitations?"</li>
              <li>"How does this compare to related work?"</li>
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-label">
              {msg.role === 'user' ? 'You' : 'Claude'}
            </div>
            <div className={`chat-message-content ${msg.role === 'assistant' ? 'markdown-body' : ''}`}>
              {msg.role === 'assistant' ? (
                <Markdown>{msg.content}</Markdown>
              ) : (
                msg.content
              )}
            </div>
            {msg.role === 'assistant' && msg.usage && (
              <div className="chat-message-usage">
                {msg.usage.model && <span>{msg.usage.model}</span>}
                <span>{msg.usage.input_tokens.toLocaleString()} in / {msg.usage.output_tokens.toLocaleString()} out</span>
                {msg.usage.estimated_cost !== undefined && (
                  <span>${msg.usage.estimated_cost < 0.01
                    ? msg.usage.estimated_cost.toFixed(4)
                    : msg.usage.estimated_cost.toFixed(3)}</span>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-label">Claude</div>
            <div className="chat-message-content chat-typing">
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? 'Ask about this paper...' : 'Set API key in Settings first'}
            rows={2}
            disabled={!hasApiKey || loading}
          />
          <button
            className="btn btn-primary chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading || !hasApiKey}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
