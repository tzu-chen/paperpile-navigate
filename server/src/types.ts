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

export interface PaperTag {
  paper_id: number;
  tag_id: number;
}

export const ARXIV_CATEGORIES: Record<string, string> = {
  'cs.AI': 'Artificial Intelligence',
  'cs.CL': 'Computation and Language',
  'cs.CV': 'Computer Vision',
  'cs.LG': 'Machine Learning',
  'cs.NE': 'Neural and Evolutionary Computing',
  'cs.RO': 'Robotics',
  'cs.SE': 'Software Engineering',
  'cs.DS': 'Data Structures and Algorithms',
  'cs.CR': 'Cryptography and Security',
  'cs.DB': 'Databases',
  'cs.DC': 'Distributed Computing',
  'cs.HC': 'Human-Computer Interaction',
  'cs.IR': 'Information Retrieval',
  'cs.IT': 'Information Theory',
  'cs.PL': 'Programming Languages',
  'cs.SI': 'Social and Information Networks',
  'stat.ML': 'Machine Learning (Statistics)',
  'stat.ME': 'Methodology',
  'math.OC': 'Optimization and Control',
  'eess.SP': 'Signal Processing',
  'eess.IV': 'Image and Video Processing',
  'physics.comp-ph': 'Computational Physics',
  'q-bio.QM': 'Quantitative Methods (Biology)',
  'q-fin.ST': 'Statistical Finance',
};
