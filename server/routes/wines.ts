import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db'

export const winesRouter = Router()

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  country: z.string().optional(),
  varietal: z.string().optional(),
  maxPrice: z.coerce.number().optional(),
})

/**
 * GET /wines
 *
 * Returns paginated wine rows from Postgres.
 *
 * Query params:
 *   page     (default 1)
 *   limit    (default 20, max 100)
 *   type     filter by wine type (partial, case-insensitive)
 *   country  filter by country (partial, case-insensitive)
 *   varietal filter by varietal (partial, case-insensitive)
 *   maxPrice filter by price <= maxPrice
 *
 * Response:
 *   { wines: Wine[], total: number, page: number, limit: number, totalPages: number }
 */
winesRouter.get('/', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() })
    return
  }

  const { page, limit, type, country, varietal, maxPrice } = parsed.data
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}

  if (type) {
    where.type = { contains: type, mode: 'insensitive' }
  }
  if (country) {
    where.country = { contains: country, mode: 'insensitive' }
  }
  if (varietal) {
    where.varietal = { contains: varietal, mode: 'insensitive' }
  }
  if (maxPrice !== undefined) {
    where.price = { lte: maxPrice }
  }

  try {
    const [wines, total] = await Promise.all([
      prisma.wine.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ bestValueScore: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          producer: true,
          varietal: true,
          region: true,
          country: true,
          appellation: true,
          vintage: true,
          price: true,
          type: true,
          abv: true,
          description: true,
          tastingNotes: true,
          body: true,
          sweetness: true,
          acidity: true,
          foodPairing: true,
          imageUrl: true,
          referenceUrl: true,
          avgCriticScore: true,
          bestValueScore: true,
          ratingCount: true,
        },
      }),
      prisma.wine.count({ where }),
    ])

    res.json({
      wines,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('[GET /wines]', err)
    res.status(500).json({ error: 'Database query failed' })
  }
})
