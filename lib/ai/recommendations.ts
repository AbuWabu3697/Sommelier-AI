import type { EnrichedWine, RetrievalResult } from '@/lib/rag/types'
import type { NearMiss, RecommendationCard, ScoreVisual } from '@/lib/ai/types'

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function formatPriceText(wine: EnrichedWine): string {
  return wine.retailPrice !== null ? `$${wine.retailPrice.toFixed(0)}` : 'Price unavailable'
}

export function formatRatingText(wine: EnrichedWine): string {
  if (wine.avgCriticScore !== null) return `${wine.avgCriticScore.toFixed(1)} avg critic score`
  const topRating = wine.professional_ratings[0]
  return topRating ? `${topRating.score}/${topRating.max_score}` : 'No critic ratings'
}

function buildWhyChosen(wine: EnrichedWine): string[] {
  const reasons: string[] = []
  if (wine.avgCriticScore !== null) {
    reasons.push(`Critic average is ${wine.avgCriticScore.toFixed(1)} across ${wine.ratingCount} rating${wine.ratingCount === 1 ? '' : 's'}.`)
  }
  if (wine.retailPrice !== null) reasons.push(`Retail price is ${formatPriceText(wine)} in the ${wine.priceBand ?? 'unclassified'} tier.`)
  if (wine.bestValueScore !== null) reasons.push(`Best value score is ${wine.bestValueScore.toFixed(1)} out of 100 using normalized rating and price components.`)
  if (wine.region || wine.country) reasons.push(`Origin is ${[wine.region, wine.country].filter(Boolean).join(', ')}.`)
  if (wine.varietal || wine.type) reasons.push(`Style profile is ${wine.varietal || wine.type}.`)
  if (wine.food_pairing) reasons.push(`Pairing notes include ${wine.food_pairing}.`)
  if (wine.tasting_notes || wine.description) reasons.push(`Profile notes: ${(wine.tasting_notes || wine.description).slice(0, 160)}.`)
  return reasons.slice(0, 4)
}

function buildScoreVisuals(wine: EnrichedWine): ScoreVisual[] {
  const criticPercent = wine.avgCriticScore !== null ? clampPercent(wine.avgCriticScore) : 0
  const valuePercent = wine.bestValueScore !== null ? clampPercent(wine.bestValueScore) : 0
  const giftPercent = wine.giftScore !== null ? clampPercent(wine.giftScore) : 0
  return [
    { label: 'Critic', value: wine.avgCriticScore !== null ? `${criticPercent} / 100` : 'N/A', percent: criticPercent },
    { label: 'Value', value: wine.bestValueScore !== null ? `${valuePercent} / 100` : 'N/A', percent: valuePercent },
    { label: 'Giftability', value: wine.giftScore !== null ? `${giftPercent} / 100` : 'N/A', percent: giftPercent },
  ]
}

function buildNearMisses(chosen: EnrichedWine, pool: EnrichedWine[]): NearMiss[] {
  return pool
    .filter((wine) => wine.id !== chosen.id)
    .slice(0, 2)
    .map((wine) => ({
      name: wine.name,
      reason: wine.retailPrice !== null && chosen.retailPrice !== null && wine.retailPrice > chosen.retailPrice
        ? `It was close, but cost more at ${formatPriceText(wine)} without enough extra fit to move ahead.`
        : 'It was close, but the selected bottle had a stronger overall fit against the request.',
    }))
}

export function buildRecommendationCards(results: RetrievalResult[]): RecommendationCard[] {
  const wines = results.map((result) => result.wine)
  return wines.slice(0, 3).map((wine) => ({
    id: wine.id,
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
    summary: [
      `${wine.name}${wine.varietal ? ` (${wine.varietal})` : ''}${wine.region ? ` from ${wine.region}` : ''} is ${formatPriceText(wine)} with ${formatRatingText(wine)}.`,
      wine.tasting_notes || wine.description,
      wine.food_pairing ? `Pairing notes: ${wine.food_pairing}.` : '',
    ].filter(Boolean).join(' '),
    whyChosen: buildWhyChosen(wine),
    scoreBreakdown: [
      { label: 'Price', value: formatPriceText(wine) },
      { label: 'Critic Avg', value: wine.avgCriticScore !== null ? wine.avgCriticScore.toFixed(1) : 'N/A' },
      { label: 'Ratings', value: `${wine.ratingCount}` },
      { label: 'Value', value: wine.bestValueScore !== null ? `${wine.bestValueScore.toFixed(1)}/100` : 'N/A' },
      { label: 'Gift', value: wine.giftScore !== null ? wine.giftScore.toFixed(1) : 'N/A' },
      { label: 'Tier', value: wine.priceBand ?? 'N/A' },
    ],
    scoreVisuals: buildScoreVisuals(wine),
    whyNotThese: buildNearMisses(wine, wines),
  }))
}

export function buildSpokenSummary(answer: string, results: RetrievalResult[]): string {
  if (results.length === 0) return answer.split('\n')[0] || answer
  const top = results[0].wine
  return `I would start with ${top.name}${top.region ? ` from ${top.region}` : ''}. I included the grounded recommendation details on screen.`
}

export function buildFallbackGroundedAnswer(question: string, results: RetrievalResult[], toolContext: string): string {
  if (results.length === 0 && !toolContext) {
    return "I do not have enough verified information to answer that confidently. Tell me a bit more about style, budget, or the dish and I can narrow it down."
  }

  const lines = results.slice(0, 3).map((result, index) => {
    const wine = result.wine
    return `${index + 1}. ${wine.name} - ${formatPriceText(wine)}, ${formatRatingText(wine)}${wine.region ? `, ${wine.region}` : ''}.`
  })

  return [
    `For: ${question}`,
    lines.length > 0 ? `I found these grounded inventory matches:\n${lines.join('\n')}` : '',
    toolContext ? `\nTool guidance used:\n${toolContext}` : '',
    lines.length > 0 ? `\nBased on: ${results.slice(0, 3).map((result) => result.wine.name).join(', ')}` : '',
  ].filter(Boolean).join('\n\n')
}
