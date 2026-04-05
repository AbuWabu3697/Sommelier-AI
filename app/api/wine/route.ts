import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'

export const maxDuration = 30

interface WineData {
  id: string
  name: string
  producer: string
  varietal: string
  region: string
  country: string
  appellation: string
  vintage: string
  price: string
  type: string
  abv: string
  volume_ml: string
  image_url: string
  reference_url: string
  professional_ratings: Array<{
    source: string
    score: number
    max_score: number
    note: string
  }>
}

interface EnrichedWine extends WineData {
  retailPrice: number | null
  avgCriticScore: number | null
  maxCriticScore: number | null
  ratingCount: number
  rawValueScore: number | null
  valueScore: number | null
  giftScore: number | null
  priceBand: 'budget' | 'mid' | 'premium' | 'luxury' | null
}

interface QueryIntent {
  wantsBestRated: boolean
  wantsValue: boolean
  wantsGift: boolean
  wantsBudget: boolean
  wantsPremium: boolean
  requestedColor: 'red' | 'white' | 'rose' | null
  maxPrice: number | null
  minPrice: number | null
  countries: string[]
  regions: string[]
  appellations: string[]
  varietals: string[]
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

interface ScoreVisual {
  label: string
  value: string
  percent: number
}

interface NearMiss {
  name: string
  reason: string
}

interface RecommendationCard {
  id: string
  name: string
  producer: string
  varietal: string
  type: string
  region: string
  country: string
  appellation: string
  vintage: string
  imageUrl: string
  referenceUrl: string
  priceText: string
  ratingText: string
  summary: string
  whyChosen: string[]
  scoreBreakdown: Array<{
    label: string
    value: string
  }>
  scoreVisuals: ScoreVisual[]
  whyNotThese: NearMiss[]
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function selectVariant<T>(question: string, variants: T[]): T {
  return variants[hashString(question) % variants.length]
}

function parsePrice(price: string): number | null {
  const parsed = Number.parseFloat(price.replace(/[^0-9.]/g, ''))
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeScore(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return 0
  }

  return (score / maxScore) * 100
}

function getPriceBand(price: number | null): EnrichedWine['priceBand'] {
  if (price === null) return null
  if (price < 25) return 'budget'
  if (price < 60) return 'mid'
  if (price < 120) return 'premium'
  return 'luxury'
}

function enrichWine(wine: WineData): EnrichedWine {
  const retailPrice = parsePrice(wine.price)
  const normalizedScores = wine.professional_ratings
    .map((rating) => normalizeScore(rating.score, rating.max_score))
    .filter((score) => score > 0)

  const ratingCount = normalizedScores.length
  const avgCriticScore = ratingCount > 0
    ? normalizedScores.reduce((sum, score) => sum + score, 0) / ratingCount
    : null
  const maxCriticScore = ratingCount > 0 ? Math.max(...normalizedScores) : null

  const rawValueScore = retailPrice && avgCriticScore
    ? (avgCriticScore * Math.log1p(ratingCount + 1)) / retailPrice
    : null

  let giftScore: number | null = null
  if (retailPrice !== null) {
    giftScore = 0
    if (avgCriticScore !== null) giftScore += avgCriticScore * 0.6
    giftScore += Math.min(ratingCount, 4) * 4

    if (retailPrice >= 30 && retailPrice <= 120) giftScore += 18
    else if (retailPrice > 120) giftScore += 8

    const prestigeText = [
      wine.region,
      wine.appellation,
      wine.country,
      wine.producer,
      wine.type,
    ].join(' ').toLowerCase()

    if (/champagne|burgundy|bordeaux|barolo|napa|reserve|brut|sparkling/.test(prestigeText)) {
      giftScore += 10
    }
  }

  return {
    ...wine,
    retailPrice,
    avgCriticScore,
    maxCriticScore,
    ratingCount,
    rawValueScore,
    valueScore: rawValueScore,
    giftScore,
    priceBand: getPriceBand(retailPrice),
  }
}

function normalizeValueScores(wines: EnrichedWine[]): EnrichedWine[] {
  const maxRawValueScore = wines.reduce((max, wine) => {
    return wine.rawValueScore !== null ? Math.max(max, wine.rawValueScore) : max
  }, 0)

  if (maxRawValueScore <= 0) {
    return wines.map((wine) => ({
      ...wine,
      valueScore: null,
    }))
  }

  return wines.map((wine) => ({
    ...wine,
    valueScore: wine.rawValueScore !== null
      ? (wine.rawValueScore / maxRawValueScore) * 100
      : null,
  }))
}

function extractPreferenceMatches(questionLower: string, values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .filter((value) => questionLower.includes(value.toLowerCase()))
}

function extractIntent(question: string, wines: WineData[]): QueryIntent {
  const questionLower = question.toLowerCase()
  const underMatch = questionLower.match(/under\s*\$?\s*(\d+)/)
  const overMatch = questionLower.match(/(?:over|above)\s*\$?\s*(\d+)/)

  let requestedColor: QueryIntent['requestedColor'] = null
  if (questionLower.includes('red')) requestedColor = 'red'
  if (questionLower.includes('white')) requestedColor = 'white'
  if (questionLower.includes('rose') || questionLower.includes('rosé')) requestedColor = 'rose'

  return {
    wantsBestRated: /best|top|highest rated|best-rated|strongest critic/.test(questionLower),
    wantsValue: /value|worth|bang for the buck|budget-friendly|affordable/.test(questionLower),
    wantsGift: /gift|housewarming|dinner party|bring to dinner|host|special occasion/.test(questionLower),
    wantsBudget: /cheap|budget|affordable|under\s*\$?\d+/.test(questionLower),
    wantsPremium: /premium|luxury|special occasion|collector|splurge|expensive/.test(questionLower),
    requestedColor,
    maxPrice: underMatch ? Number.parseFloat(underMatch[1]) : null,
    minPrice: overMatch ? Number.parseFloat(overMatch[1]) : null,
    countries: extractPreferenceMatches(questionLower, wines.map((wine) => wine.country)),
    regions: extractPreferenceMatches(questionLower, wines.map((wine) => wine.region)),
    appellations: extractPreferenceMatches(questionLower, wines.map((wine) => wine.appellation)),
    varietals: extractPreferenceMatches(questionLower, wines.map((wine) => wine.varietal)),
  }
}

function findLastUserQuestion(history: ConversationTurn[]): string | null {
  const lastUserTurn = [...history].reverse().find((turn) => turn.role === 'user' && turn.text.trim())
  return lastUserTurn?.text ?? null
}

function mergeIntentWithHistory(currentIntent: QueryIntent, previousIntent: QueryIntent | null, question: string): QueryIntent {
  if (!previousIntent) return currentIntent
  if (/start over|ignore that|anything is fine|open to anything|no preference|new search/i.test(question)) {
    return currentIntent
  }

  return {
    wantsBestRated: currentIntent.wantsBestRated || previousIntent.wantsBestRated,
    wantsValue: currentIntent.wantsValue || previousIntent.wantsValue,
    wantsGift: currentIntent.wantsGift || previousIntent.wantsGift,
    wantsBudget: currentIntent.wantsBudget || previousIntent.wantsBudget,
    wantsPremium: currentIntent.wantsPremium || previousIntent.wantsPremium,
    requestedColor: currentIntent.requestedColor ?? previousIntent.requestedColor,
    maxPrice: currentIntent.maxPrice ?? previousIntent.maxPrice,
    minPrice: currentIntent.minPrice ?? previousIntent.minPrice,
    countries: currentIntent.countries.length > 0 ? currentIntent.countries : previousIntent.countries,
    regions: currentIntent.regions.length > 0 ? currentIntent.regions : previousIntent.regions,
    appellations: currentIntent.appellations.length > 0 ? currentIntent.appellations : previousIntent.appellations,
    varietals: currentIntent.varietals.length > 0 ? currentIntent.varietals : previousIntent.varietals,
  }
}

function buildConversationContext(history: ConversationTurn[]): string {
  const recentTurns = history.slice(-6)
  if (recentTurns.length === 0) return 'No prior conversation.'

  return recentTurns
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
}


function scoreWineForQuery(wine: EnrichedWine, question: string, intent: QueryIntent): number {
  const questionLower = question.toLowerCase()
  const keywords = questionLower.split(/\s+/).filter((word) => word.length > 2)
  const searchableText = [
    wine.name,
    wine.producer,
    wine.varietal,
    wine.region,
    wine.country,
    wine.appellation,
    wine.type,
    wine.vintage,
    wine.priceBand ?? '',
  ].join(' ').toLowerCase()

  let score = 0

  keywords.forEach((keyword) => {
    if (searchableText.includes(keyword)) score += 2
  })

  if (intent.requestedColor && wine.type.toLowerCase().includes(intent.requestedColor)) score += 8
  if (intent.countries.some((country) => wine.country.toLowerCase() === country.toLowerCase())) score += 7
  if (intent.regions.some((region) => wine.region.toLowerCase().includes(region.toLowerCase()))) score += 7
  if (intent.appellations.some((appellation) => wine.appellation.toLowerCase().includes(appellation.toLowerCase()))) score += 7
  if (intent.varietals.some((varietal) => wine.varietal.toLowerCase().includes(varietal.toLowerCase()))) score += 7

  if (intent.maxPrice !== null && wine.retailPrice !== null) {
    score += wine.retailPrice <= intent.maxPrice ? 10 : -30
  }

  if (intent.minPrice !== null && wine.retailPrice !== null) {
    score += wine.retailPrice >= intent.minPrice ? 6 : -10
  }

  if (intent.wantsBudget && wine.priceBand === 'budget') score += 8
  if (intent.wantsPremium && (wine.priceBand === 'premium' || wine.priceBand === 'luxury')) score += 8
  if (intent.wantsBestRated && wine.avgCriticScore !== null) score += wine.avgCriticScore / 10
  if (intent.wantsValue && wine.valueScore !== null) score += wine.valueScore / 10
  if (intent.wantsGift && wine.giftScore !== null) score += wine.giftScore / 8

  if (!intent.wantsValue && wine.avgCriticScore !== null) score += wine.avgCriticScore / 20
  if (wine.ratingCount > 0) score += Math.min(wine.ratingCount, 3)

  return score
}

function formatPriceText(wine: EnrichedWine): string {
  return wine.retailPrice !== null ? `$${wine.retailPrice.toFixed(0)}` : 'Price unavailable'
}

function formatRatingText(wine: EnrichedWine): string {
  if (wine.avgCriticScore !== null) {
    return `${wine.avgCriticScore.toFixed(1)} avg critic score`
  }

  const topRating = wine.professional_ratings[0]
  return topRating ? `${topRating.score}/${topRating.max_score}` : 'No critic ratings'
}

function formatWineReason(wine: EnrichedWine, intent: QueryIntent): string {
  const details: string[] = [formatPriceText(wine)]

  if (wine.avgCriticScore !== null) details.push(`${wine.avgCriticScore.toFixed(1)} avg critic score`)
  if (intent.wantsValue && wine.valueScore !== null) details.push(`value score ${wine.valueScore.toFixed(0)}/100`)
  if (intent.wantsGift && wine.giftScore !== null) details.push(`gift score ${wine.giftScore.toFixed(1)}`)

  const origin = [wine.region, wine.country].filter(Boolean).join(', ')
  return `${wine.name}${wine.varietal ? ` (${wine.varietal})` : ''}${origin ? ` from ${origin}` : ''} - ${details.join(', ')}`
}

function buildWhyChosen(wine: EnrichedWine, intent: QueryIntent): string[] {
  const reasons: string[] = []

  if (wine.avgCriticScore !== null) {
    reasons.push(`Critic average is ${wine.avgCriticScore.toFixed(1)} across ${wine.ratingCount} rating${wine.ratingCount === 1 ? '' : 's'}.`)
  }

  if (wine.retailPrice !== null) {
    reasons.push(`Retail price sits at ${formatPriceText(wine)} in the ${wine.priceBand ?? 'unclassified'} tier.`)
  }

  if (intent.wantsValue && wine.valueScore !== null) {
    reasons.push(`Its value score is ${wine.valueScore.toFixed(0)} out of 100, reflecting stronger quality per dollar than most bottles in the inventory.`)
  }

  if (intent.wantsGift && wine.giftScore !== null) {
    reasons.push(`Its gift score is ${wine.giftScore.toFixed(1)}, helped by critic support and presentation-friendly pricing.`)
  }

  if (wine.region || wine.country) {
    reasons.push(`It stays aligned with the requested origin: ${[wine.region, wine.country].filter(Boolean).join(', ')}.`)
  }

  if (wine.varietal || wine.type) {
    reasons.push(`It fits the style profile as a ${wine.varietal || wine.type}.`)
  }

  return reasons.slice(0, 4)
}

function buildScoreBreakdown(wine: EnrichedWine): RecommendationCard['scoreBreakdown'] {
  return [
    { label: 'Price', value: formatPriceText(wine) },
    { label: 'Critic Avg', value: wine.avgCriticScore !== null ? wine.avgCriticScore.toFixed(1) : 'N/A' },
    { label: 'Ratings', value: `${wine.ratingCount}` },
    { label: 'Value', value: wine.valueScore !== null ? `${wine.valueScore.toFixed(0)}/100` : 'N/A' },
    { label: 'Gift', value: wine.giftScore !== null ? wine.giftScore.toFixed(1) : 'N/A' },
    { label: 'Tier', value: wine.priceBand ?? 'N/A' },
  ]
}

function buildScoreVisuals(wine: EnrichedWine): ScoreVisual[] {
  const criticPercent = wine.avgCriticScore !== null ? clampPercent(wine.avgCriticScore) : 0
  const valuePercent = wine.valueScore !== null ? clampPercent(wine.valueScore) : 0
  const giftPercent = wine.giftScore !== null ? clampPercent(wine.giftScore) : 0

  return [
    {
      label: 'Critic',
      value: wine.avgCriticScore !== null ? `${criticPercent} / 100` : 'N/A',
      percent: criticPercent,
    },
    {
      label: 'Value',
      value: wine.valueScore !== null ? `${clampPercent(wine.valueScore)} / 100` : 'N/A',
      percent: valuePercent,
    },
    {
      label: 'Giftability',
      value: wine.giftScore !== null ? `${giftPercent} / 100` : 'N/A',
      percent: giftPercent,
    },
  ]
}

function buildNearMissReason(chosen: EnrichedWine, other: EnrichedWine, intent: QueryIntent): string {
  if (intent.maxPrice !== null && other.retailPrice !== null && other.retailPrice > intent.maxPrice) {
    return `It drifted above the ${formatPriceText({ ...other, retailPrice: intent.maxPrice } as EnrichedWine)} ceiling.`
  }

  if (intent.requestedColor && !other.type.toLowerCase().includes(intent.requestedColor)) {
    return `Its style was a weaker match for the requested ${intent.requestedColor} profile.`
  }

  if (
    chosen.avgCriticScore !== null &&
    other.avgCriticScore !== null &&
    chosen.avgCriticScore - other.avgCriticScore >= 1.5
  ) {
    return `Its critic average landed at ${other.avgCriticScore.toFixed(1)}, behind the selected bottle at ${chosen.avgCriticScore.toFixed(1)}.`
  }

  if (
    intent.wantsValue &&
    chosen.valueScore !== null &&
    other.valueScore !== null &&
    chosen.valueScore - other.valueScore >= 4
  ) {
    return `Its value score came in at ${other.valueScore.toFixed(0)}/100, which was weaker than the selected bottle's ${chosen.valueScore.toFixed(0)}/100.`
  }

  if (
    intent.wantsGift &&
    chosen.giftScore !== null &&
    other.giftScore !== null &&
    chosen.giftScore - other.giftScore >= 4
  ) {
    return `Its giftability score was ${other.giftScore.toFixed(0)}/100, so it felt a little less polished for the occasion than the chosen bottle at ${chosen.giftScore.toFixed(0)}/100.`
  }

  if (
    chosen.ratingCount > other.ratingCount &&
    chosen.ratingCount - other.ratingCount >= 1
  ) {
    return `It had fewer critic datapoints behind it, with ${other.ratingCount} rating${other.ratingCount === 1 ? '' : 's'} versus ${chosen.ratingCount}.`
  }

  if (
    chosen.retailPrice !== null &&
    other.retailPrice !== null &&
    Math.abs(chosen.retailPrice - other.retailPrice) >= 15
  ) {
    return other.retailPrice > chosen.retailPrice
      ? `It was pricier at ${formatPriceText(other)} without improving the overall fit enough to move ahead.`
      : `It was cheaper at ${formatPriceText(other)}, but the overall quality signals were not quite as convincing.`
  }

  if (intent.regions.length > 0 && !intent.regions.some((region) => other.region.toLowerCase().includes(region.toLowerCase()))) {
    return `It was a looser regional match than the selected bottle.`
  }

  if (intent.varietals.length > 0 && !intent.varietals.some((varietal) => other.varietal.toLowerCase().includes(varietal.toLowerCase()))) {
    return `Its varietal profile was a weaker match for what you asked for.`
  }

  return 'It was close, but it scored a bit lower against the overall match criteria.'
}

function buildRecommendationCards(wines: EnrichedWine[], intent: QueryIntent): RecommendationCard[] {
  const picks = wines.slice(0, 3)

  return picks.map((wine, index) => {
    const nearMissPool = wines
      .filter((candidate) => candidate.id !== wine.id && candidate.name !== wine.name)
      .slice(index + 1, index + 3)

    return {
      id: wine.id || wine.name,
      name: wine.name,
      producer: wine.producer,
      varietal: wine.varietal,
      type: wine.type,
      region: wine.region,
      country: wine.country,
      appellation: wine.appellation,
      vintage: wine.vintage,
      imageUrl: wine.image_url,
      referenceUrl: wine.reference_url,
      priceText: formatPriceText(wine),
      ratingText: formatRatingText(wine),
      summary: formatWineReason(wine, intent),
      whyChosen: buildWhyChosen(wine, intent),
      scoreBreakdown: buildScoreBreakdown(wine),
      scoreVisuals: buildScoreVisuals(wine),
      whyNotThese: nearMissPool.map((candidate) => ({
        name: candidate.name,
        reason: buildNearMissReason(wine, candidate, intent),
      })),
    }
  })
}

function buildSpokenSummary(question: string, wines: EnrichedWine[], intent: QueryIntent): string {
  if (wines.length === 0) {
    return "I couldn't find a strong match in the current inventory."
  }

  const topWine = wines[0]
  const lead = intent.wantsValue
    ? selectVariant(question, [
        'For value, I would steer you toward',
        'If value is the goal, I would begin with',
        'For the strongest quality-to-price balance, I would suggest',
      ])
    : intent.wantsGift
      ? selectVariant(question, [
          'For a more gift-worthy bottle, I would steer you toward',
          'For a polished gift option, I would suggest',
          'If you want something that presents beautifully, I would point you to',
        ])
      : intent.wantsBestRated
        ? selectVariant(question, [
            'For the strongest rated option, I would point you to',
            'On critic strength alone, I would begin with',
            'For the most critically convincing bottle, I would suggest',
          ])
        : selectVariant(question, [
            'A strong place to begin would be',
            'A very solid match here would be',
            'I would start your search with',
          ])

  const region = [topWine.region, topWine.country].filter(Boolean).join(', ')
  const rating = topWine.avgCriticScore !== null ? ` with an average critic score of ${topWine.avgCriticScore.toFixed(1)}` : ''

  return `${lead} ${topWine.name}${region ? ` from ${region}` : ''}, priced at ${formatPriceText(topWine)}${rating}. I also put a few cards on screen so you can compare the reasoning.`
}

function buildDeterministicAnswer(question: string, wines: EnrichedWine[], intent: QueryIntent): string {
  if (wines.length === 0) {
    return "I couldn't find a matching wine in the current inventory."
  }

  const heading = intent.wantsValue
    ? selectVariant(question, [
        'Sommelier Notes: Best Value Picks',
        'Cellar Notes: High-Value Bottles',
        'Sommelier Notes: Smart Buys',
      ])
    : intent.wantsGift
      ? selectVariant(question, [
          'Sommelier Notes: Gift-Worthy Bottles',
          'Cellar Notes: Bottles With Presence',
          'Sommelier Notes: Strong Gift Options',
        ])
      : intent.wantsBestRated
        ? selectVariant(question, [
            'Sommelier Notes: Top Rated Matches',
            'Cellar Notes: Critic Favorites',
            'Sommelier Notes: Standout Rated Bottles',
          ])
        : selectVariant(question, [
            'Sommelier Notes: Best Matches',
            'Cellar Notes: Where I Would Start',
            'Sommelier Notes: Most Relevant Picks',
          ])

  const opener = selectVariant(question, [
    `For your question, I focused on the bottles that best match the requested profile.`,
    `I looked for the wines that align most closely with what you asked for.`,
    `I narrowed this down by weighing fit, critic support, and overall recommendation strength.`,
  ])

  const lines = wines.slice(0, 3).map((wine, index) => {
    const reasonLead = selectVariant(`${question}-${index}`, [
      'Why it fits',
      'Why it stands out',
      'Why I included it',
    ])
    const reasons = buildWhyChosen(wine, intent).slice(0, 2).join(' ')
    return `${index + 1}. ${formatWineReason(wine, intent)}\n   ${reasonLead}: ${reasons}`
  }).join('\n')

  return `${heading}\nFor: ${question}\n\n${opener}\n\n${lines}`
}

function buildPromptContext(question: string, wines: EnrichedWine[], intent: QueryIntent, history: ConversationTurn[] = []): string {
  const intentTags = [
    intent.wantsBestRated ? 'best-rated' : '',
    intent.wantsValue ? 'value' : '',
    intent.wantsGift ? 'gift' : '',
    intent.wantsBudget ? 'budget' : '',
    intent.wantsPremium ? 'premium' : '',
    intent.requestedColor ? `${intent.requestedColor} wine` : '',
    ...intent.countries,
    ...intent.regions,
    ...intent.appellations,
    ...intent.varietals,
  ].filter(Boolean).join(', ')

  const summary = wines.slice(0, 5).map((wine, index) => {
    const topRating = wine.professional_ratings[0]
    const topRatingText = topRating ? `${topRating.score}/${topRating.max_score}` : 'n/a'

    return `${index + 1}. ${wine.name} | producer: ${wine.producer || 'unknown'} | varietal: ${wine.varietal || wine.type || 'unknown'} | origin: ${[wine.region, wine.country].filter(Boolean).join(', ') || 'unknown'} | price: ${wine.retailPrice !== null ? `$${wine.retailPrice.toFixed(0)}` : 'unknown'} | avgCriticScore: ${wine.avgCriticScore?.toFixed(1) ?? 'n/a'} | ratingCount: ${wine.ratingCount} | valueScore: ${wine.valueScore !== null ? `${wine.valueScore.toFixed(0)}/100` : 'n/a'} | giftScore: ${wine.giftScore?.toFixed(1) ?? 'n/a'} | top rating: ${topRatingText}`
  }).join('\n')

  return `Recent conversation:
${buildConversationContext(history)}

User question: ${question}
Detected intent: ${intentTags || 'general recommendation'}
Grounded recommendations:
${summary}`
}

function filterAndRankWines(question: string, wines: WineData[], inheritedIntent?: QueryIntent): { matches: EnrichedWine[]; intent: QueryIntent } {
  const intent = inheritedIntent ?? extractIntent(question, wines)
  const enriched = normalizeValueScores(wines.map(enrichWine))

  const filtered = enriched.filter((wine) => {
    if (intent.requestedColor && !wine.type.toLowerCase().includes(intent.requestedColor)) return false
    if (intent.maxPrice !== null && wine.retailPrice !== null && wine.retailPrice > intent.maxPrice) return false
    if (intent.minPrice !== null && wine.retailPrice !== null && wine.retailPrice < intent.minPrice) return false
    if (intent.countries.length > 0 && !intent.countries.some((country) => wine.country.toLowerCase() === country.toLowerCase())) return false
    if (intent.regions.length > 0 && !intent.regions.some((region) => wine.region.toLowerCase().includes(region.toLowerCase()))) return false
    if (intent.appellations.length > 0 && !intent.appellations.some((appellation) => wine.appellation.toLowerCase().includes(appellation.toLowerCase()))) return false
    if (intent.varietals.length > 0 && !intent.varietals.some((varietal) => wine.varietal.toLowerCase().includes(varietal.toLowerCase()))) return false
    return true
  })

  const pool = filtered.length > 0 ? filtered : enriched
  const ranked = pool
    .map((wine) => ({ wine, score: scoreWineForQuery(wine, question, intent) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.wine)

  return {
    matches: ranked.slice(0, 20),
    intent,
  }
}

function buildFallbackAnswer(question: string, wines: EnrichedWine[], intent: QueryIntent): string {
  if (wines.length === 0) {
    return "I'm sorry, I couldn't find any wines in the inventory right now."
  }

  return buildDeterministicAnswer(question, wines, intent)
}

async function fetchWineData(): Promise<WineData[]> {
  const sheetId = '1Bkv3Jb_8YuLUG2rWUhJhQBdaGjQCMFfwF9oJ5jrYDSA'
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`

  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })
    const text = await response.text()

    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
    if (!jsonMatch) {
      throw new Error('Failed to parse Google Sheets response')
    }

    const data = JSON.parse(jsonMatch[1])
    const rows = data.table.rows
    const cols = data.table.cols
    const headers = cols.map((col: { label: string }) => col.label?.toLowerCase() || '')

    const wines: WineData[] = rows.slice(0).map((row: { c: Array<{ v: string | number | null }> }) => {
      const wine: Record<string, string> = {}
      row.c.forEach((cell, index) => {
        const header = headers[index] || `col${index}`
        wine[header] = cell?.v?.toString() || ''
      })

      let ratings: WineData['professional_ratings'] = []
      try {
        if (wine['professional_ratings']) {
          ratings = JSON.parse(wine['professional_ratings'])
        }
      } catch {
        ratings = []
      }

      return {
        id: wine['id'] || '',
        name: wine['name'] || '',
        producer: wine['producer'] || '',
        varietal: wine['varietal'] || '',
        region: wine['region'] || '',
        country: wine['country'] || '',
        appellation: wine['appellation'] || '',
        vintage: wine['vintage'] || '',
        price: wine['retail'] || '',
        type: wine['color'] || '',
        abv: wine['abv'] || '',
        volume_ml: wine['volume_ml'] || '',
        image_url: wine['image_url'] || '',
        reference_url: wine['reference_url'] || '',
        professional_ratings: ratings,
      }
    }).filter((wine: WineData) => wine.name)

    return wines
  } catch (error) {
    console.error('[v0] Error fetching wine data:', error)
    return []
  }
}

export async function GET() {
  try {
    const wines = await fetchWineData()
    return Response.json({ wines })
  } catch (error) {
    console.error('[v0] Error fetching wines:', error)
    return Response.json({ error: 'Failed to fetch wines' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const question = body?.question
    const history = Array.isArray(body?.history) ? body.history as ConversationTurn[] : []

    if (!question || typeof question !== 'string') {
      return Response.json({ error: 'Please provide a question' }, { status: 400 })
    }

    const wines = await fetchWineData()
    if (wines.length === 0) {
      return Response.json({
        answer: "I'm sorry, I couldn't load the wine data at the moment. Please try again later.",
      })
    }

    const currentIntent = extractIntent(question, wines)
    const previousQuestion = findLastUserQuestion(history)
    const previousIntent = previousQuestion ? extractIntent(previousQuestion, wines) : null
    const mergedIntent = mergeIntentWithHistory(currentIntent, previousIntent, question)
    const { matches: winesToSend, intent } = filterAndRankWines(question, wines, mergedIntent)

    if (!process.env.GROQ_API_KEY) {
      return Response.json({
        answer: buildFallbackAnswer(question, winesToSend, intent),
        spokenSummary: buildSpokenSummary(question, winesToSend, intent),
        recommendations: winesToSend.length > 0 ? buildRecommendationCards(winesToSend, intent) : [],
        warning: 'GROQ_API_KEY is not configured, so this response was generated from inventory data without AI.',
      })
    }

    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    })

    const result = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: `You are a grounded sommelier assistant. Use only the provided grounded recommendations and metrics.

RULES:
- ONLY recommend wines from this list - never invent wines
- The on-screen answer should be neatly formatted with short headings or numbered points, not one dense paragraph
- Sound polished, poised, and like a restaurant sommelier without becoming overly long
- Mention why each recommendation fits using grounded fields like price, critic score, value score, gift score, region, or varietal
- If the question asks for "best", "value", or "gift", reflect the ranking logic already provided
- Do not mention any wine that is not listed in the grounded recommendations
- If there are no strong matches, say so briefly and give the closest available alternatives`,
      prompt: buildPromptContext(question, winesToSend, intent, history),
      maxOutputTokens: 500,
    })

    return Response.json({
      answer: result.text,
      spokenSummary: buildSpokenSummary(question, winesToSend, intent),
      recommendations: winesToSend.length > 0 ? buildRecommendationCards(winesToSend, intent) : [],
    })
  } catch (error) {
    console.error('[v0] Error processing wine question:', error)
    return Response.json({
      error: 'Sorry, I encountered an error processing your question. Please try again.',
    }, { status: 500 })
  }
}
