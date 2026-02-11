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
    // If query already has a field prefix (e.g. au:, ti:, abs:), use it directly
    if (/^(au|ti|abs|co|jr|cat|rn|id|all):/.test(query)) {
      searchTerms.push(query);
    } else {
      searchTerms.push(`all:${query}`);
    }
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

export async function searchByAuthor(authorName: string, maxResults: number = 20): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const quoted = `"${authorName}"`;
  const encoded = encodeURIComponent(quoted);
  const url = `${ARXIV_API_BASE}?search_query=au:${encoded}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

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

interface RssItem {
  title?: string[];
  link?: string[];
  description?: string[];
  guid?: Array<{ _: string } | string>;
  category?: string[];
  pubDate?: string[];
  'arxiv:announce_type'?: string[];
  'dc:creator'?: string[];
}

function parseRssItem(item: RssItem, announceType?: string): ArxivPaper | null {
  const link = item.link?.[0] || '';
  const idMatch = link.match(/abs\/(.+?)(?:v\d+)?$/);
  if (!idMatch) return null;

  const id = idMatch[1];
  const rawDesc = item.description?.[0] || '';
  // Description format: "arXiv:XXXX Announce Type: new \n Abstract: actual abstract..."
  const summary = rawDesc.replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s*Abstract:\s*/i, '').trim();

  const rawCreator = item['dc:creator']?.[0] || '';
  // Authors are comma-separated but may include affiliations in parentheses
  const authors = rawCreator
    .split(/,\s*(?![^()]*\))/)
    .map(a => a.replace(/\s*\(.*?\)\s*/g, '').trim())
    .filter(Boolean);

  const pubDate = item.pubDate?.[0] || new Date().toISOString();
  const categories = item.category || [];

  const isoDate = new Date(pubDate).toISOString();
  const paper: ArxivPaper = {
    id,
    title: (item.title?.[0] || '').replace(/\s+/g, ' ').trim(),
    summary: summary.replace(/\s+/g, ' ').trim(),
    authors,
    published: isoDate,
    updated: isoDate,
    categories,
    pdfUrl: `https://arxiv.org/pdf/${id}`,
    absUrl: `https://arxiv.org/abs/${id}`,
    listingDate: isoDate,
  };

  if (announceType === 'new' || announceType === 'cross' || announceType === 'replace' || announceType === 'replace-cross') {
    paper.announceType = announceType;
  }

  return paper;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseNewListingsHtml(html: string): ArxivPaper[] {
  // ArXiv uses separate <dl id='articles'> blocks for each section
  const allBlocks = [...html.matchAll(/<dl id='articles'>([\s\S]*?)<\/dl>/g)];
  if (allBlocks.length === 0) return [];

  const papers: ArxivPaper[] = [];

  // Extract listing date from the page header
  const dateMatch = html.match(/Showing new listings for \w+, (\d+ \w+ \d+)/);
  const listingDate = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString();

  for (const block of allBlocks) {
    const blockHtml = block[1];

    // Determine announcement type from the <h3> header only (not paper content)
    const headerMatch = blockHtml.match(/<h3>([\s\S]*?)<\/h3>/);
    const headerText = headerMatch ? headerMatch[1] : '';
    let announceType: 'new' | 'cross' | 'replace' | undefined;
    if (/New submissions/i.test(headerText)) {
      announceType = 'new';
    } else if (/Cross/i.test(headerText)) {
      announceType = 'cross';
    } else if (/Replacement/i.test(headerText)) {
      announceType = 'replace';
    } else {
      continue;
    }

    // Split block into individual paper entries by <dt> tags
    const entries = blockHtml.split(/<dt>/);

    for (const entry of entries) {
      if (!entry.includes('<dd>')) continue;

      // Extract paper ID from the abs link
      const idMatch = entry.match(/href\s*=\s*"\/abs\/([^"]+)"/);
      if (!idMatch) continue;
      const id = idMatch[1].replace(/v\d+$/, '');

      // Extract title (after the "Title:" descriptor span)
      const titleMatch = entry.match(/<div class='list-title[^']*'>\s*(?:<span[^>]*>Title:<\/span>)?\s*([\s\S]*?)\s*<\/div>/);
      const title = titleMatch
        ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        : '';

      // Extract authors from anchor tags
      const authorsMatch = entry.match(/<div class='list-authors'>([\s\S]*?)<\/div>/);
      const authors: string[] = [];
      if (authorsMatch) {
        for (const m of authorsMatch[1].matchAll(/>([^<]+)<\/a>/g)) {
          const name = m[1].trim();
          if (name) authors.push(name);
        }
      }

      // Extract categories from subjects (text in parentheses like cs.AI)
      const subjectsMatch = entry.match(/<div class='list-subjects'>([\s\S]*?)<\/div>/);
      const categories: string[] = [];
      if (subjectsMatch) {
        for (const m of subjectsMatch[1].matchAll(/\(([a-z][\w-]*[.-][\w.-]*)\)/g)) {
          categories.push(m[1]);
        }
      }

      // Extract abstract
      const abstractMatch = entry.match(/<p class='mathjax'>\s*([\s\S]*?)\s*<\/p>/);
      const summary = abstractMatch
        ? decodeHtmlEntities(abstractMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        : '';

      const paper: ArxivPaper = {
        id,
        title,
        summary,
        authors,
        published: listingDate,
        updated: listingDate,
        categories,
        pdfUrl: `https://arxiv.org/pdf/${id}`,
        absUrl: `https://arxiv.org/abs/${id}`,
        announceType,
        listingDate,
      };

      papers.push(paper);
    }
  }

  return papers;
}

