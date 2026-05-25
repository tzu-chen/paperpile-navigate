import { useEffect, useRef, useState } from 'react';
import * as api from '../services/api';
import { CommentPositionRect } from '../types';

interface Props {
  paperId: number;
  selection: { text: string; pageNumber: number; rects: CommentPositionRect[] };
  position: { x: number; y: number };
  onClose: () => void;
  onAdded: () => Promise<void> | void;
  showNotification: (msg: string) => void;
}

const BOX_WIDTH = 320;
const VIEWPORT_MARGIN = 8;

export default function FloatingCommentBox({ paperId, selection, position, onClose, onAdded, showNotification }: Props) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clamp the box horizontally to stay inside the viewport.
  const maxLeft = window.innerWidth - BOX_WIDTH - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(position.x, maxLeft));
  const top = Math.max(VIEWPORT_MARGIN, position.y);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  async function handleSubmit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.addComment(
        paperId,
        content.trim(),
        selection.pageNumber,
        selection.text,
        selection.rects.length > 0 ? JSON.stringify(selection.rects) : null
      );
      await onAdded();
      showNotification('Comment added');
      onClose();
    } catch {
      showNotification('Failed to add comment');
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={boxRef}
      className="floating-comment-box"
      style={{ left, top, width: BOX_WIDTH }}
    >
      <div className="floating-comment-header">
        <span>Comment on page {selection.pageNumber}</span>
        <button className="btn-icon" onClick={onClose} title="Close (Esc)">&times;</button>
      </div>
      <blockquote className="floating-comment-quote">{selection.text}</blockquote>
      <textarea
        ref={textareaRef}
        className="floating-comment-textarea"
        placeholder="Add your comment..."
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={3}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div className="floating-comment-actions">
        <span className="floating-comment-hint">⌘/Ctrl + Enter to submit</span>
        <div className="floating-comment-buttons">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
          >
            {submitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
