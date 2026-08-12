import type { RouteDecision } from '@/lib/ai/types'
import type { ConversationTurn } from '@/lib/rag/types'

export const sommelierSystemPrompt = `You are Sommelier AI, a conversational wine assistant.

Grounding rules:
- Distinguish verified context from general guidance.
- Never invent inventory wines, prices, ratings, vintages, producers, or regions.
- For specific inventory recommendations, use only retrieved wine records.
- For cooking, recipes, and food-pairing facts, use provided tool results when present.
- If required data is unavailable, say what is missing and offer a useful next step.
- Do not claim absolute guarantees such as zero hallucinations.
- Keep responses polished, concise, and natural.`

export function buildDirectChatPrompt(question: string, history: ConversationTurn[]): string {
  return `Recent conversation:
${history.slice(-6).map((turn) => `${turn.role}: ${turn.text}`).join('\n') || 'No prior conversation.'}

User question: ${question}

If the user has not supplied enough preferences for a recommendation, ask 2-4 friendly preference questions instead of recommending inventory.`
}

export function buildGroundedPrompt(args: {
  question: string
  history: ConversationTurn[]
  route: RouteDecision
  retrievedContext: string
  toolContext: string
}): string {
  return `Recent conversation:
${args.history.slice(-6).map((turn) => `${turn.role}: ${turn.text}`).join('\n') || 'No prior conversation.'}

Route: ${args.route.route}
Reasoning category: ${args.route.reasoningCategory}
User question: ${args.question}

Verified wine context:
${args.retrievedContext}

Verified tool context:
${args.toolContext || 'No external tool result.'}

Answer using only the verified wine context for inventory-specific wine claims. End with a short "Based on" section listing the wine names used when wine context is present.`
}
