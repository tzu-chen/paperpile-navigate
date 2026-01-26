import { useState, useRef, useEffect } from 'react';
import { ChatMessage, SavedPaper } from '../types';
import * as api from '../services/api';

interface Props {
  paper: SavedPaper;
  showNotification: (msg: string) => void;
}

export default function ChatPanel({ paper, showNotification }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const settings = api.getSettings();
    if (!settings.claudeApiKey) {
      showNotification('Please set your Claude API key in Settings first.');
      return;
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

      setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);
    } catch (err: any) {
      showNotification(err.message || 'Failed to get response from Claude');
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get a response. Please check your API key in Settings.' }]);
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

  const handleClear = () => {
    setMessages([]);
  };

  const hasApiKey = !!api.getSettings().claudeApiKey;

  return (
    <div className="chat-panel">
      {!hasApiKey && (
        <div className="chat-no-key">
          <p>Claude API key not configured.</p>
          <p>Go to <strong>Settings</strong> (gear icon in the header) to add your API key.</p>
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
            <div className="chat-message-content">
              {msg.content}
            </div>
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
        {messages.length > 0 && (
          <button className="btn btn-secondary btn-sm chat-clear-btn" onClick={handleClear}>
            Clear chat
          </button>
        )}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
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