async function fetchNewListingsHtml(category: string): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const url = `https://arxiv.org/list/${encodeURIComponent(category)}/new`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArXiv listing page error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const papers = parseNewListingsHtml(html);

  if (papers.length === 0) {
    throw new Error('No papers parsed from ArXiv listing page');
  }

  return { papers, totalResults: papers.length };
}

async function fetchLatestArxivRss(category: string): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const url = `https://rss.arxiv.org/rss/${encodeURIComponent(category)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArXiv RSS error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const result = await parseStringPromise(xml);

  const channel = result?.rss?.channel?.[0];
  if (!channel || !channel.item) {
    return { papers: [], totalResults: 0 };
  }

  const papers: ArxivPaper[] = [];
  for (const item of channel.item) {
    const announceType = item['arxiv:announce_type']?.[0];
    const paper = parseRssItem(item, announceType);
    if (paper) papers.push(paper);
  }

  return { papers, totalResults: papers.length };
}

export async function fetchLatestArxiv(category: string): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  // Primary: scrape the ArXiv new listings page (updates immediately with announcements)
  // Fallback: RSS feed (can lag hours behind the main site)
  try {
    return await fetchNewListingsHtml(category);
  } catch (err) {
    console.warn('HTML listing fetch failed, falling back to RSS:', err);
    return await fetchLatestArxivRss(category);
  }
}

function parseRecentListingsHtml(html: string): ArxivPaper[] {
  // The /recent page has a single <dl id='articles'> block with <h3> date headers
  // interspersed among <dt>/<dd> entries. Cross-listed papers have
  // "(cross-list from cs.XX)" in their <dt> block.
  const dlMatch = html.match(/<dl id='articles'>([\s\S]*?)<\/dl>/);
  if (!dlMatch) return [];

  const dlContent = dlMatch[1];
  const papers: ArxivPaper[] = [];

  // Split by <h3> to get date sections. First element is before any <h3>.
  const sections = dlContent.split(/<h3>/);

  for (const section of sections) {
    // Extract date from the h3 content (e.g. "Wed, 11 Feb 2026 (showing ...)")
    const dateMatch = section.match(/^\s*(\w+,\s+\d+\s+\w+\s+\d+)/);
    if (!dateMatch) continue;
    const listingDate = new Date(dateMatch[1]).toISOString();

    // Split into individual entries by <dt>
    const entries = section.split(/<dt>/);

    for (const entry of entries) {
      if (!entry.includes('<dd>')) continue;

      // Extract paper ID from the abs link
      const idMatch = entry.match(/href\s*=\s*"\/abs\/([^"]+)"/);
      if (!idMatch) continue;
      const id = idMatch[1].replace(/v\d+$/, '');

      // Detect cross-listed papers
      const isCrossListed = /\(cross-list from\s+[\w.-]+\)/.test(entry);
      const announceType: 'new' | 'cross' = isCrossListed ? 'cross' : 'new';

      // Extract title
      const titleMatch = entry.match(/<div class='list-title[^']*'>\s*(?:<span[^>]*>Title:<\/span>)?\s*([\s\S]*?)\s*<\/div>/);
      const title = titleMatch
        ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        : '';

      // Extract authors from anchor tags
      const authorsMatch = entry.match(/<div class='list-authors'>([\s\S]*?)<\/div>/);
      const authors: string[] = [];
      if (authorsMatch) {
        for (const m of authorsMatch[1].matchAll(/>([^<]+)<\/a>/g)) {
          const name = m[1].trim();
          if (name) authors.push(name);
        }
      }

      // Extract categories
      const subjectsMatch = entry.match(/<div class='list-subjects'>([\s\S]*?)<\/div>/);
      const categories: string[] = [];
      if (subjectsMatch) {
        for (const m of subjectsMatch[1].matchAll(/\(([a-z][\w-]*[.-][\w.-]*)\)/g)) {
          categories.push(m[1]);
        }
      }

      // Extract abstract (not present on the /recent page, but check anyway)
      const abstractMatch = entry.match(/<p class='mathjax'>\s*([\s\S]*?)\s*<\/p>/);
      const summary = abstractMatch
        ? decodeHtmlEntities(abstractMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        : '';

      papers.push({
        id,
        title,
        summary,
        authors,
        published: listingDate,
        updated: listingDate,
        categories,
        pdfUrl: `https://arxiv.org/pdf/${id}`,
        absUrl: `https://arxiv.org/abs/${id}`,
        announceType,
        listingDate,
      });
    }
  }

  return papers;
}

export async function fetchRecentArxiv(category: string): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
  const url = `https://arxiv.org/list/${encodeURIComponent(category)}/recent?show=2000`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArXiv recent listing error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const papers = parseRecentListingsHtml(html);

  return { papers, totalResults: papers.length };
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
