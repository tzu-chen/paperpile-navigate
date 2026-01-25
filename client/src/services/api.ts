import { ArxivPaper, SavedPaper, Comment, Tag, CategoryGroup } from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ArXiv
export async function getCategories(): Promise<CategoryGroup[]> {
  return request('/arxiv/categories');
}

export async function searchArxiv(params: {
  category?: string;
  query?: string;
  start?: number;
  maxResults?: number;
  sortBy?: string;
}): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.query) qs.set('query', params.query);
  if (params.start !== undefined) qs.set('start', String(params.start));
  if (params.maxResults) qs.set('maxResults', String(params.maxResults));
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  return request(`/arxiv/search?${qs}`);
}

export function getPdfProxyUrl(arxivId: string): string {
  return `${BASE}/arxiv/pdf-proxy/${arxivId}`;
}

// Papers (Library)
export async function getSavedPapers(filters?: {
  status?: string;
  tag_id?: number;
}): Promise<SavedPaper[]> {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.tag_id) qs.set('tag_id', String(filters.tag_id));
  const query = qs.toString();
  return request(`/papers${query ? `?${query}` : ''}`);
}

export async function savePaper(paper: ArxivPaper): Promise<SavedPaper> {
  return request('/papers', {
    method: 'POST',
    body: JSON.stringify({
      arxiv_id: paper.id,
      title: paper.title,
      summary: paper.summary,
      authors: paper.authors,
      published: paper.published,
      updated: paper.updated,
      categories: paper.categories,
      pdf_url: paper.pdfUrl,
      abs_url: paper.absUrl,
      doi: paper.doi,
      journal_ref: paper.journalRef,
    }),
  });
}

export async function updatePaperStatus(id: number, status: string): Promise<void> {
  await request(`/papers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deletePaper(id: number): Promise<void> {
  await request(`/papers/${id}`, { method: 'DELETE' });
}

// Comments
export async function getComments(paperId: number): Promise<Comment[]> {
  return request(`/papers/${paperId}/comments`);
}

export async function addComment(
  paperId: number,
  content: string,
  pageNumber?: number
): Promise<{ id: number }> {
  return request(`/papers/${paperId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, page_number: pageNumber }),
  });
}

export async function updateComment(
  paperId: number,
  commentId: number,
  content: string
): Promise<void> {
  await request(`/papers/${paperId}/comments/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteComment(
  paperId: number,
  commentId: number
): Promise<void> {
  await request(`/papers/${paperId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

// Tags
export async function getTags(): Promise<Tag[]> {
  return request('/tags');
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return request('/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteTag(id: number): Promise<void> {
  await request(`/tags/${id}`, { method: 'DELETE' });
}

export async function addPaperTag(
  paperId: number,
  tagId: number
): Promise<void> {
  await request(`/papers/${paperId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag_id: tagId }),
  });
}

export async function removePaperTag(
  paperId: number,
  tagId: number
): Promise<void> {
  await request(`/papers/${paperId}/tags/${tagId}`, {
    method: 'DELETE',
  });
}

export async function getPaperTags(paperId: number): Promise<Tag[]> {
  return request(`/papers/${paperId}/tags`);
}

// Export
export function getBibtexUrl(paperId?: number, download = true): string {
  if (paperId) {
    return `${BASE}/export/bibtex/${paperId}?download=${download}`;
  }
  return `${BASE}/export/bibtex?download=${download}`;
}

export async function getBibtexText(paperId: number): Promise<string> {
  const res = await fetch(`${BASE}/export/bibtex/${paperId}`);
  return res.text();
}

export async function markExported(paperId: number): Promise<void> {
  await request(`/export/mark-exported/${paperId}`, { method: 'POST' });
}
