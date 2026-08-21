import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma, queryByEmbedding, hasIndexedEmbeddings } from '../db'

export const recommendRouter = Router()

const TOP_K = 6

const bodySchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(20).default(TOP_K),
  filters: z
    .object({
      type: z.string().optional(),
      country: z.string().optional(),
      varietal: z.string().optional(),
      maxPrice: z.number().optional(),
      minRating: z.number().optional(),
    })
    .optional()
    .default({}),
})

/**
 * Generates a 384-dimensional embedding for the given text using the same
 * @chroma-core/default-embed model used during ingestion. Returns null when
 * the package is unavailable (e.g. test environment without native deps).
 */
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const { DefaultEmbeddingFunction } = await import('@chroma-core/default-embed')
    const ef = new DefaultEmbeddingFunction()
    const [embedding] = await ef.generate([text])
    return embedding ?? null
  } catch {
    return null
  }
}

/**
 * POST /recommend
 *
 * Returns top-k=6 wine recommendations for a natural language query.
 * When pgvector embeddings are indexed, uses cosine similarity search.
 * Falls back to deterministic bestValueScore ranking when no embeddings
 * are present in the index.
 *
 * Body:
 *   query   (required) — natural language wine request
 *   topK    (default 6, max 20)
 *   filters — optional { type, country, varietal, maxPrice, minRating }
 *
 * Response:
 *   { recommendations: Wine[], mode: "pgvector" | "fallback", query: string }
 */
recommendRouter.post('/', async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { query, topK, filters } = parsed.data

  const where: Record<string, unknown> = {}
  if (filters.type) where.type = { contains: filters.type, mode: 'insensitive' }
  if (filters.country) where.country = { contains: filters.country, mode: 'insensitive' }
  if (filters.varietal) where.varietal = { contains: filters.varietal, mode: 'insensitive' }
  if (filters.maxPrice !== undefined) where.price = { lte: filters.maxPrice }
  if (filters.minRating !== undefined) where.avgCriticScore = { gte: filters.minRating }

  try {
    const indexed = await hasIndexedEmbeddings()

    if (indexed) {
      const embedding = await embedQuery(query)

      if (embedding) {
        const hits = await queryByEmbedding(embedding, topK * 4)
        const hitIds = hits.map((h) => h.id)
        const distanceById = new Map(hits.map((h) => [h.id, h.distance]))

        const wines = await prisma.wine.findMany({
          where: { id: { in: hitIds }, ...where },
          select: {
            id: true,
            name: true,
            producer: true,
            varietal: true,
            region: true,
            country: true,
            vintage: true,
            price: true,
            type: true,
            description: true,
            tastingNotes: true,
            foodPairing: true,
            avgCriticScore: true,
            bestValueScore: true,
          },
        })

        // Re-order by vector distance (ascending) to preserve semantic ranking
        const ordered = hitIds
          .map((id) => wines.find((w) => w.id === id))
          .filter((w): w is NonNullable<typeof w> => w !== undefined)
          .slice(0, topK)
          .map((w) => ({ ...w, distance: distanceById.get(w.id) ?? null }))

        res.json({ recommendations: ordered, mode: 'pgvector', query })
        return
      }
    }

    // Deterministic fallback — rank by bestValueScore then avgCriticScore
    const wines = await prisma.wine.findMany({
      where,
      take: topK,
      orderBy: [{ bestValueScore: 'desc' }, { avgCriticScore: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        producer: true,
        varietal: true,
        region: true,
        country: true,
        vintage: true,
        price: true,
        type: true,
        description: true,
        tastingNotes: true,
        foodPairing: true,
        avgCriticScore: true,
        bestValueScore: true,
      },
    })

    res.json({ recommendations: wines, mode: 'fallback', query })
  } catch (err) {
    console.error('[POST /recommend]', err)
    res.status(500).json({ error: 'Recommendation query failed' })
  }
})
