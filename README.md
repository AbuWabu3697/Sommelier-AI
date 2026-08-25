# Sommelier AI

Sommelier AI is a conversational wine assistant built with Next.js, TypeScript, Tailwind CSS, the Vercel AI SDK, Groq, Zod, Google Sheets, ChromaDB, and a standalone Express API backed by Postgres with pgvector.

The Google Sheets source loads 448 wine records. Those rows are normalized, embedded with @chroma-core/default-embed (384-dim vectors), indexed into ChromaDB and Postgres, and retrieved with top-k=6 semantic search before grounded responses are built.

## Architecture

```text
User query (Next.js frontend)
  |
  v
Query router
  |
  +--> Direct chat / preference gathering
  +--> Chroma semantic retrieval (Next.js layer)
  +--> Postgres pgvector retrieval (Express API layer)
  +--> Food / cooking tool provider (Spoonacular)
  +--> Retrieval + tool for follow-up or pairing questions
  |
  v
Verified wine/tool context
  |
  v
Groq LLM when configured, deterministic fallback otherwise

Express API (port 4000)
  |
  +--> GET  /wines       — paginated rows from Postgres
  +--> POST /recommend   — top-k=6 pgvector or deterministic fallback
  +--> GET  /search      — structured filter search from Postgres
```

### Data pipeline

```text
Google Sheets (448 records)
  -> fetchWineRowsFromPublicSheet
  -> normalizeWineRows (lib/data/normalize-wine.ts)
  -> calculateBestValueScore (ratingWeight=0.72, priceWeight=0.28)
  -> Upsert into Postgres wines table (scripts/seed.ts)
  -> Upsert into ChromaDB collection (POST /api/ingest)
  -> Embedding pass: @chroma-core/default-embed 384-dim vectors -> pgvector column
```

## Tech stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS with Radix UI components
- Vercel AI SDK with Groq integration
- ChromaDB via the official `chromadb` JavaScript client
- `@chroma-core/default-embed` for local 384-dim embeddings
- Express 4 for the standalone API server
- Prisma 5 with `pgvector` extension for Postgres
- Zod for route validation
- Vitest for the Express API test suite
- Spoonacular provider for food/cooking tools, with explicit development fallback

## Environment variables

Copy `.env.example` and fill in values as needed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes (Express API) | — | Postgres connection string; pgvector extension must be enabled |
| `PORT` | No | `4000` | Express API listen port |
| `GROQ_API_KEY` | No | — | Enables live Groq generation; deterministic fallback used otherwise |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq chat model |
| `GROQ_ROUTER_MODEL` | No | `llama-3.1-8b-instant` | Groq router model |
| `GOOGLE_SHEETS_ID` | No | public sheet (448 records) | Source spreadsheet ID |
| `WINE_DATA_CSV_URL` | No | — | Alternative CSV source |
| `WINE_DATA_JSON_URL` | No | — | Alternative JSON source |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB server URL |
| `CHROMA_COLLECTION` | No | `sommelier_wines` | ChromaDB collection name |
| `CHROMA_API_KEY` | No | — | ChromaDB auth token |
| `CHROMA_INGEST_BATCH_SIZE` | No | `100` | Batch size for Chroma upserts |
| `RAG_TOP_K` | No | `6` | Number of semantic results to retrieve |
| `RAG_DEBUG` | No | `false` | Include diagnostics in wine route responses |
| `EMBED_DIM` | No | `384` | Embedding dimension (@chroma-core/default-embed) |
| `FOOD_API_KEY` | No | — | Spoonacular API key; falls back to development stub |
| `ADMIN_API_TOKEN` | No | — | Bearer token for POST /api/ingest in production |
| `EVALUATION_PORT` | No | `3100` | Port used by the evaluation runner |

## Local setup

This repo is standardized on npm.

### Next.js frontend + ChromaDB

```bash
npm install
docker run -p 8000:8000 chromadb/chroma
npm run dev
```

Open `http://localhost:3000`.

### Express API + Postgres

```bash
# Start Postgres with pgvector using Docker Compose
docker-compose up postgres -d

# Generate Prisma client and push schema
npm run db:generate
npm run db:push

# Seed 448 wine records into Postgres
npm run db:seed

# Start the Express API
npm run server:dev
```

