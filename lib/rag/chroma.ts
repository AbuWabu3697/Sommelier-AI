import type { EnrichedWine, RetrievalFilters, RetrievalResult, WineMetadata } from '@/lib/rag/types'

const DEFAULT_COLLECTION = 'sommelier_wines'
const WINE_SOURCE = 'google_sheets'

type ChromaScalar = string | number | boolean
type ChromaWineMetadata = Record<string, ChromaScalar>
type ChromaQueryData = {
  ids?: string[][]
  documents?: string[][]
  distances?: number[][]
}

interface ChromaConnection {
  host: string
  port: number
  ssl: boolean
}

function getChromaConnection(): ChromaConnection {
  const rawUrl = process.env.CHROMA_URL || 'http://localhost:8000'

  try {
    const url = new URL(rawUrl)
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      ssl: url.protocol === 'https:',
    }
  } catch {
    const [host, port] = rawUrl.replace(/^https?:\/\//, '').split(':')
    return {
      host: host || 'localhost',
      port: Number(port || 8000),
      ssl: rawUrl.startsWith('https://'),
    }
  }
}

async function loadChromaModules(): Promise<{
  ChromaClient: new (args?: Record<string, unknown>) => any
  DefaultEmbeddingFunction: new () => any
}> {
  // Keep the embedding stack out of the Next/Turbopack bundle. It is a Node-only
  // runtime dependency for API routes and scripts.
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
  const [{ ChromaClient }, { DefaultEmbeddingFunction }] = await Promise.all([
    dynamicImport('chromadb'),
    dynamicImport('@chroma-core/default-embed'),
  ])
  return { ChromaClient, DefaultEmbeddingFunction }
}

async function getClient() {
  const { ChromaClient } = await loadChromaModules()
  const connection = getChromaConnection()
  return new ChromaClient({
    ...connection,
    tenant: process.env.CHROMA_TENANT || 'default_tenant',
    database: process.env.CHROMA_DATABASE || 'default_database',
    ...(process.env.CHROMA_API_KEY ? { headers: { Authorization: `Bearer ${process.env.CHROMA_API_KEY}` } } : {}),
  })
}

async function getEmbedder() {
  const { DefaultEmbeddingFunction } = await loadChromaModules()
  return new DefaultEmbeddingFunction()
}

export function getWineCollectionName(): string {
  return process.env.CHROMA_COLLECTION || DEFAULT_COLLECTION
}

export async function getWineCollection() {
  const client = await getClient()
  return client.getOrCreateCollection({
    name: getWineCollectionName(),
    embeddingFunction: await getEmbedder(),
    metadata: {
      description: 'Sommelier AI curated wine inventory',
      source: WINE_SOURCE,
    },
  })
}

