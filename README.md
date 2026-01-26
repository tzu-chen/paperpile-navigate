# Paperpile Navigate

A full-stack research reference management system for browsing, organizing, and analyzing academic papers from ArXiv. Features AI-powered paper analysis via Claude, PDF viewing with inline comments, and BibTeX export for Paperpile integration.

## Features

- **ArXiv Paper Browsing** — Search and filter papers by category or keyword directly from the ArXiv database
- **Personal Library** — Save papers and track their status (new, reading, reviewed, exported)
- **PDF Viewer** — Read papers inline with page-level commenting
- **Tagging System** — Organize papers with custom color-coded tags
- **Favorite Authors** — Follow researchers and get automatic feeds of their publications
- **AI Chat** — Analyze and discuss papers with Claude, with persistent chat history and markdown-rendered responses
- **BibTeX Export** — Generate BibTeX entries for seamless Paperpile integration
- **Color Themes** — 8 built-in color schemes (dark and light variants)

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | React 18, TypeScript, Vite          |
| Backend  | Express, TypeScript, better-sqlite3 |
| AI       | Claude API (Anthropic)              |
| Database | SQLite                              |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (included with Node.js)
- A [Claude API key](https://console.anthropic.com/) (for the AI chat feature)

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/tzu-chen/paperpile-navigate.git
   cd paperpile-navigate
   ```

2. **Install all dependencies** (root, server, and client):

   ```bash
   npm run install:all
   ```

   This runs `npm install` in the root directory, `server/`, and `client/` in sequence.

## Running the Application

### Development

Start both the frontend dev server and the backend simultaneously:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

The Vite dev server automatically proxies `/api` requests to the backend.

You can also run them independently:

```bash
npm run dev:server   # backend only
npm run dev:client   # frontend only
```

### Production

Build the project and start the production server:

```bash
npm run build
npm start
```

The Express server serves both the API and the built frontend from `client/dist/`.

## Configuration

- **Claude API Key** — Enter your key in the in-app Settings modal. It is stored in browser `localStorage` and sent with chat requests.
- **Port** — The backend defaults to port `3001`. Override it with the `PORT` environment variable.
- **Color Scheme** — Select a theme from the Settings modal. The preference is stored in `localStorage`.

## Project Structure

```
paperpile-navigate/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components (PaperBrowser, Library, ChatPanel, etc.)
│   │   ├── services/       # API client
│   │   ├── styles/         # Global CSS
│   │   ├── App.tsx         # Root component
│   │   ├── types.ts        # Shared TypeScript interfaces
│   │   └── colorSchemes.ts # Theme definitions
│   └── vite.config.ts
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Database, ArXiv, chat, export logic
│   │   └── index.ts        # Server entry point
│   └── tsconfig.json
├── data/                   # SQLite database (created at runtime)
└── package.json            # Root scripts and dev dependencies
```

## License

This project is licensed under the [MIT License](LICENSE).
