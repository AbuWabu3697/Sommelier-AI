import { buildDirectChatPrompt, buildGroundedPrompt } from '@/lib/ai/prompts'
import { generateSommelierText } from '@/lib/ai/groq'
import { routeQuestion } from '@/lib/ai/router'
import { buildFallbackGroundedAnswer, buildRecommendationCards, buildSpokenSummary } from '@/lib/ai/recommendations'
import { formatRetrievedContext, retrieveWines } from '@/lib/rag/retrieval'
import { loadWineDataset } from '@/lib/data/google-sheets'
import { createFoodProvider, formatToolContext } from '@/lib/tools/food-provider'
import type { ChatOrchestrationResult } from '@/lib/ai/types'
import type { ConversationTurn, EnrichedWine, RetrievalResult } from '@/lib/rag/types'
import type { ToolResult } from '@/lib/tools/types'

function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function resolvePreviousWine(history: ConversationTurn[], dataset: EnrichedWine[]): EnrichedWine | undefined {
  const byId = new Map(dataset.map((wine) => [wine.id, wine]))
  const priorId = [...history].reverse().flatMap((turn) => turn.wineIds ?? [])[0]
  if (priorId) return byId.get(priorId)

  const transcript = history.slice(-6).map((turn) => turn.text.toLowerCase()).join('\n')
  return dataset.find((wine) => transcript.includes(wine.name.toLowerCase()))
}

function referencesPriorWine(question: string): boolean {
  return /\b(that wine|this wine|the wine|that bottle|this bottle|the bottle|the one|you recommended|you mentioned|it)\b/i.test(question)
}

function retrievalResultFromWine(wine: EnrichedWine): RetrievalResult {
  return {
    wine,
    document: wine.documentText,
    distance: null,
    similarity: 1,
  }
}

export async function answerWineQuestion(question: string, history: ConversationTurn[] = []): Promise<ChatOrchestrationResult> {
  const startedAt = Date.now()
  const warnings: string[] = []
  const route = await routeQuestion(question, history)
  let retrievalResults: RetrievalResult[] = []
  let retrievalMode: 'chroma' | 'fallback' | 'skipped' = 'skipped'
  let retrievalContext = 'Retrieval skipped.'
  const externalToolsCalled: string[] = []
  let datasetForRequest: EnrichedWine[] | null = null
  let resolvedPriorWine: EnrichedWine | undefined

  if (route.needsWineContext) {
    if (referencesPriorWine(question)) {
      datasetForRequest = await loadWineDataset()
      resolvedPriorWine = resolvePreviousWine(history, datasetForRequest)
    }

    if (resolvedPriorWine) {
      retrievalResults = [retrievalResultFromWine(resolvedPriorWine)]
      retrievalMode = 'chroma'
    } else {
      const retrieval = await retrieveWines(route.retrievalQuery || question, route.filters)
      retrievalResults = retrieval.results
      retrievalMode = retrieval.mode
      if (retrieval.error) warnings.push(retrieval.error)
    }
    retrievalContext = formatRetrievedContext(retrievalResults)
  }

  const toolResults: ToolResult[] = []
  if (route.needsExternalTool) {
    const provider = createFoodProvider()
    const dataset = retrievalResults.length > 0 ? [] : datasetForRequest ?? await loadWineDataset()
    const wine = resolvedPriorWine ?? retrievalResults[0]?.wine ?? resolvePreviousWine(history, dataset)
    if (route.reasoningCategory === 'cooking') {
      toolResults.push(await provider.getCookingGuidance({ question, wine }))
      externalToolsCalled.push('getCookingGuidance')
    } else {
      toolResults.push(await provider.getFoodPairing({ dish: question, wine }))
      externalToolsCalled.push('getFoodPairing')
    }
  }

  const toolContext = formatToolContext(toolResults)
  const prompt = route.needsWineContext || route.needsExternalTool
    ? buildGroundedPrompt({ question, history, route, retrievedContext: retrievalContext, toolContext })
    : buildDirectChatPrompt(question, history)

  const baselineDataset = route.needsWineContext ? await loadWineDataset().catch(() => []) : []
  const tokenBaselineEstimate = baselineDataset.length > 0
    ? approximateTokens(baselineDataset.map((wine) => wine.documentText).join('\n'))
    : null
  const ragInputTokens = approximateTokens(prompt)
  const tokenReductionPercent = tokenBaselineEstimate
    ? Math.max(0, Math.round((1 - ragInputTokens / tokenBaselineEstimate) * 1000) / 10)
    : null

  let textResult = {
    text: buildFallbackGroundedAnswer(question, retrievalResults, toolContext),
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    totalTokens: null as number | null,
  }

  if (process.env.GROQ_API_KEY) {
    try {
      textResult = await generateSommelierText(prompt)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Groq generation failed')
    }
  } else {
    warnings.push('GROQ_API_KEY is not configured; using deterministic fallback response.')
  }

  const diagnostics = {
    route,
    retrievalMode,
    retrievedWineIds: retrievalResults.map((result) => result.wine.id),
    retrievedSimilarityScores: retrievalResults.map((result) => result.similarity),
    externalToolsCalled,
    toolProviderModes: toolResults.map((result) => `${result.provider}:${result.providerMode}`),
    latencyMs: Date.now() - startedAt,
    inputTokens: textResult.inputTokens ?? ragInputTokens,
    outputTokens: textResult.outputTokens,
    totalTokens: textResult.totalTokens,
    baselineInputTokens: tokenBaselineEstimate,
    ragInputTokens,
    tokenReductionPercent,
    tokenBaselineEstimate,
    tokenReductionPercentEstimate: tokenReductionPercent,
    warnings,
  }

  console.info('[sommelier.ai]', JSON.stringify(diagnostics))

  return {
    answer: textResult.text,
    spokenSummary: buildSpokenSummary(textResult.text, retrievalResults),
    recommendations: buildRecommendationCards(retrievalResults),
    sources: retrievalResults.map((result) => ({ id: result.wine.id, name: result.wine.name })),
    diagnostics,
  }
}
