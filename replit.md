# LexExtract — Legal Document Intelligence Engine

AI-powered extraction of structured information from court judgment PDFs, with confidence scores and source-linked traceability.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/legal-doc-engine run dev` — run the frontend (port 22675)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — auto-set via Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/legal-doc-engine)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (claude-sonnet-4-6) via Replit AI Integrations
- PDF parsing: pdf-parse (CJS, externalized in esbuild)
- File uploads: multer (memory storage, 50MB limit)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/documents.ts` — documents table schema
- `artifacts/api-server/src/routes/documents/index.ts` — PDF upload, listing, deletion, AI analysis routes
- `artifacts/api-server/src/lib/legalExtractor.ts` — Anthropic-powered legal extraction logic
- `artifacts/api-server/src/lib/extractText.ts` — PDF text extraction using pdf-parse
- `artifacts/legal-doc-engine/src/pages/dashboard.tsx` — main dashboard page
- `artifacts/legal-doc-engine/src/pages/document-view.tsx` — analysis detail page
- `lib/integrations-anthropic-ai/` — Anthropic SDK client wrapper

## Architecture decisions

- pdf-parse is externalized in esbuild (added to `external` array) and required at runtime via `createRequire` to avoid ESM/CJS mismatch
- AI extraction sends up to 60,000 characters of PDF text to Claude and parses structured JSON with confidence scores per field
- Analysis results are stored as JSONB in Postgres alongside overall confidence for fast stats queries
- File uploads use multer with memory storage (no disk, no object storage needed for MVP)
- Upload is raw `fetch` (multipart/form-data) rather than a generated hook since Orval doesn't generate file upload hooks

## Product

- Upload court judgment PDFs (scanned or digital) — up to 50 MB
- AI automatically extracts: case number, case name, court, judgment date, judge, all parties with roles, court directives/orders with source text, highlighted sections by category
- Each extracted field comes with an individual confidence score (0–100%)
- Overall confidence score gives a quick quality-at-a-glance signal
- Dashboard shows stats (total, pending, processing, completed, failed, avg confidence)
- Source-linked directives show verbatim text from the document for verification

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- pdf-parse must remain in the `external` array in `build.mjs` — bundling it causes ESM/CJS errors
- Anthropic model in use: `claude-sonnet-4-6` (balanced speed + quality for legal text)
- The `analysisJson` column is JSONB — query it as `doc.analysisJson as DocumentAnalysis`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
