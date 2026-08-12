import { loadWineDataset } from '@/lib/data/google-sheets'
import { filterMatches, queryWineCollection } from '@/lib/rag/chroma'
import type { EnrichedWine, RetrievalFilters, RetrievalResult } from '@/lib/rag/types'

function lexicalScore(query: string, wine: EnrichedWine): number {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2)
  const haystack = wine.documentText.toLowerCase()
  const semantic = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
  return semantic + (wine.bestValueScore ?? 0) / 50 + (wine.avgCriticScore ?? 0) / 100
}

export async function retrieveWines(
  query: string,
  filters: RetrievalFilters = {},
  topK = Number(process.env.RAG_TOP_K || 6),
): Promise<{ results: RetrievalResult[]; mode: 'chroma' | 'fallback'; error?: string }> {
  const dataset = await loadWineDataset()
  const byId = new Map(dataset.map((wine) => [wine.id, wine]))

  try {
    const results = await queryWineCollection(query, byId, filters, topK)
    if (results.length > 0) return { results, mode: 'chroma' }
    return { results, mode: 'chroma', error: 'Chroma returned no matching wine records.' }
  } catch (error) {
    const filtered = dataset.filter((wine) => filterMatches(wine, filters))
    const pool = filtered.length > 0 ? filtered : dataset
    const results = pool
      .map((wine) => ({ wine, score: lexicalScore(query, wine) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ wine, score }) => ({
        wine,
        document: wine.documentText,
        distance: null,
        similarity: Math.min(1, score / 12),
      }))

    return {
      results,
      mode: 'fallback',
      error: error instanceof Error ? error.message : 'Chroma retrieval failed',
    }
  }
}

export function formatRetrievedContext(results: RetrievalResult[]): string {
  if (results.length === 0) return 'No retrieved wine records.'
  return results.map((result, index) => {
    const wine = result.wine
    return [
      `Wine ${index + 1}`,
      `id: ${wine.id}`,
      `name: ${wine.name}`,
      `producer: ${wine.producer || 'unknown'}`,
      `type: ${wine.type || 'unknown'}`,
      `varietal: ${wine.varietal || 'unknown'}`,
      `origin: ${[wine.appellation || wine.region, wine.country].filter(Boolean).join(', ') || 'unknown'}`,
      `vintage: ${wine.vintage || 'unknown'}`,
      `price: ${wine.retailPrice !== null ? `$${wine.retailPrice.toFixed(2)}` : 'unknown'}`,
      `averageRating: ${wine.avgCriticScore?.toFixed(1) ?? 'unknown'}`,
      `bestValueScore: ${wine.bestValueScore?.toFixed(1) ?? 'unknown'}`,
      `distance: ${result.distance ?? 'unavailable'}`,
      `document: ${result.document}`,
    ].join('\n')
  }).join('\n\n')
}
