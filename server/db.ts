import { PrismaClient } from '@prisma/client'

// Single shared PrismaClient instance. In serverless or test contexts,
// create a new instance per request/test instead of reusing this global.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/**
 * Runs a pgvector cosine similarity query against the wines table.
 * Returns up to `topK` rows ordered by distance ascending (closest first).
 * Falls back to an empty array when the embedding column has no indexed rows.
 */
export async function queryByEmbedding(
  embedding: number[],
  topK = 6,
): Promise<Array<{ id: string; distance: number }>> {
  const vector = `[${embedding.join(',')}]`
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
    `SELECT id, (embedding <=> $1::vector) AS distance
     FROM wines
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vector,
    topK,
  )
  return rows
}

/**
 * Returns true when at least one wine row has an embedding stored.
 * Used by the /recommend handler to choose between pgvector and fallback mode.
 */
export async function hasIndexedEmbeddings(): Promise<boolean> {
  const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM wines WHERE embedding IS NOT NULL LIMIT 1`,
  )
  return Number(count[0]?.count ?? 0) > 0
}
