import { answerWineQuestion } from '@/lib/ai/orchestrator'
import { loadWineDataset } from '@/lib/data/google-sheets'
import type { ConversationTurn } from '@/lib/rag/types'

export const maxDuration = 30

export async function GET() {
  try {
    const wines = await loadWineDataset()
    return Response.json({ wines })
  } catch (error) {
    console.error('[sommelier.wine] Error fetching wines:', error)
    return Response.json({ error: 'Failed to fetch wines' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const question = body?.question
    const history = Array.isArray(body?.history) ? body.history as ConversationTurn[] : []
    const debug = body?.debug === true || process.env.RAG_DEBUG === 'true'

    if (!question || typeof question !== 'string') {
      return Response.json({ error: 'Please provide a question' }, { status: 400 })
    }

    const result = await answerWineQuestion(question, history)
    return Response.json({
      answer: result.answer,
      spokenSummary: result.spokenSummary,
      recommendations: result.recommendations,
      sources: result.sources,
      ...(debug ? { diagnostics: result.diagnostics } : {}),
    })
  } catch (error) {
    console.error('[sommelier.wine] Error processing question:', error)
    return Response.json({
      error: 'Sorry, I encountered an error processing your question. Please try again.',
    }, { status: 500 })
  }
}
