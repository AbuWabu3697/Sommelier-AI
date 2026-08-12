import type { EnrichedWine } from '@/lib/rag/types'

export interface ToolResult {
  provider: string
  providerMode: 'real' | 'fallback' | 'unavailable'
  type: 'food_pairing' | 'recipe_suggestions' | 'cooking_guidance'
  data: Record<string, unknown>
  fallback: boolean
  error?: string
}

export interface FoodProvider {
  getFoodPairing(args: { dish: string; wine?: EnrichedWine }): Promise<ToolResult>
  getRecipeSuggestions(args: { ingredientOrWine: string; wine?: EnrichedWine }): Promise<ToolResult>
  getCookingGuidance(args: { question: string; wine?: EnrichedWine }): Promise<ToolResult>
}
