import { parseStringPromise } from 'xml2js';
import { ArxivPaper } from '../types';

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';

interface ArxivEntry {
  id: string[];
  title: string[];
  summary: string[];
  author: Array<{ name: string[] }>;
  published: string[];
  updated: string[];
  category: Array<{ $: { term: string } }>;
  link: Array<{ $: { href: string; title?: string; type?: string } }>;
  'arxiv:doi'?: Array<{ _: string }>;
  'arxiv:journal_ref'?: Array<{ _: string }>;
}

function extractArxivId(idUrl: string): string {
  // ArXiv IDs come as URLs like http://arxiv.org/abs/2301.00001v1
  const match = idUrl.match(/abs\/(.+?)(?:v\d+)?$/);
  return match ? match[1] : idUrl;
}

function parseEntry(entry: ArxivEntry): ArxivPaper {
  const id = extractArxivId(entry.id[0]);
  const pdfLink = entry.link.find(l => l.$.title === 'pdf');
  const absLink = entry.link.find(l => l.$.type === 'text/html') || entry.link[0];

  return {
    id,
    title: entry.title[0].replace(/\s+/g, ' ').trim(),
    summary: entry.summary[0].replace(/\s+/g, ' ').trim(),
    authors: entry.author ? entry.author.map(a => a.name[0]) : [],
    published: entry.published[0],
    updated: entry.updated[0],
    categories: entry.category ? entry.category.map(c => c.$.term) : [],
    pdfUrl: pdfLink ? pdfLink.$.href : `https://arxiv.org/pdf/${id}`,
    absUrl: absLink ? absLink.$.href : `https://arxiv.org/abs/${id}`,
    doi: entry['arxiv:doi']?.[0]?._ || undefined,
    journalRef: entry['arxiv:journal_ref']?.[0]?._ || undefined,
  };
}

export async function searchArxiv(params: {
  category?: string;
  query?: string;
  start?: number;
  maxResults?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
}): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const {
    category,
    query,
    start = 0,
    maxResults = 20,
    sortBy = 'submittedDate',
  } = params;

  const searchTerms: string[] = [];
  if (category) {
    searchTerms.push(`cat:${category}`);
  }
  if (query) {
    searchTerms.push(`all:${query}`);
  }

  const searchQuery = searchTerms.length > 0
    ? searchTerms.join('+AND+')
    : 'cat:cs.AI';

  const url = `${ARXIV_API_BASE}?search_query=${searchQuery}&start=${start}&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=descending`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArXiv API error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const result = await parseStringPromise(xml);

  const feed = result.feed;
  const totalResults = parseInt(feed['opensearch:totalResults']?.[0]?._ || '0', 10);

  if (!feed.entry) {
    return { papers: [], totalResults: 0 };
  }

  const papers = feed.entry.map((entry: ArxivEntry) => parseEntry(entry));
  return { papers, totalResults };
}

export async function getArxivPaper(arxivId: string): Promise<ArxivPaper | null> {
  const url = `${ARXIV_API_BASE}?id_list=${arxivId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArXiv API error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const result = await parseStringPromise(xml);

  if (!result.feed.entry) {
    return null;
  }

  return parseEntry(result.feed.entry[0]);
}
