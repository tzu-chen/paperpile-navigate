export interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  doi?: string;
  journalRef?: string;
}

export interface SavedPaper {
  id: number;
  arxiv_id: string;
  title: string;
  summary: string;
  authors: string;
  published: string;
  updated: string;
  categories: string;
  pdf_url: string;
  abs_url: string;
  doi: string | null;
  journal_ref: string | null;
  added_at: string;
  status: 'new' | 'reading' | 'reviewed' | 'exported';
}

export interface Comment {
  id: number;
  paper_id: number;
  content: string;
  page_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface FavoriteAuthor {
  id: number;
  name: string;
  added_at: string;
}

export interface CategoryGroup {
  label: string;
  categories: Record<string, string>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSession {
  id: string;
  arxivId: string;
  paperTitle: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  id: number;
  citing_paper_id: number;
  cited_paper_id: number;
  created_at?: string;
}

export interface Worldline {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export type ViewMode = 'browse' | 'library' | 'authors' | 'viewer' | 'chatHistory' | 'worldline';
