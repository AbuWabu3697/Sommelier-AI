import { normalizeWineRows } from '@/lib/data/normalize-wine'
import type { EnrichedWine } from '@/lib/rag/types'

const DEFAULT_PUBLIC_SHEET_ID = '1Bkv3Jb_8YuLUG2rWUhJhQBdaGjQCMFfwF9oJ5jrYDSA'

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }

  row.push(value)
  if (row.some((cell) => cell.trim())) rows.push(row)

  const headers = rows[0]?.map((header) => header.trim()) ?? []
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

export async function fetchWineRowsFromPublicSheet(sheetId = process.env.GOOGLE_SHEETS_ID || DEFAULT_PUBLIC_SHEET_ID): Promise<Array<Record<string, unknown>>> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`
  const response = await fetch(url, { next: { revalidate: 3600 } })
  if (!response.ok) throw new Error(`Google Sheets request failed: ${response.status}`)
  const text = await response.text()
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
  if (!jsonMatch) throw new Error('Failed to parse Google Sheets response')

  const data = JSON.parse(jsonMatch[1])
  const headers = data.table.cols.map((col: { label?: string }) => col.label || '')
  return data.table.rows.map((row: { c: Array<{ v: string | number | null } | null> }) => {
    const wine: Record<string, unknown> = {}
    row.c.forEach((cell, index) => {
      wine[headers[index] || `col${index}`] = cell?.v ?? ''
    })
    return wine
  })
}

export async function fetchWineRowsFromCsvUrl(url: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(url, { next: { revalidate: 3600 } })
  if (!response.ok) throw new Error(`CSV request failed: ${response.status}`)
  return parseCsv(await response.text())
}

export async function loadWineDataset(): Promise<EnrichedWine[]> {
  const jsonUrl = process.env.WINE_DATA_JSON_URL
  const csvUrl = process.env.WINE_DATA_CSV_URL

  if (jsonUrl) {
    const response = await fetch(jsonUrl, { next: { revalidate: 3600 } })
    if (!response.ok) throw new Error(`Wine JSON request failed: ${response.status}`)
    const data = await response.json()
    return normalizeWineRows(Array.isArray(data) ? data : data.wines ?? [])
  }

  if (csvUrl) {
    return normalizeWineRows(await fetchWineRowsFromCsvUrl(csvUrl))
  }

  return normalizeWineRows(await fetchWineRowsFromPublicSheet())
}
