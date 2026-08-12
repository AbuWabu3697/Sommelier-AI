import type { EvaluationCase } from '@/lib/evaluation/cases'
import type { ChatOrchestrationResult } from '@/lib/ai/types'

export interface EvaluationResult {
  id: string
  query: string
  expectedRoute: string
  actualRoute: string
  routeCorrect: boolean
  retrievedWineIds: string[]
  expectedWineIds?: string[]
  topKHit: boolean | null
  attributeMatch: boolean | null
  routeUsedChroma: boolean | null
  toolCallCorrect: boolean
  sourceSupport: boolean
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  baselineInputTokens: number | null
  ragInputTokens: number
  tokenReductionPercent: number | null
  tokenReductionPercentEstimate: number | null
  failures: string[]
}

function textIncludesAny(text: string, values: string[] | undefined): boolean {
  if (!values || values.length === 0) return true
  const lower = text.toLowerCase()
  return values.some((value) => lower.includes(value.toLowerCase()))
}

function matchesExpectedAttributes(testCase: EvaluationCase, result: ChatOrchestrationResult): boolean | null {
  const expected = testCase.expectedAttributes
  if (!expected) return null
  if (Object.keys(expected).length === 0) return result.recommendations.length > 0
  if (result.recommendations.length === 0) return false

  return result.recommendations.some((wine) => {
    const haystack = [
      wine.name,
      wine.producer,
      wine.type,
      wine.varietal,
      wine.region,
      wine.country,
      wine.summary,
      ...wine.whyChosen,
    ].join(' ').toLowerCase()

    if (expected.type && !wine.type.toLowerCase().includes(expected.type.toLowerCase())) return false
    if (expected.varietal && !wine.varietal.toLowerCase().includes(expected.varietal.toLowerCase())) return false
    if (expected.region && !wine.region.toLowerCase().includes(expected.region.toLowerCase())) return false
    if (expected.country && !wine.country.toLowerCase().includes(expected.country.toLowerCase())) return false
    if (expected.maxPrice) {
      const price = Number.parseFloat(wine.priceText.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(price) || price > expected.maxPrice) return false
    }
    if (expected.minRating) {
      const rating = Number.parseFloat(wine.ratingText)
      if (!Number.isFinite(rating) || rating < expected.minRating) return false
    }
    if (!textIncludesAny(haystack, expected.flavorProfile)) return false
    if (!textIncludesAny(haystack, expected.pairing)) return false
    return true
  })
}

export function scoreEvaluationCase(testCase: EvaluationCase, result: ChatOrchestrationResult): EvaluationResult {
  const actualRoute = result.diagnostics.route.route
  const retrievedWineIds = result.diagnostics.retrievedWineIds
  const topKHit = testCase.expectedWineIds
    ? testCase.expectedWineIds.some((id) => retrievedWineIds.includes(id))
    : null

  return {
    id: testCase.id,
    query: testCase.query,
    expectedRoute: testCase.expectedRoute,
    actualRoute,
    routeCorrect: actualRoute === testCase.expectedRoute,
    retrievedWineIds,
    expectedWineIds: testCase.expectedWineIds,
    topKHit,
    attributeMatch: matchesExpectedAttributes(testCase, result),
    routeUsedChroma: testCase.expectRetrievedContext ? result.diagnostics.retrievalMode === 'chroma' : null,
    toolCallCorrect: testCase.expectToolCall === undefined
      ? true
      : testCase.expectToolCall === result.diagnostics.externalToolsCalled.length > 0,
    sourceSupport: result.sources.every((source) => retrievedWineIds.includes(source.id)),
    latencyMs: result.diagnostics.latencyMs,
    inputTokens: result.diagnostics.inputTokens,
    outputTokens: result.diagnostics.outputTokens,
    baselineInputTokens: result.diagnostics.baselineInputTokens,
    ragInputTokens: result.diagnostics.ragInputTokens,
    tokenReductionPercent: result.diagnostics.tokenReductionPercent,
    tokenReductionPercentEstimate: result.diagnostics.tokenReductionPercentEstimate,
    failures: result.diagnostics.warnings,
  }
}

export function summarizeEvaluation(results: EvaluationResult[]) {
  const routeCorrect = results.filter((result) => result.routeCorrect).length
  const topKScored = results.filter((result) => result.topKHit !== null)
  const topKHits = topKScored.filter((result) => result.topKHit).length
  const attributeScored = results.filter((result) => result.attributeMatch !== null)
  const attributeMatches = attributeScored.filter((result) => result.attributeMatch).length
  const chromaScored = results.filter((result) => result.routeUsedChroma !== null)
  const chromaHits = chromaScored.filter((result) => result.routeUsedChroma).length
  const toolCorrect = results.filter((result) => result.toolCallCorrect).length
  const sourceSupported = results.filter((result) => result.sourceSupport).length
  const averageLatencyMs = Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(1, results.length))
  const tokenReductions = results
    .map((result) => result.tokenReductionPercent)
    .filter((value): value is number => value !== null)
  const baselineTokens = results
    .map((result) => result.baselineInputTokens)
    .filter((value): value is number => value !== null)
  const ragTokens = results.map((result) => result.ragInputTokens)
  const averageTokenReductionPercentEstimate = tokenReductions.length > 0
    ? Math.round((tokenReductions.reduce((sum, value) => sum + value, 0) / tokenReductions.length) * 10) / 10
    : null

  return {
    totalCases: results.length,
    routingAccuracy: routeCorrect / Math.max(1, results.length),
    topKHitRate: topKScored.length > 0 ? topKHits / topKScored.length : null,
    retrievalAttributeAccuracy: attributeScored.length > 0 ? attributeMatches / attributeScored.length : null,
    chromaRetrievalRate: chromaScored.length > 0 ? chromaHits / chromaScored.length : null,
    toolCallAccuracy: toolCorrect / Math.max(1, results.length),
    sourceSupportRate: sourceSupported / Math.max(1, results.length),
    averageLatencyMs,
    averageBaselineInputTokens: baselineTokens.length > 0
      ? Math.round(baselineTokens.reduce((sum, value) => sum + value, 0) / baselineTokens.length)
      : null,
    averageRagInputTokens: Math.round(ragTokens.reduce((sum, value) => sum + value, 0) / Math.max(1, ragTokens.length)),
    averageTokenReductionPercentEstimate,
    failures: results.reduce((sum, result) => {
      return sum + result.failures.filter((failure) => !failure.includes('GROQ_API_KEY is not configured')).length
    }, 0),
    warnings: results.reduce((sum, result) => sum + result.failures.length, 0),
  }
}
