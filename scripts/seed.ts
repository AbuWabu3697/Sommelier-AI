/**
 * Seed script: ingests wine records from the Google Sheets source into Postgres.
 *
 * Run after `prisma db push` or a migration:
 *   npm run db:seed
 *
 * The script normalizes each row using the same pipeline as the ChromaDB ingestor
 * (normalizeWineRows from lib/data/normalize-wine.ts), then upserts into the
 * wines table via Prisma. Existing rows are updated in-place (upsert on id).
 *
 * Embeddings are not generated here — run a separate embedding pass to populate
 * the pgvector column after seeding.
 */

import { PrismaClient } from '@prisma/client'
import { normalizeWineRows } from '../lib/data/normalize-wine'

const prisma = new PrismaClient()

const DEFAULT_SHEET_ID = '1Bkv3Jb_8YuLUG2rWUhJhQBdaGjQCMFfwF9oJ5jrYDSA'

async function fetchSheetRows(sheetId: string): Promise<Array<Record<string, unknown>>> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Google Sheets request failed: ${response.status}`)
  const text = await response.text()
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
  if (!jsonMatch) throw new Error('Failed to parse Google Sheets response')

  const data = JSON.parse(jsonMatch[1]) as {
    table: {
      cols: Array<{ label?: string }>
      rows: Array<{ c: Array<{ v: string | number | null } | null> }>
    }
  }

  const headers = data.table.cols.map((col) => col.label ?? '')
  return data.table.rows.map((row) => {
    const wine: Record<string, unknown> = {}
    row.c.forEach((cell, index) => {
      wine[headers[index] ?? `col${index}`] = cell?.v ?? ''
    })
    return wine
  })
}

async function seed() {
  const sheetId = process.env.GOOGLE_SHEETS_ID ?? DEFAULT_SHEET_ID
  console.log(`[seed] fetching wine rows from sheet ${sheetId}`)

  const rawRows = await fetchSheetRows(sheetId)
  const wines = normalizeWineRows(rawRows)
  console.log(`[seed] normalized ${wines.length} wine records`)

  let upserted = 0
  let failed = 0

  for (const wine of wines) {
    try {
      await prisma.wine.upsert({
        where: { id: wine.id },
        create: {
          id: wine.id,
          name: wine.name,
          producer: wine.producer ?? '',
          varietal: wine.varietal ?? '',
          region: wine.region ?? '',
          country: wine.country ?? '',
          appellation: wine.appellation ?? '',
          vintage: wine.vintage ?? '',
          price: wine.retailPrice ?? null,
          type: wine.type ?? '',
          abv: wine.abv ?? '',
          description: wine.description ?? '',
          tastingNotes: wine.tasting_notes ?? '',
          body: wine.body ?? '',
          sweetness: wine.sweetness ?? '',
          acidity: wine.acidity ?? '',
          foodPairing: wine.food_pairing ?? '',
          imageUrl: wine.image_url ?? '',
          referenceUrl: wine.reference_url ?? '',
          avgCriticScore: wine.avgCriticScore ?? null,
          bestValueScore: wine.bestValueScore ?? null,
          ratingCount: wine.ratingCount ?? 0,
          documentText: wine.documentText ?? '',
        },
        update: {
          name: wine.name,
          producer: wine.producer ?? '',
          varietal: wine.varietal ?? '',
          region: wine.region ?? '',
          country: wine.country ?? '',
          appellation: wine.appellation ?? '',
          vintage: wine.vintage ?? '',
          price: wine.retailPrice ?? null,
          type: wine.type ?? '',
          abv: wine.abv ?? '',
          description: wine.description ?? '',
          tastingNotes: wine.tasting_notes ?? '',
          body: wine.body ?? '',
          sweetness: wine.sweetness ?? '',
          acidity: wine.acidity ?? '',
          foodPairing: wine.food_pairing ?? '',
          imageUrl: wine.image_url ?? '',
          referenceUrl: wine.reference_url ?? '',
          avgCriticScore: wine.avgCriticScore ?? null,
          bestValueScore: wine.bestValueScore ?? null,
          ratingCount: wine.ratingCount ?? 0,
          documentText: wine.documentText ?? '',
        },
      })
      upserted++
    } catch (err) {
      console.error(`[seed] failed to upsert wine ${wine.id}:`, err)
      failed++
    }
  }

  console.log(`[seed] done — ${upserted} upserted, ${failed} failed`)
  await prisma.$disconnect()
}

seed().catch((err) => {
  console.error('[seed] fatal:', err)
  process.exit(1)
})
