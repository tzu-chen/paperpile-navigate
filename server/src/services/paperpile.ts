import { SavedPaper, Comment, Tag } from '../types';

/**
 * Generate a BibTeX entry for a paper.
 * This can be imported directly into Paperpile via their BibTeX import feature.
 */
export function generateBibtex(paper: SavedPaper, tags: Tag[], comments: Comment[]): string {
  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];
  const year = new Date(paper.published).getFullYear();

  // Generate citation key: first author's last name + year
  const firstAuthorLastName = authors[0]
    ?.split(' ')
    .pop()
    ?.replace(/[^a-zA-Z]/g, '')
    ?.toLowerCase() || 'unknown';
  const citeKey = `${firstAuthorLastName}${year}${paper.arxiv_id.replace(/[^a-zA-Z0-9]/g, '')}`;

  const bibtexAuthors = authors.join(' and ');

  const tagStr = tags.map(t => t.name).join(', ');
  const commentStr = comments
    .map(c => {
      const pageRef = c.page_number ? ` [p.${c.page_number}]` : '';
      return `${c.content}${pageRef}`;
    })
    .join('; ');

  const fields: string[] = [
    `  author = {${bibtexAuthors}}`,
    `  title = {${paper.title}}`,
    `  year = {${year}}`,
    `  eprint = {${paper.arxiv_id}}`,
    `  archiveprefix = {arXiv}`,
    `  primaryclass = {${categories[0] || ''}}`,
    `  abstract = {${paper.summary}}`,
    `  url = {${paper.abs_url}}`,
  ];

  if (paper.doi) {
    fields.push(`  doi = {${paper.doi}}`);
  }
  if (paper.journal_ref) {
    fields.push(`  journal = {${paper.journal_ref}}`);
  }
  if (tagStr) {
    fields.push(`  keywords = {${tagStr}}`);
  }
  if (commentStr) {
    fields.push(`  note = {${commentStr}}`);
  }

  return `@article{${citeKey},\n${fields.join(',\n')}\n}`;
}

/**
 * Generate BibTeX for multiple papers.
 */
export function generateBibtexBundle(
  papers: Array<{ paper: SavedPaper; tags: Tag[]; comments: Comment[] }>
): string {
  return papers.map(p => generateBibtex(p.paper, p.tags, p.comments)).join('\n\n');
}

/**
 * Generate a Paperpile-compatible JSON metadata object.
 * Paperpile supports importing structured metadata via their API or browser extension.
 */
export function generatePaperpileMetadata(
  paper: SavedPaper,
  tags: Tag[],
  comments: Comment[]
) {
  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];

  return {
    title: paper.title,
    authors: authors.map(name => {
      const parts = name.trim().split(' ');
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ');
      return { first: firstName, last: lastName };
    }),
    year: new Date(paper.published).getFullYear(),
    abstract: paper.summary,
    source: 'arXiv',
    identifiers: {
      arxiv: paper.arxiv_id,
      doi: paper.doi || undefined,
    },
    urls: {
      pdf: paper.pdf_url,
      abstract: paper.abs_url,
    },
    labels: tags.map(t => t.name),
    folders: categories,
    notes: comments.map(c => ({
      text: c.content,
      page: c.page_number,
      created: c.created_at,
    })),
    journal: paper.journal_ref || `arXiv:${paper.arxiv_id}`,
  };
}
