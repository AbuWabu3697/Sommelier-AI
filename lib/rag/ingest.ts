import { loadWineDataset } from '@/lib/data/google-sheets'
import { upsertWinesToChroma } from '@/lib/rag/chroma'

export async function ingestWineDataset() {
  const startedAt = Date.now()
  const wines = await loadWineDataset()
  const result = await upsertWinesToChroma(wines)

  return {
    collection: result.collection,
    rowsLoaded: wines.length,
    rowsNormalized: wines.length,
    rowsIndexed: result.rowsIndexed,
    rowsSkipped: wines.length - result.rowsIndexed,
    collectionCount: result.collectionCount,
    indexedWineCount: result.indexedWineCount,
    failures: result.failures,
    durationMs: Date.now() - startedAt,
  }
}
