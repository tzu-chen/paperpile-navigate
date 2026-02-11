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
  announceType?: 'new' | 'cross' | 'replace' | 'replace-cross';
  listingDate?: string;
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
  pdf_path: string | null;
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

export interface ChatMessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  estimated_cost?: number;
  model?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  usage?: ChatMessageUsage;
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

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors?: { authorId: string; name: string }[];
  externalIds?: { ArXiv?: string; DOI?: string; [key: string]: string | undefined };
  url?: string;
}

export interface SemanticScholarResult {
  citations: SemanticScholarPaper[];
  references: SemanticScholarPaper[];
}

export interface WorldlineSimilarityMatch {
  worldlineId: number;
  worldlineName: string;
  worldlineColor: string;
  score: number;
}

export interface PaperSimilarityResult {
  paperId: string;
  matches: WorldlineSimilarityMatch[];
}

export type ViewMode = 'browse' | 'library' | 'authors' | 'viewer' | 'chatHistory' | 'worldline';
