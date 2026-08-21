import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db'

export const searchRouter = Router()

const querySchema = z.object({
  q: z.string().min(1),
  type: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  varietal: z.string().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * GET /search
 *
 * Full-text search across wine name, producer, and description fields,
 * with optional structured filters applied in Postgres.
 *
 * Query params:
 *   q         (required) — search term matched against name, producer, description
 *   type      filter by wine type (partial, case-insensitive)
 *   region    filter by region (partial, case-insensitive)
 *   country   filter by country (partial, case-insensitive)
 *   varietal  filter by varietal (partial, case-insensitive)
 *   maxPrice  filter by price <= maxPrice
 *   minRating filter by avgCriticScore >= minRating
 *   limit     (default 20, max 50)
 *
 * Response:
 *   { results: Wine[], total: number, query: string }
 */
searchRouter.get('/', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() })
    return
  }

  const { q, type, region, country, varietal, maxPrice, minRating, limit } = parsed.data

  const textFilter = {
    OR: [
      { name: { contains: q, mode: 'insensitive' as const } },
      { producer: { contains: q, mode: 'insensitive' as const } },
      { description: { contains: q, mode: 'insensitive' as const } },
      { varietal: { contains: q, mode: 'insensitive' as const } },
      { region: { contains: q, mode: 'insensitive' as const } },
    ],
  }

  const where: Record<string, unknown> = { ...textFilter }

  if (type) where.type = { contains: type, mode: 'insensitive' }
  if (region) where.region = { contains: region, mode: 'insensitive' }
  if (country) where.country = { contains: country, mode: 'insensitive' }
  if (varietal) where.varietal = { contains: varietal, mode: 'insensitive' }
  if (maxPrice !== undefined) where.price = { lte: maxPrice }
  if (minRating !== undefined) where.avgCriticScore = { gte: minRating }

  try {
    const [results, total] = await Promise.all([
      prisma.wine.findMany({
        where,
        take: limit,
        orderBy: [{ bestValueScore: 'desc' }, { name: 'asc' }],
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
          avgCriticScore: true,
          bestValueScore: true,
          imageUrl: true,
        },
      }),
      prisma.wine.count({ where }),
    ])

    res.json({ results, total, query: q })
  } catch (err) {
    console.error('[GET /search]', err)
    res.status(500).json({ error: 'Search query failed' })
  }
})
