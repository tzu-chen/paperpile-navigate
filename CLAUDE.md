# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run install:all       # Install dependencies for root, server/, and client/
npm run dev               # Start both frontend (Vite) and backend (Express) concurrently
npm run dev:server        # Backend only (Express on port 3001)
npm run dev:client        # Frontend only (Vite on port 5173)
npm run build             # Build both client and server for production
npm start                 # Start production server (serves API + built frontend)
```

The Vite dev server proxies `/api` requests to `http://localhost:3001`.

## Architecture Overview

Full-stack TypeScript app: React 18 + Vite frontend, Express + SQLite backend. Manages academic papers from ArXiv with AI analysis via Claude API.

### Client (`client/src/`)

- **App.tsx** — Root component managing 6 view modes: `browse`, `library`, `authors`, `viewer`, `chatHistory`, `worldline`. Holds global state for papers, tags, and favorite authors.
- **components/** — 14 components. `PaperViewer` is the main reading interface with a tabbed sidebar (chat, comments, tags, export, info) and `PDFViewer` on the left.
- **services/api.ts** — Centralized API client. All backend calls go through a `request<T>()` helper. Chat history and app settings (API key, theme) are stored in `localStorage`, not on the server.
- **types.ts** — Shared TypeScript interfaces (`ArxivPaper`, `SavedPaper`, `ChatSession`, `Tag`, `Worldline`, etc.). Note: `authors` and `categories` are JSON strings in `SavedPaper`.
- **colorSchemes.ts** — 8 theme definitions applied via CSS custom properties.

### Server (`server/src/`)

- **index.ts** — Express entry point. Mounts 7 route modules under `/api`, serves static client build in production with SPA fallback.
- **routes/** — RESTful route handlers:
  - `arxiv.ts` — Search/categories/PDF proxy (avoids CORS)
  - `papers.ts` — CRUD for saved papers + sub-routes for comments and tags
  - `tags.ts` — Tag management
  - `chat.ts` — Claude AI proxy. Fetches PDF from ArXiv (cached 30min in memory), sends to Anthropic API with paper context. Model: `claude-sonnet-4-20250514`, max tokens: 2048, uses prompt caching.
  - `authors.ts` — Favorite authors + batch-fetches their recent publications (3 concurrent)
  - `export.ts` — BibTeX and Paperpile JSON generation. Citation key format: `{LastName}{Year}{ArxivId}`
  - `worldlines.ts` — Citation network management (papers, citations, worldline groups)
- **services/** — Business logic layer:
  - `database.ts` — SQLite with WAL mode, foreign keys enabled. All queries use parameterized statements. Schema has 8 tables with cascade deletion from papers.
  - `arxiv.ts` — ArXiv REST API client (`http://export.arxiv.org/api/query`), XML parsing via xml2js.
  - `chat.ts` — Anthropic API integration with PDF base64 encoding and ephemeral prompt caching.
  - `paperpile.ts` — BibTeX/Paperpile export formatting, embeds tags as keywords and comments as notes.

### Database (`server/data/papers.db`)

SQLite database created at runtime. Key tables: `papers` (unique on `arxiv_id`), `comments` (per-page annotations), `tags`/`paper_tags`, `favorite_authors`, `paper_citations`, `worldlines`/`worldline_papers`. Status values: `new`, `reading`, `reviewed`, `exported`.

### Storage Split

- **Server-side (SQLite)**: Papers, comments, tags, authors, citations, worldlines
- **Client-side (localStorage)**: Claude API key, theme preference, chat session history
