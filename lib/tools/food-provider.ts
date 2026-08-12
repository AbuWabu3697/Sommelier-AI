import type { FoodProvider, ToolResult } from '@/lib/tools/types'

const SPOONACULAR_BASE_URL = 'https://api.spoonacular.com'

function fallbackResult(type: ToolResult['type'], data: Record<string, unknown>, error?: string): ToolResult {
  return {
    provider: 'development-food-provider',
    providerMode: process.env.FOOD_API_KEY ? 'unavailable' : 'fallback',
    type,
    data,
    fallback: true,
    ...(error ? { error } : {}),
  }
}

async function fetchSpoonacular<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.FOOD_API_KEY
  if (!apiKey) throw new Error('FOOD_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.FOOD_API_TIMEOUT_MS || 6000))
  const url = new URL(path, SPOONACULAR_BASE_URL)
  Object.entries({ ...params, apiKey }).forEach(([key, value]) => url.searchParams.set(key, value))

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Spoonacular request failed: ${response.status}`)
    return await response.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

export function createFoodProvider(): FoodProvider {
  return {
    async getFoodPairing({ dish, wine }) {
      try {
        const wineStyle = wine?.varietal || wine?.type || dish
        const data = await fetchSpoonacular<{
          pairings?: string[]
          text?: string
          productMatches?: Array<{ title?: string; description?: string }>
        }>('/food/wine/pairing', { wine: wineStyle })
        return {
          provider: 'spoonacular',
          providerMode: 'real',
          type: 'food_pairing',
          fallback: false,
          data: {
            dish,
            wineId: wine?.id,
            wineName: wine?.name,
            pairings: data.pairings ?? [],
            explanation: data.text ?? '',
            productMatches: data.productMatches ?? [],
          },
        }
      } catch (error) {
        return fallbackResult('food_pairing', {
          dish,
          wineId: wine?.id,
          wineName: wine?.name,
          guidance: [
            'Match intensity between the dish and wine.',
            'Use acidity to cut richness, especially with seafood, butter, or fried preparations.',
            'Avoid high-tannin reds with delicate fish unless the preparation is smoky or robust.',
          ],
        }, error instanceof Error ? error.message : 'Food pairing provider unavailable')
      }
    },
    async getRecipeSuggestions({ ingredientOrWine, wine }) {
      try {
        const data = await fetchSpoonacular<{
          results?: Array<{ id: number; title: string; image?: string }>
        }>('/recipes/complexSearch', {
          query: [ingredientOrWine, wine?.varietal, wine?.type].filter(Boolean).join(' '),
          number: '5',
          addRecipeInformation: 'true',
        })
        return {
          provider: 'spoonacular',
          providerMode: 'real',
          type: 'recipe_suggestions',
          fallback: false,
          data: {
            ingredientOrWine,
            wineId: wine?.id,
            wineName: wine?.name,
            recipes: data.results ?? [],
          },
        }
      } catch (error) {
        return fallbackResult('recipe_suggestions', {
          ingredientOrWine,
          wineId: wine?.id,
          wineName: wine?.name,
          suggestions: [
            'Use a dry white wine to deglaze seafood, chicken, or vegetable pans.',
            'Use fuller red wine in braises or reductions where tannin and fruit can soften with time.',
            'Reserve very sweet wines for desserts, poached fruit, or sauces that need sweetness.',
          ],
        }, error instanceof Error ? error.message : 'Recipe provider unavailable')
      }
    },
    async getCookingGuidance({ question, wine }) {
      try {
        const data = await fetchSpoonacular<{
          results?: Array<{ id: number; title: string; image?: string }>
        }>('/recipes/complexSearch', {
          query: [wine?.varietal, wine?.type, 'wine sauce cooking'].filter(Boolean).join(' '),
          number: '5',
          addRecipeInformation: 'true',
        })
        return {
          provider: 'spoonacular',
          providerMode: 'real',
          type: 'cooking_guidance',
          fallback: false,
          data: {
            question,
            wineId: wine?.id,
            wineName: wine?.name,
            attributes: wine ? {
              type: wine.type,
              varietal: wine.varietal,
              acidity: wine.acidity,
              sweetness: wine.sweetness,
              body: wine.body,
            } : null,
            recipes: data.results ?? [],
          },
        }
      } catch (error) {
        return fallbackResult('cooking_guidance', {
          question,
          wineId: wine?.id,
          wineName: wine?.name,
          attributes: wine ? {
            type: wine.type,
            varietal: wine.varietal,
            acidity: wine.acidity,
            sweetness: wine.sweetness,
            body: wine.body,
          } : null,
          guidance: [
            'Cook only with a wine you would be comfortable drinking.',
            'Keep delicate white wines for quick sauces and seafood preparations.',
            'For wine-specific guidance, use the verified wine attributes supplied by the inventory record.',
          ],
        }, error instanceof Error ? error.message : 'Cooking provider unavailable')
      }
    },
  }
}

export function formatToolContext(results: ToolResult[]): string {
  if (results.length === 0) return ''
  return results.map((result, index) => `Tool ${index + 1}: ${JSON.stringify(result)}`).join('\n')
}
