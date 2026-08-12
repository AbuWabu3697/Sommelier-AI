import { createGroq } from '@ai-sdk/groq'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { ConversationTurn } from '@/lib/rag/types'
import type { RouteDecision } from '@/lib/ai/types'

const routeSchema = z.object({
  route: z.enum(['DIRECT_CHAT', 'WINE_RETRIEVAL', 'EXTERNAL_TOOL', 'RETRIEVAL_PLUS_TOOL']),
  needsWineContext: z.boolean(),
  needsExternalTool: z.boolean(),
  retrievalQuery: z.string().default(''),
  filters: z.object({
    type: z.string().optional(),
    maxPrice: z.number().optional(),
    minPrice: z.number().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    varietal: z.string().optional(),
    minRating: z.number().optional(),
  }).default({}),
  reasoningCategory: z.enum(['recommendation', 'pairing', 'cooking', 'preference_discovery', 'general']),
})

function extractFilters(question: string): RouteDecision['filters'] {
  const lower = question.toLowerCase()
  const filters: RouteDecision['filters'] = {}
  const under = lower.match(/(?:under|below|less than)\s*\$?\s*(\d+)/)
  const over = lower.match(/(?:over|above|more than)\s*\$?\s*(\d+)/)
  const minRating = lower.match(/(?:rated|rating|score)\s*(?:over|above|at least)\s*(\d{2,3})/)

  if (under) filters.maxPrice = Number(under[1])
  if (over) filters.minPrice = Number(over[1])
  if (minRating) filters.minRating = Number(minRating[1])
  if (/\bwhite\b/.test(lower)) filters.type = 'White'
  if (/\bred\b/.test(lower)) filters.type = 'Red'
  if (/\bros[eé]\b/.test(lower)) filters.type = 'Rose'
  if (/\bsparkling|champagne\b/.test(lower)) filters.type = 'Sparkling'

  const varietals = ['sauvignon blanc', 'chardonnay', 'pinot noir', 'cabernet sauvignon', 'merlot', 'riesling', 'syrah', 'zinfandel']
  const varietal = varietals.find((candidate) => lower.includes(candidate))
  if (varietal) filters.varietal = varietal.replace(/\b\w/g, (char) => char.toUpperCase())

  return filters
}

function referencesPreviousWine(question: string): boolean {
  return /\b(that|this|it|those|the first|the second|previous|one)\b/i.test(question)
}

export function heuristicRoute(question: string, history: ConversationTurn[] = []): RouteDecision {
  const lower = question.toLowerCase()
  const asksCooking = /\bcook|cooking|recipe|ingredient|marinade|sauce|braise|deglaze\b/.test(lower)
  const asksPairing = /\bpair|pairs|pairing|serve with|goes with|food\b/.test(lower)
  const asksRecommendation = /\brecommend|suggest|show me|buy|best|under|below|value|gift|bottle|wines?|wine from|crisp|dry|sweet|red|white|ros[eé]|sparkling|rated at least|light|refreshing\b/.test(lower)
  const vaguePreference = /what kind of wine.*like|what would i like|help me choose|not sure|where should i begin/.test(lower)
  const hasPriorWine = history.some((turn) => turn.wineIds && turn.wineIds.length > 0)

  if (vaguePreference && !/\b(red|white|sweet|dry|budget|under|\$|seafood|salmon|dinner|gift)\b/.test(lower)) {
    return {
      route: 'DIRECT_CHAT',
      needsWineContext: false,
      needsExternalTool: false,
      retrievalQuery: '',
      filters: {},
      reasoningCategory: 'preference_discovery',
    }
  }

  if (asksCooking && (referencesPreviousWine(question) || hasPriorWine)) {
    return {
      route: 'RETRIEVAL_PLUS_TOOL',
      needsWineContext: true,
      needsExternalTool: true,
      retrievalQuery: question,
      filters: extractFilters(question),
      reasoningCategory: 'cooking',
    }
  }

  if (asksCooking) {
    return {
      route: 'EXTERNAL_TOOL',
      needsWineContext: false,
      needsExternalTool: true,
      retrievalQuery: '',
      filters: {},
      reasoningCategory: 'cooking',
    }
  }

  if (asksRecommendation && asksPairing) {
    return {
      route: 'RETRIEVAL_PLUS_TOOL',
      needsWineContext: true,
      needsExternalTool: true,
      retrievalQuery: question,
      filters: extractFilters(question),
      reasoningCategory: 'pairing',
    }
  }

  if (asksRecommendation) {
    return {
      route: 'WINE_RETRIEVAL',
      needsWineContext: true,
      needsExternalTool: false,
      retrievalQuery: question,
      filters: extractFilters(question),
      reasoningCategory: 'recommendation',
    }
  }

  if (asksPairing) {
    return {
      route: 'EXTERNAL_TOOL',
      needsWineContext: false,
      needsExternalTool: true,
      retrievalQuery: '',
      filters: {},
      reasoningCategory: 'pairing',
    }
  }

  return {
    route: 'DIRECT_CHAT',
    needsWineContext: false,
    needsExternalTool: false,
    retrievalQuery: '',
    filters: {},
    reasoningCategory: 'general',
  }
}

export async function routeQuestion(question: string, history: ConversationTurn[] = []): Promise<RouteDecision> {
  if (!process.env.GROQ_API_KEY || process.env.ROUTER_MODE === 'heuristic') {
    return heuristicRoute(question, history)
  }

  try {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
    const result = await generateObject({
      model: groq(process.env.GROQ_ROUTER_MODEL || 'llama-3.1-8b-instant'),
      schema: routeSchema,
      system: `Classify a wine assistant request into one route. Use retrieval only when the user asks for a specific inventory wine recommendation or references a known prior wine. Use tools for recipes, cooking, ingredient compatibility, and food pairing facts. Do not reveal reasoning.`,
      prompt: JSON.stringify({
        question,
        recentConversation: history.slice(-6),
      }),
    })
    return routeSchema.parse(result.object)
  } catch (error) {
    console.warn('[sommelier.router] Falling back to heuristic router', error)
    return heuristicRoute(question, history)
  }
}