The API listens on `http://localhost:4000`.

## ChromaDB ingestion

Run ChromaDB first, then call:

```bash
curl -X POST http://localhost:3000/api/ingest
```

In production, set `ADMIN_API_TOKEN` and pass `Authorization: Bearer <token>`.

The ingestion flow:

```text
Google Sheets / CSV / JSON
  -> normalize wine rows
  -> build one descriptive document per wine
  -> calculate numeric bestValueScore
  -> upsert documents + metadata into Chroma
```

## Express API endpoints

### GET /wines

Returns paginated wine rows from Postgres.

```bash
# Page 1, 20 results
curl http://localhost:4000/wines

# Filter by type and country, second page
curl "http://localhost:4000/wines?type=Red&country=France&page=2&limit=10"
```

Query params: `page` (default 1), `limit` (default 20, max 100), `type`, `country`, `varietal`, `maxPrice`.

Response:

```json
{
  "wines": [...],
  "total": 448,
  "page": 1,
  "limit": 20,
  "totalPages": 23
}
```

### POST /recommend

Returns top-k=6 semantic matches. Uses pgvector cosine similarity when embeddings are indexed; falls back to deterministic bestValueScore ranking when the embedding index is empty.

```bash
curl -X POST http://localhost:4000/recommend \
  -H "Content-Type: application/json" \
  -d '{"query": "crisp white wine under $25 for seafood", "topK": 6}'
```

With filters:

```bash
curl -X POST http://localhost:4000/recommend \
  -H "Content-Type: application/json" \
  -d '{"query": "bold red for grilling", "filters": {"type": "Red", "maxPrice": 60}}'
```

Response:

```json
{
  "recommendations": [...],
  "mode": "pgvector",
  "query": "crisp white wine under $25 for seafood"
}
```

`mode` is `"pgvector"` when the embedding index is populated, `"fallback"` otherwise.

### GET /search

Searches across name, producer, description, varietal, and region with optional structured filters.

```bash
curl "http://localhost:4000/search?q=pinot+noir&type=Red&maxPrice=50"
```

Response:

```json
{
  "results": [...],
  "total": 12,
  "query": "pinot noir"
}
```

## Next.js wine API

Chat requests use `/api/wine` from the frontend. `/api/chat` is also available for direct API testing.

```bash
curl -X POST http://localhost:3000/api/wine \
  -H "Content-Type: application/json" \
  -d '{"question":"I want a crisp white wine under $25 for seafood","debug":true,"history":[]}'
```

## Running tests

```bash
# Original RAG core tests (Node test runner)
npm test

# Express API handler tests (Vitest)
npm run test:api

# Full evaluation suite (starts a local Next server on EVALUATION_PORT)
npm run evaluate
```

## Best value scoring

`bestValueScore` is a deterministic weighted score:

```text
ratingWeight * normalizedRating + priceWeight * normalizedAffordability
```

Defaults: `ratingWeight=0.72`, `priceWeight=0.28`, `pricePivot=60`, `minimumUsefulRating=82`. Stored as a numeric column in Postgres and used for reranking value-oriented queries and as the deterministic fallback ordering in `/recommend`.

## Follow-up context

The chat UI preserves source wine IDs from prior recommendations. Follow-up questions such as "How can I use that wine in cooking?" resolve the prior wine ID first, then pass the verified wine record into the cooking/pairing tool path.

## Tool provider

`lib/tools/food-provider.ts` implements a Spoonacular HTTP provider when `FOOD_API_KEY` is configured. If no key is present or the API fails, responses are marked as fallback:

```text
development-food-provider:fallback
spoonacular:real
spoonacular:unavailable
```

## Verification

```bash
npm test
npm run test:api
npm run lint
npx tsc --noEmit
npm run build
node scripts/test-chroma.mjs
npm run evaluate
```

## Current limitations

- Current public sheet yields 448 wines.
- Groq live generation and provider-reported token usage require `GROQ_API_KEY`.
- Spoonacular real API calls require `FOOD_API_KEY`; otherwise the provider is an explicit development fallback.
- The pgvector embedding pass is not automated in the seed script; run it separately after seeding if you want the pgvector path in `/recommend` to activate.
- The measured local token reduction is an estimate based on serialized prompt/context size, not a provider-reported metric.
