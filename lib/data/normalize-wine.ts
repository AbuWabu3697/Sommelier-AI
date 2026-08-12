import type { EnrichedWine, ProfessionalRating, WineMetadata, WineRecord } from '@/lib/rag/types'

export interface ValueScoreConfig {
  ratingWeight: number
  priceWeight: number
  pricePivot: number
  minimumUsefulRating: number
}

export const defaultValueScoreConfig: ValueScoreConfig = {
  ratingWeight: 0.72,
  priceWeight: 0.28,
  pricePivot: 60,
  minimumUsefulRating: 82,
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function parsePrice(price: string): number | null {
  const parsed = Number.parseFloat(price.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeRating(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0
  return (score / maxScore) * 100
}

export function parseRatings(value: unknown): ProfessionalRating[] {
  if (Array.isArray(value)) {
    return value
      .map((rating) => ({
        source: asString(rating?.source),
        score: Number(rating?.score),
        max_score: Number(rating?.max_score || 100),
        note: asString(rating?.note),
      }))
      .filter((rating) => Number.isFinite(rating.score) && Number.isFinite(rating.max_score))
  }

  const text = asString(value)
  if (!text) return []

  try {
    return parseRatings(JSON.parse(text))
  } catch {
    const numberMatch = text.match(/(\d{2,3})(?:\s*\/\s*(\d{2,3}))?/)
    if (!numberMatch) return []
    return [{
      source: 'Imported rating',
      score: Number(numberMatch[1]),
      max_score: numberMatch[2] ? Number(numberMatch[2]) : 100,
      note: text,
    }]
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function field(row: Record<string, unknown>, names: string[]): string {
  const match = names.find((name) => row[name] !== undefined)
  return match ? asString(row[match]) : ''
}

export function normalizeWineRow(row: Record<string, unknown>, index = 0): WineRecord | null {
  const normalizedKeys = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, '_'), value]),
  )

  const name = field(normalizedKeys, ['name', 'wine_name', 'title'])
  if (!name) return null

  const producer = field(normalizedKeys, ['producer', 'winery', 'brand'])
  const varietal = field(normalizedKeys, ['varietal', 'variety', 'grape'])
  const region = field(normalizedKeys, ['region'])
  const country = field(normalizedKeys, ['country'])
  const vintage = field(normalizedKeys, ['vintage', 'year'])
  const id = field(normalizedKeys, ['id', 'wine_id', 'sku']) || slugify([producer, name, vintage || index].filter(Boolean).join('-'))

  return {
    id,
    name,
    producer,
    varietal,
    region,
    country,
    appellation: field(normalizedKeys, ['appellation', 'ava']),
    vintage,
    price: field(normalizedKeys, ['retail', 'price', 'retail_price']),
    type: field(normalizedKeys, ['color', 'type', 'wine_type']),
    abv: field(normalizedKeys, ['abv', 'alcohol']),
    volume_ml: field(normalizedKeys, ['volume_ml', 'size_ml', 'bottle_size']),
    image_url: field(normalizedKeys, ['image_url', 'image', 'label_image']),
    reference_url: field(normalizedKeys, ['reference_url', 'url', 'product_url']),
    description: field(normalizedKeys, ['description', 'summary']),
    tasting_notes: field(normalizedKeys, ['tasting_notes', 'notes', 'note']),
    body: field(normalizedKeys, ['body']),
    sweetness: field(normalizedKeys, ['sweetness']),
    acidity: field(normalizedKeys, ['acidity']),
    food_pairing: field(normalizedKeys, ['food_pairing', 'pairing', 'pairings']),
    professional_ratings: parseRatings(normalizedKeys.professional_ratings ?? normalizedKeys.rating ?? normalizedKeys.ratings),
  }
}

function getPriceBand(price: number | null): EnrichedWine['priceBand'] {
  if (price === null) return null
  if (price < 25) return 'budget'
  if (price < 60) return 'mid'
  if (price < 120) return 'premium'
  return 'luxury'
}

export function calculateBestValueScore(
  averageRating: number | null,
  price: number | null,
  config: ValueScoreConfig = defaultValueScoreConfig,
): number | null {
  if (averageRating === null || price === null || price <= 0) return null

  const ratingComponent = Math.max(0, Math.min(1, (averageRating - config.minimumUsefulRating) / (100 - config.minimumUsefulRating)))
  const priceComponent = 1 / (1 + Math.max(0, price - 10) / config.pricePivot)
  return Math.round((ratingComponent * config.ratingWeight + priceComponent * config.priceWeight) * 1000) / 10
}

export function buildWineDocument(wine: WineRecord): string {
  const parts = [
    `${wine.name}${wine.producer ? ` by ${wine.producer}` : ''}`,
    wine.varietal || wine.type ? `is a ${[wine.varietal, wine.type].filter(Boolean).join(' ')}` : '',
    wine.vintage ? `from vintage ${wine.vintage}` : '',
    wine.region || wine.country ? `from ${[wine.appellation || wine.region, wine.country].filter(Boolean).join(', ')}` : '',
    wine.price ? `priced at ${wine.price}` : '',
    wine.description,
    wine.tasting_notes ? `Tasting notes: ${wine.tasting_notes}` : '',
    wine.body ? `Body: ${wine.body}` : '',
    wine.sweetness ? `Sweetness: ${wine.sweetness}` : '',
    wine.acidity ? `Acidity: ${wine.acidity}` : '',
    wine.food_pairing ? `Food pairing: ${wine.food_pairing}` : '',
  ].filter(Boolean)

  return `${parts.join('. ')}.`
}

export function enrichWine(wine: WineRecord, config: ValueScoreConfig = defaultValueScoreConfig): EnrichedWine {
  const retailPrice = parsePrice(wine.price)
  const normalizedScores = wine.professional_ratings
    .map((rating) => normalizeRating(rating.score, rating.max_score))
    .filter((score) => score > 0)
  const ratingCount = normalizedScores.length
  const avgCriticScore = ratingCount > 0
    ? normalizedScores.reduce((sum, score) => sum + score, 0) / ratingCount
    : null
  const maxCriticScore = ratingCount > 0 ? Math.max(...normalizedScores) : null
  const bestValueScore = calculateBestValueScore(avgCriticScore, retailPrice, config)
  const rawValueScore = bestValueScore

  let giftScore: number | null = null
  if (retailPrice !== null) {
    giftScore = (avgCriticScore ?? 72) * 0.58 + Math.min(ratingCount, 4) * 4
    if (retailPrice >= 30 && retailPrice <= 120) giftScore += 18
    else if (retailPrice > 120) giftScore += 8
    if (/champagne|burgundy|bordeaux|barolo|napa|reserve|brut|sparkling/i.test([
      wine.region,
      wine.appellation,
      wine.country,
      wine.producer,
      wine.type,
    ].join(' '))) {
      giftScore += 10
    }
  }

  const documentText = buildWineDocument(wine)
  const metadata: WineMetadata = {
    id: wine.id,
    source: 'google_sheets',
    name: wine.name,
    producer: wine.producer,
    varietal: wine.varietal,
    region: wine.region,
    country: wine.country,
    appellation: wine.appellation,
    vintage: wine.vintage,
    type: wine.type,
    price: retailPrice,
    averageRating: avgCriticScore,
    ratingCount,
    bestValueScore,
  }

  return {
    ...wine,
    retailPrice,
    avgCriticScore,
    maxCriticScore,
    ratingCount,
    rawValueScore,
    bestValueScore,
    giftScore,
    priceBand: getPriceBand(retailPrice),
    documentText,
    metadata,
  }
}

export function normalizeWineRows(rows: Array<Record<string, unknown>>): EnrichedWine[] {
  return rows
    .map((row, index) => normalizeWineRow(row, index))
    .filter((wine): wine is WineRecord => wine !== null)
    .map((wine) => enrichWine(wine))
}
