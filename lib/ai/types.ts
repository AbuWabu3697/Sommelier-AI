import type { RetrievalFilters, RetrievalResult } from '@/lib/rag/types'

export type RouteType = 'DIRECT_CHAT' | 'WINE_RETRIEVAL' | 'EXTERNAL_TOOL' | 'RETRIEVAL_PLUS_TOOL'

export interface RouteDecision {
  route: RouteType
  needsWineContext: boolean
  needsExternalTool: boolean
  retrievalQuery: string
  filters: RetrievalFilters
  reasoningCategory: 'recommendation' | 'pairing' | 'cooking' | 'preference_discovery' | 'general'
}

export interface RequestDiagnostics {
  route: RouteDecision
  retrievalMode?: 'chroma' | 'fallback' | 'skipped'
  retrievedWineIds: string[]
  retrievedSimilarityScores: Array<number | null>
  externalToolsCalled: string[]
  toolProviderModes: string[]
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  baselineInputTokens: number | null
  ragInputTokens: number
  tokenReductionPercent: number | null
  tokenBaselineEstimate: number | null
  tokenReductionPercentEstimate: number | null
  warnings: string[]
}

export interface ChatOrchestrationResult {
  answer: string
  spokenSummary: string
  recommendations: RecommendationCard[]
  sources: Array<{ id: string; name: string }>
  diagnostics: RequestDiagnostics
}

export interface ScoreVisual {
  label: string
  value: string
  percent: number
}

export interface NearMiss {
  name: string
  reason: string
}

export interface RecommendationCard {
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
  scoreBreakdown: Array<{ label: string; value: string }>
  scoreVisuals: ScoreVisual[]
  whyNotThese: NearMiss[]
}

export interface GroundingBundle {
  retrievalResults: RetrievalResult[]
  toolContext: string
}
