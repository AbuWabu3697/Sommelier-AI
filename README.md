# Sommelier AI

Sommelier AI is a conversational wine assistant built with Next.js, TypeScript, Tailwind CSS, the Vercel AI SDK, Groq, Zod, Google Sheets, and ChromaDB.

The current public Google Sheets source loads 448 wine records. Those rows are normalized, embedded with Chroma's default embedding function, indexed into ChromaDB, and retrieved with top-k semantic search before grounded responses are built.

## Architecture

```text
User query
  |
  v
Query router
  |
  +--> Direct chat / preference gathering
  +--> Chroma semantic retrieval
  +--> Food / cooking tool provider
  +--> Retrieval + tool for follow-up or pairing questions
  |
  v
Verified wine/tool context
  |
  v
Groq LLM when configured, deterministic fallback otherwise
```

## Tech Stack

- Next.js, React, TypeScript
- Tailwind CSS and existing UI components
- Vercel AI SDK with Groq integration preserved
- ChromaDB via the official `chromadb` JavaScript client
- `@chroma-core/default-embed` for local embeddings
- Zod for route validation
- Spoonacular provider implementation for food/cooking tools, with explicit development fallback

## Environment

Copy `.env.example` and fill in values as needed.

```bash
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_ROUTER_MODEL=llama-3.1-8b-instant

GOOGLE_SHEETS_ID=1Bkv3Jb_8YuLUG2rWUhJhQBdaGjQCMFfwF9oJ5jrYDSA
WINE_DATA_CSV_URL=
WINE_DATA_JSON_URL=

CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=sommelier_wines
RAG_TOP_K=6

FOOD_API_KEY=
ADMIN_API_TOKEN=
```

Groq is optional for local verification. Without `GROQ_API_KEY`, the app uses deterministic grounded fallback responses and still tests routing, ingestion, retrieval, tools, diagnostics, and evaluation.

## Local Setup

This repo is standardized on npm.

```bash
npm install
docker run -p 8000:8000 chromadb/chroma
npm run dev
```

Open `http://localhost:3000`.

## Ingestion

Run ChromaDB first, then call:

```bash
curl -X POST http://localhost:3000/api/ingest
```

The ingestion flow is:

```text
Google Sheets / CSV / JSON
  -> normalize wine rows
  -> build one descriptive document per wine
  -> calculate numeric bestValueScore
  -> upsert documents + metadata into Chroma
```

In development the route is open. In production, set `ADMIN_API_TOKEN` and pass `Authorization: Bearer <token>`.

## Retrieval

Chat requests use `/api/wine` from the frontend. `/api/chat` is also available for direct API testing.

```bash
curl -X POST http://localhost:3000/api/wine \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"I want a crisp white wine under $25 for seafood\",\"debug\":true,\"history\":[]}"
```

Debug diagnostics report `retrievalMode`. Normal local operation after ingestion should show:

```text
retrievalMode: "chroma"
```

Structured constraints such as type, price, varietal, and rating are applied deterministically after retrieving a wider semantic candidate pool. This keeps embeddings responsible for meaning and metadata responsible for exact comparisons.

## Best Value

`bestValueScore` is a deterministic weighted score:

```text
ratingWeight * normalizedRating + priceWeight * normalizedAffordability
```

The default weights live in `lib/data/normalize-wine.ts`. The score is stored as numeric metadata and used for reranking value-oriented queries.

## Follow-Up Context

The chat UI preserves source wine IDs from prior recommendations. Follow-up questions such as “How can I use that wine in cooking?” resolve the prior wine ID first, then pass the verified wine record into the cooking/pairing tool path.

## Tool Provider

`lib/tools/food-provider.ts` implements a Spoonacular HTTP provider when `FOOD_API_KEY` is configured. If no key is present or the API fails, responses are marked as fallback:

```text
development-food-provider:fallback
spoonacular:real
spoonacular:unavailable
```

Fallback output is useful for local development but should not be described as verified external API data.

## Evaluation

Run the full non-Groq evaluation suite:

```bash
npm run evaluate
```

The runner starts a local Next server on `EVALUATION_PORT` (default `3100`), ingests the dataset, runs all 110 cases, prints summary metrics, and optionally writes `evaluation-report.json`.

Measured locally:

- routing accuracy
- Chroma retrieval rate
- Hit@k when expected IDs exist
- deterministic expected-attribute matching
- tool-call correctness
- source-support rate
- latency
- estimated baseline/RAG input tokens
- estimated token reduction

Token counts are deterministic estimates unless Groq is configured and provider-reported usage is available.

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/test-chroma.mjs
npm run evaluate
```

## Current Limitations

- Current public sheet yields 448 wines, not 500+.
- Groq live generation and provider-reported token usage require future `GROQ_API_KEY` validation.
- Spoonacular real API calls require `FOOD_API_KEY`; otherwise the provider is an explicit development fallback.
- The measured local token reduction is an estimate based on serialized prompt/context size, not a fabricated resume metric.
