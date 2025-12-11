# DocExtract Web Application

DocExtract provides a browser-based workspace for uploading documents, running AI-assisted parsing, and reviewing extracted fields before exporting structured data. This repository contains the React single-page application that powers that experience.

## Features

- Upload PDF and image files via drag-and-drop or file selector
- Render documents side-by-side with extracted fields for quick QA
- Highlight overlays to visualize detected regions in the original document
- Tabular view of structured results for faster verification
- Responsive layout designed for desktop and large-format screens

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

Verify your versions:

```sh
node -v
npm -v
```

## Installation

```sh
git clone <repository-url>
cd <repository-directory>
npm install
```

### Local Development

```sh
npm run dev
```

The Vite dev server runs on `http://localhost:8080` by default (override via `VITE_PORT` or by editing `vite.config.ts`).

### Production Build

```sh
npm run build
```

The optimized bundle is output to `dist/`. Preview the production build locally with:

```sh
npm run preview
```

## Available Scripts

- `npm run dev` – start the development server with hot module replacement
- `npm run build` – create a production build
- `npm run build:dev` – build using development mode settings
- `npm run preview` – serve the contents of `dist/` locally
- `npm run lint` – execute ESLint across the codebase

## Configuration

Runtime configuration is handled via Vite environment variables. Create `.env` (or `.env.local`) files at the project root to supply API endpoints or feature flags, e.g.:

```
VITE_API_BASE_URL=https://api.example.com
VITE_ENABLE_EXPERIMENTAL_WORKFLOWS=false
```

Restart the dev server after updating environment files.

## Project Structure

- `src/App.tsx` – top-level route layout
- `src/components/` – reusable UI primitives and composite widgets
- `src/components/upload/` – document upload workflows
- `src/components/workspace/` – panels for PDF preview, highlights, tables, and template fields
- `src/hooks/` – shared React hooks
- `src/pages/` – route-level components (`Home`, `Upload`, `Workspace`, etc.)
- `src/types/` – shared TypeScript definitions for documents and extraction results
- `public/` – static assets served as-is (favicons, robots file, etc.)

## Styling and UI

The interface is built with Tailwind CSS, shadcn/ui components, and Lucide icons. Theme toggling and layout primitives live under `src/components/ui/`.

## Testing (Planned)

Automated tests are not yet configured. Recommended next steps:

1. Introduce Vitest for component and hook unit tests
2. Add Playwright or Cypress for key end-to-end document workflows

## Contribution Workflow

1. Create a feature branch from `main`
2. Run `npm run lint` and ensure the dev server is warning-free
3. Submit a pull request with a concise summary and testing notes

## Deployment

Deploy the `dist/` folder using your preferred static hosting provider (Netlify, Vercel, Azure Static Web Apps, AWS S3 + CloudFront, etc.). Configure any required environment variables in the provider's dashboard to match your `.env` settings.

---

Need help or found a bug? Open an issue in this repository so we can keep DocExtract improving.
