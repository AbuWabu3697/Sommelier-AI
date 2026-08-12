import type { RouteType } from '@/lib/ai/types'
import type { RetrievalFilters } from '@/lib/rag/types'

export interface EvaluationCase {
  id: string
  query: string
  expectedRoute: RouteType
  expectedWineIds?: string[]
  expectedAttributes?: {
    type?: string
    varietal?: string
    region?: string
    country?: string
    maxPrice?: number
    minRating?: number
    flavorProfile?: string[]
    pairing?: string[]
  }
  expectedConstraints?: RetrievalFilters
  expectToolCall?: boolean
  expectRetrievedContext?: boolean
  notes: string
}

const coreCases: EvaluationCase[] = [
  {
    id: 'direct-vague-001',
    query: 'What kind of wine would I probably like?',
    expectedRoute: 'DIRECT_CHAT',
    expectToolCall: false,
    expectRetrievedContext: false,
    notes: 'Preference discovery should ask questions before retrieval.',
  },
  {
    id: 'retrieval-budget-white-001',
    query: 'I want a crisp white wine under $25 that works with seafood.',
    expectedRoute: 'RETRIEVAL_PLUS_TOOL',
    expectedConstraints: { type: 'White', maxPrice: 25 },
    expectedAttributes: { type: 'white', maxPrice: 25 },
    expectToolCall: true,
    expectRetrievedContext: true,
    notes: 'Needs inventory retrieval plus pairing guidance.',
  },
  {
    id: 'tool-cooking-001',
    query: 'How should I cook with Sauvignon Blanc?',
    expectedRoute: 'EXTERNAL_TOOL',
    expectedAttributes: { varietal: 'sauvignon blanc' },
    expectToolCall: true,
    expectRetrievedContext: false,
    notes: 'Cooking guidance without a selected inventory bottle can use the tool only.',
  },
  {
    id: 'retrieval-tool-followup-001',
    query: 'How can I use that wine in cooking?',
    expectedRoute: 'RETRIEVAL_PLUS_TOOL',
    expectedWineIds: ['10069131'],
    expectedAttributes: { varietal: 'sauvignon blanc' },
    expectToolCall: true,
    expectRetrievedContext: true,
    notes: 'Follow-up can resolve prior wine from conversation state.',
  },
  {
    id: 'retrieval-salmon-001',
    query: 'What wine from your collection pairs best with grilled salmon and why?',
    expectedRoute: 'RETRIEVAL_PLUS_TOOL',
    expectedAttributes: {},
    expectToolCall: true,
    expectRetrievedContext: true,
    notes: 'Inventory recommendation with pairing explanation.',
  },
]

const generated: EvaluationCase[] = Array.from({ length: 105 }, (_, index) => {
  const bucket = index % 7
  if (bucket === 0) {
    return {
      id: `generated-direct-${index}`,
      query: `I am not sure where to begin with wine choice ${index}.`,
      expectedRoute: 'DIRECT_CHAT',
      expectToolCall: false,
      expectRetrievedContext: false,
      notes: 'Vague preference discovery.',
    }
  }
  if (bucket === 1) {
    return {
      id: `generated-red-value-${index}`,
      query: `Recommend a good value red wine under $${25 + (index % 5) * 10}.`,
      expectedRoute: 'WINE_RETRIEVAL',
      expectedConstraints: { type: 'Red', maxPrice: 25 + (index % 5) * 10 },
      expectedAttributes: { type: 'red', maxPrice: 25 + (index % 5) * 10 },
      expectToolCall: false,
      expectRetrievedContext: true,
      notes: 'Budget red retrieval.',
    }
  }
  if (bucket === 2) {
    return {
      id: `generated-white-seafood-${index}`,
      query: `Find a white wine for seafood under $${30 + (index % 4) * 10}.`,
      expectedRoute: 'RETRIEVAL_PLUS_TOOL',
      expectedConstraints: { type: 'White', maxPrice: 30 + (index % 4) * 10 },
      expectedAttributes: { type: 'white', maxPrice: 30 + (index % 4) * 10 },
      expectToolCall: true,
      expectRetrievedContext: true,
      notes: 'Pairing plus retrieval.',
    }
  }
  if (bucket === 3) {
    return {
      id: `generated-cooking-${index}`,
      query: `Can I use a dry white wine in a pan sauce ${index}?`,
      expectedRoute: 'EXTERNAL_TOOL',
      expectedAttributes: { type: 'white' },
      expectToolCall: true,
      expectRetrievedContext: false,
      notes: 'Cooking guidance.',
    }
  }
  if (bucket === 4) {
    return {
      id: `generated-pinot-${index}`,
      query: `Which Pinot Noir should I buy for dinner ${index}?`,
      expectedRoute: 'WINE_RETRIEVAL',
      expectedConstraints: { varietal: 'Pinot Noir' },
      expectedAttributes: { varietal: 'pinot noir' },
      expectToolCall: false,
      expectRetrievedContext: true,
      notes: 'Varietal retrieval.',
    }
  }
  if (bucket === 5) {
    return {
      id: `generated-rating-${index}`,
      query: `Show me wines rated at least 90 that feel special ${index}.`,
      expectedRoute: 'WINE_RETRIEVAL',
      expectedConstraints: { minRating: 90 },
      expectedAttributes: { minRating: 90 },
      expectToolCall: false,
      expectRetrievedContext: true,
      notes: 'Rating constraint.',
    }
  }
  return {
    id: `generated-missing-${index}`,
    query: `Do you have a verified bottle from a tiny unknown region called Region ${index}?`,
    expectedRoute: 'WINE_RETRIEVAL',
    expectToolCall: false,
    expectRetrievedContext: true,
    notes: 'Should fail safely if no matching record is present.',
  }
})

export const evaluationCases: EvaluationCase[] = [...coreCases, ...generated]
