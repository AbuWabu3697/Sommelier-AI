import { answerWineQuestion } from '@/lib/ai/orchestrator'
import type { ConversationTurn } from '@/lib/rag/types'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const question = body?.question
    const history = Array.isArray(body?.history) ? body.history as ConversationTurn[] : []
    const result = await answerWineQuestion(question, history)
    return Response.json(result)
  } catch (error) {
    console.error('[sommelier.chat] Error:', error)
    return Response.json({ error: 'Failed to answer chat request' }, { status: 500 })
  }
}
