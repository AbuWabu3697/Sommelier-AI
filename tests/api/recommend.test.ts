import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../server/app'

// Mock the db module so tests don't need a live Postgres connection
vi.mock('../../server/db', () => ({
  prisma: {
    wine: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  queryByEmbedding: vi.fn(),
  hasIndexedEmbeddings: vi.fn(),
}))

// Mock the embedding function — no native deps in test
vi.mock('@chroma-core/default-embed', () => ({
  DefaultEmbeddingFunction: class {
    async generate(_texts: string[]) {
      return [new Array(384).fill(0.1)]
    }
  },
}))

import { prisma, queryByEmbedding, hasIndexedEmbeddings } from '../../server/db'

const mockPrisma = prisma as unknown as {
  wine: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}
const mockQueryByEmbedding = queryByEmbedding as ReturnType<typeof vi.fn>
const mockHasIndexed = hasIndexedEmbeddings as ReturnType<typeof vi.fn>

const SAMPLE_WINES = [
  {
    id: 'wine-001',
    name: 'Chateau Margaux',
    producer: 'Chateau Margaux',
    varietal: 'Cabernet Sauvignon',
    region: 'Bordeaux',
    country: 'France',
    vintage: '2018',
    price: 120,
    type: 'Red',
    description: 'Full-bodied Bordeaux blend',
    tastingNotes: 'Dark fruit, cedar, tobacco',
    foodPairing: 'Lamb, beef',
    avgCriticScore: 96,
    bestValueScore: 72.4,
  },
  {
    id: 'wine-002',
    name: 'Opus One',
    producer: 'Opus One Winery',
    varietal: 'Cabernet Sauvignon',
    region: 'Napa Valley',
    country: 'USA',
    vintage: '2019',
    price: 280,
    type: 'Red',
    description: 'Napa Valley Bordeaux-style blend',
    tastingNotes: 'Blackberry, cassis, graphite',
    foodPairing: 'Prime rib, venison',
    avgCriticScore: 98,
    bestValueScore: 61.2,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /recommend', () => {
  const app = createApp()

  it('returns 400 when query is missing', async () => {
    const res = await request(app).post('/recommend').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when query is empty string', async () => {
    const res = await request(app).post('/recommend').send({ query: '' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  describe('pgvector path', () => {
    it('returns top-k=6 recommendations using pgvector when embeddings are indexed', async () => {
      mockHasIndexed.mockResolvedValue(true)
      mockQueryByEmbedding.mockResolvedValue([
        { id: 'wine-001', distance: 0.12 },
        { id: 'wine-002', distance: 0.21 },
      ])
      mockPrisma.wine.findMany.mockResolvedValue(SAMPLE_WINES)

      const res = await request(app)
        .post('/recommend')
        .send({ query: 'bold red wine for a dinner party', topK: 6 })

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('pgvector')
      expect(res.body.query).toBe('bold red wine for a dinner party')
      expect(Array.isArray(res.body.recommendations)).toBe(true)
    })

    it('includes distance in pgvector results', async () => {
      mockHasIndexed.mockResolvedValue(true)
      mockQueryByEmbedding.mockResolvedValue([{ id: 'wine-001', distance: 0.12 }])
      mockPrisma.wine.findMany.mockResolvedValue([SAMPLE_WINES[0]])

      const res = await request(app)
        .post('/recommend')
        .send({ query: 'crisp white', topK: 6 })

      expect(res.status).toBe(200)
      expect(res.body.recommendations[0]).toHaveProperty('distance', 0.12)
    })
  })

  describe('deterministic fallback path', () => {
    it('uses fallback mode when no embeddings are indexed', async () => {
      mockHasIndexed.mockResolvedValue(false)
      mockPrisma.wine.findMany.mockResolvedValue(SAMPLE_WINES)

      const res = await request(app)
        .post('/recommend')
        .send({ query: 'something red and smooth' })

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('fallback')
      expect(res.body.recommendations).toHaveLength(2)
    })

    it('fallback applies filters from the request body', async () => {
      mockHasIndexed.mockResolvedValue(false)
      mockPrisma.wine.findMany.mockResolvedValue([SAMPLE_WINES[0]])

      const res = await request(app)
        .post('/recommend')
        .send({ query: 'red wine', filters: { country: 'France', maxPrice: 150 } })

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('fallback')
      // Prisma should have been called with price and country filters
      expect(mockPrisma.wine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { lte: 150 },
            country: { contains: 'France', mode: 'insensitive' },
          }),
        }),
      )
    })

    it('returns an empty recommendations array when no wines match filters', async () => {
      mockHasIndexed.mockResolvedValue(false)
      mockPrisma.wine.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/recommend')
        .send({ query: 'orange wine', filters: { type: 'Orange' } })

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('fallback')
      expect(res.body.recommendations).toHaveLength(0)
    })
  })
})
