# drip-dash
A dashboard experience for personal Gardyn plant management.

## Project structure

- **frontend/**: TypeScript + React application built with Vite
- **backend/**: TypeScript + Express API server

## Getting started

Development (backend on :3001, frontend on Vite with an /api proxy):

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm run dev
```

Phase 1 runs against a mock Gardyn data source (no hardware needed). See
`docs/superpowers/specs/2026-07-06-drip-dash-revamp-design.md` for the roadmap:
a real local data source is a separate later phase.

## Features

- Named gardens with tabbed per-garden pages for multi-system browsing
- Column-based plant grid with color-coded task pills (harvest, trim, pollinate, etc.)
- Tap any plant to open a modal with full details, care instructions, and editable per-plant task lists
- Todo tab with filter chips (filter by plant or task kind) and undo button for quick un-completion of recent chores

Production (single Node process serving API + built UI):

```bash
npm run build
npm start
```

### Available scripts

#### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

#### Backend
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run compiled production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