function metadataValue(value: string | number | null): ChromaScalar | undefined {
  if (value === null) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function toChromaMetadata(metadata: WineMetadata): ChromaWineMetadata {
  const entries: Array<[string, ChromaScalar | undefined]> = [
    ['source', WINE_SOURCE],
    ['wineId', metadata.id],
    ['id', metadata.id],
    ['name', metadata.name],
    ['producer', metadata.producer],
    ['type', metadata.type],
    ['typeLower', metadata.type.toLowerCase()],
    ['grape', metadata.varietal],
    ['varietal', metadata.varietal],
    ['varietalLower', metadata.varietal.toLowerCase()],
    ['region', metadata.region],
    ['regionLower', metadata.region.toLowerCase()],
    ['country', metadata.country],
    ['countryLower', metadata.country.toLowerCase()],
    ['appellation', metadata.appellation],
    ['vintage', metadata.vintage],
    ['price', metadataValue(metadata.price)],
    ['professionalRating', metadataValue(metadata.averageRating)],
    ['averageRating', metadataValue(metadata.averageRating)],
    ['ratingCount', metadata.ratingCount],
    ['bestValueScore', metadataValue(metadata.bestValueScore)],
  ]

  return Object.fromEntries(
    entries
      .map(([key, value]) => [key, metadataValue(value as string | number | null)] as const)
      .filter((entry): entry is readonly [string, ChromaScalar] => entry[1] !== undefined),
  )
}

function sourceWhere(): Record<string, unknown> {
  return { source: { $eq: WINE_SOURCE } }
}

export async function upsertWinesToChroma(wines: EnrichedWine[]): Promise<{
  collection: string
  rowsIndexed: number
  collectionCount: number
  indexedWineCount: number
  failures: Array<{ id: string; message: string }>
}> {
  const collection = await getWineCollection()
  const batchSize = Number(process.env.CHROMA_INGEST_BATCH_SIZE || 100)
  const failures: Array<{ id: string; message: string }> = []
  let rowsIndexed = 0

  for (let index = 0; index < wines.length; index += batchSize) {
    const batch = wines.slice(index, index + batchSize)
    try {
      await collection.upsert({
        ids: batch.map((wine) => wine.id),
        documents: batch.map((wine) => wine.documentText),
        metadatas: batch.map((wine) => toChromaMetadata(wine.metadata)),
      })
      rowsIndexed += batch.length
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Chroma upsert error'
      failures.push(...batch.map((wine) => ({ id: wine.id, message })))
    }
  }

  const indexedWineRecords = await collection.get({ where: sourceWhere(), include: [] })

  return {
    collection: getWineCollectionName(),
    rowsIndexed,
    collectionCount: await collection.count(),
    indexedWineCount: indexedWineRecords.ids.length,
    failures,
  }
}

export function filterMatches(wine: EnrichedWine, filters: RetrievalFilters): boolean {
  if (filters.type && !wine.type.toLowerCase().includes(filters.type.toLowerCase())) return false
  if (filters.region && !wine.region.toLowerCase().includes(filters.region.toLowerCase())) return false
  if (filters.country && wine.country.toLowerCase() !== filters.country.toLowerCase()) return false
  if (filters.varietal && !wine.varietal.toLowerCase().includes(filters.varietal.toLowerCase())) return false
  if (filters.maxPrice !== undefined && (wine.retailPrice === null || wine.retailPrice > filters.maxPrice)) return false
  if (filters.minPrice !== undefined && (wine.retailPrice === null || wine.retailPrice < filters.minPrice)) return false
  if (filters.minRating !== undefined && (wine.avgCriticScore === null || wine.avgCriticScore < filters.minRating)) return false
  return true
}

function isValueQuery(query: string): boolean {
  return /\b(value|deal|bargain|bang for|quality.*price|high-value|high value|budget quality)\b/i.test(query)
}

function rerankResults(query: string, results: RetrievalResult[]): RetrievalResult[] {
  if (!isValueQuery(query)) return results
  return [...results].sort((a, b) => {
    const valueDelta = (b.wine.bestValueScore ?? 0) - (a.wine.bestValueScore ?? 0)
    if (Math.abs(valueDelta) > 5) return valueDelta
    return (b.similarity ?? 0) - (a.similarity ?? 0)
  })
}

export async function queryWineCollection(
  query: string,
  winesById: Map<string, EnrichedWine>,
  filters: RetrievalFilters = {},
  topK = Number(process.env.RAG_TOP_K || 6),
): Promise<RetrievalResult[]> {
  const collection = await getWineCollection()
  const candidateCount = Math.max(topK * 8, 40)
  const data = await collection.query({
    queryTexts: [query],
    nResults: candidateCount,
    where: sourceWhere(),
    include: ['documents', 'metadatas', 'distances'],
  }) as ChromaQueryData

  const ids: string[] = data.ids?.[0] ?? []
  const documents: string[] = data.documents?.[0] ?? []
  const distances: number[] = data.distances?.[0] ?? []

  const results = ids
    .map((id, index): RetrievalResult | null => {
      const wine = winesById.get(id)
      if (!wine) return null
      const distance = typeof distances[index] === 'number' ? distances[index] : null
      return {
        wine,
        document: documents[index] ?? wine.documentText,
        distance,
        similarity: distance === null ? null : 1 / (1 + Math.max(0, distance)),
      }
    })
    .filter((result): result is RetrievalResult => result !== null)
    .filter((result) => filterMatches(result.wine, filters))

  return rerankResults(query, results).slice(0, topK)
}
