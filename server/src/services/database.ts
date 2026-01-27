import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(path.join(DATA_DIR, 'papers.db'));

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arxiv_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      authors TEXT NOT NULL,
      published TEXT NOT NULL,
      updated TEXT NOT NULL,
      categories TEXT NOT NULL,
      pdf_url TEXT NOT NULL,
      abs_url TEXT NOT NULL,
      doi TEXT,
      journal_ref TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'reading', 'reviewed', 'exported'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      page_number INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1'
    );

    CREATE TABLE IF NOT EXISTS paper_tags (
      paper_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (paper_id, tag_id),
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorite_authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_citations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citing_paper_id INTEGER NOT NULL,
      cited_paper_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(citing_paper_id, cited_paper_id),
      FOREIGN KEY (citing_paper_id) REFERENCES papers(id) ON DELETE CASCADE,
      FOREIGN KEY (cited_paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS worldlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worldline_papers (
      worldline_id INTEGER NOT NULL,
      paper_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (worldline_id, paper_id),
      FOREIGN KEY (worldline_id) REFERENCES worldlines(id) ON DELETE CASCADE,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
    CREATE INDEX IF NOT EXISTS idx_comments_paper_id ON comments(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_tags_paper_id ON paper_tags(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_tags_tag_id ON paper_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_citations_citing ON paper_citations(citing_paper_id);
    CREATE INDEX IF NOT EXISTS idx_citations_cited ON paper_citations(cited_paper_id);
    CREATE INDEX IF NOT EXISTS idx_worldline_papers_worldline ON worldline_papers(worldline_id);
    CREATE INDEX IF NOT EXISTS idx_worldline_papers_paper ON worldline_papers(paper_id);
  `);
}

// Paper operations
export function savePaper(paper: {
  arxiv_id: string;
  title: string;
  summary: string;
  authors: string;
  published: string;
  updated: string;
  categories: string;
  pdf_url: string;
  abs_url: string;
  doi?: string;
  journal_ref?: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO papers (arxiv_id, title, summary, authors, published, updated, categories, pdf_url, abs_url, doi, journal_ref)
    VALUES (@arxiv_id, @title, @summary, @authors, @published, @updated, @categories, @pdf_url, @abs_url, @doi, @journal_ref)
    ON CONFLICT(arxiv_id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      authors = excluded.authors,
      updated = excluded.updated,
      categories = excluded.categories
  `);
  return stmt.run(paper);
}

export function getPapers(options?: { status?: string; tag_id?: number }) {
  if (options?.tag_id) {
    return db.prepare(`
      SELECT p.* FROM papers p
      JOIN paper_tags pt ON p.id = pt.paper_id
      WHERE pt.tag_id = ?
      ORDER BY p.added_at DESC
    `).all(options.tag_id);
  }
  if (options?.status) {
    return db.prepare('SELECT * FROM papers WHERE status = ? ORDER BY added_at DESC').all(options.status);
  }
  return db.prepare('SELECT * FROM papers ORDER BY added_at DESC').all();
}

export function getPaper(id: number) {
  return db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
}

export function getPaperByArxivId(arxivId: string) {
  return db.prepare('SELECT * FROM papers WHERE arxiv_id = ?').get(arxivId);
}

export function updatePaperStatus(id: number, status: string) {
  return db.prepare('UPDATE papers SET status = ? WHERE id = ?').run(status, id);
}

export function deletePaper(id: number) {
  return db.prepare('DELETE FROM papers WHERE id = ?').run(id);
}

// Comment operations
export function addComment(paperId: number, content: string, pageNumber?: number) {
  return db.prepare(
    'INSERT INTO comments (paper_id, content, page_number) VALUES (?, ?, ?)'
  ).run(paperId, content, pageNumber ?? null);
}

export function getComments(paperId: number) {
  return db.prepare(
    'SELECT * FROM comments WHERE paper_id = ? ORDER BY created_at DESC'
  ).all(paperId);
}

export function updateComment(id: number, content: string) {
  return db.prepare(
    'UPDATE comments SET content = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(content, id);
}

export function deleteComment(id: number) {
  return db.prepare('DELETE FROM comments WHERE id = ?').run(id);
}

// Tag operations
export function createTag(name: string, color: string = '#6366f1') {
  return db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
}

export function getTags() {
  return db.prepare('SELECT * FROM tags ORDER BY name').all();
}

export function updateTag(id: number, name: string, color: string) {
  return db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, id);
}

export function deleteTag(id: number) {
  return db.prepare('DELETE FROM tags WHERE id = ?').run(id);
}

export function addPaperTag(paperId: number, tagId: number) {
  return db.prepare(
    'INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)'
  ).run(paperId, tagId);
}

export function removePaperTag(paperId: number, tagId: number) {
  return db.prepare(
    'DELETE FROM paper_tags WHERE paper_id = ? AND tag_id = ?'
  ).run(paperId, tagId);
}

export function getPaperTags(paperId: number) {
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN paper_tags pt ON t.id = pt.tag_id
    WHERE pt.paper_id = ?
    ORDER BY t.name
  `).all(paperId);
}

// Favorite author operations
export function addFavoriteAuthor(name: string) {
  return db.prepare('INSERT INTO favorite_authors (name) VALUES (?)').run(name);
}

export function getFavoriteAuthors() {
  return db.prepare('SELECT * FROM favorite_authors ORDER BY added_at DESC').all();
}

export function removeFavoriteAuthor(id: number) {
  return db.prepare('DELETE FROM favorite_authors WHERE id = ?').run(id);
}

export function getFavoriteAuthorByName(name: string) {
  return db.prepare('SELECT * FROM favorite_authors WHERE name = ?').get(name);
}

// Citation operations
export function addCitation(citingPaperId: number, citedPaperId: number) {
  return db.prepare(
    'INSERT OR IGNORE INTO paper_citations (citing_paper_id, cited_paper_id) VALUES (?, ?)'
  ).run(citingPaperId, citedPaperId);
}

export function removeCitation(citingPaperId: number, citedPaperId: number) {
  return db.prepare(
    'DELETE FROM paper_citations WHERE citing_paper_id = ? AND cited_paper_id = ?'
  ).run(citingPaperId, citedPaperId);
}

export function getCitations() {
  return db.prepare(`
    SELECT pc.id, pc.citing_paper_id, pc.cited_paper_id, pc.created_at
    FROM paper_citations pc
    ORDER BY pc.created_at DESC
  `).all();
}

export function getCitationsForPaper(paperId: number) {
  return db.prepare(`
    SELECT pc.id, pc.citing_paper_id, pc.cited_paper_id
    FROM paper_citations pc
    WHERE pc.citing_paper_id = ? OR pc.cited_paper_id = ?
  `).all(paperId, paperId);
}

// Worldline operations
export function createWorldline(name: string, color: string = '#6366f1') {
  return db.prepare('INSERT INTO worldlines (name, color) VALUES (?, ?)').run(name, color);
}

export function getWorldlines() {
  return db.prepare('SELECT * FROM worldlines ORDER BY created_at DESC').all();
}

export function updateWorldline(id: number, name: string, color: string) {
  return db.prepare('UPDATE worldlines SET name = ?, color = ? WHERE id = ?').run(name, color, id);
}

export function deleteWorldline(id: number) {
  return db.prepare('DELETE FROM worldlines WHERE id = ?').run(id);
}

export function getWorldlinePapers(worldlineId: number) {
  return db.prepare(`
    SELECT p.*, wp.position FROM papers p
    JOIN worldline_papers wp ON p.id = wp.paper_id
    WHERE wp.worldline_id = ?
    ORDER BY wp.position ASC
  `).all(worldlineId);
}

export function addWorldlinePaper(worldlineId: number, paperId: number, position: number) {
  return db.prepare(
    'INSERT OR REPLACE INTO worldline_papers (worldline_id, paper_id, position) VALUES (?, ?, ?)'
  ).run(worldlineId, paperId, position);
}

export function removeWorldlinePaper(worldlineId: number, paperId: number) {
  return db.prepare(
    'DELETE FROM worldline_papers WHERE worldline_id = ? AND paper_id = ?'
  ).run(worldlineId, paperId);
}

// Get all worldlines with their papers' titles and summaries (for similarity scoring)
export function getAllWorldlinesWithPapers(): {
  id: number;
  name: string;
  color: string;
  papers: { title: string; summary: string }[];
}[] {
  const worldlines = db.prepare('SELECT id, name, color FROM worldlines ORDER BY id').all() as {
    id: number;
    name: string;
    color: string;
  }[];

  const paperStmt = db.prepare(`
    SELECT p.title, p.summary FROM papers p
    JOIN worldline_papers wp ON p.id = wp.paper_id
    WHERE wp.worldline_id = ?
  `);

  return worldlines.map(wl => ({
    ...wl,
    papers: paperStmt.all(wl.id) as { title: string; summary: string }[],
  }));
}

export default db;
