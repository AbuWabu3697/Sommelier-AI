import { answerWineQuestion } from '@/lib/ai/orchestrator'
import { evaluationCases } from '@/lib/evaluation/cases'
import { scoreEvaluationCase, summarizeEvaluation } from '@/lib/evaluation/metrics'

export async function runEvaluation(limit = evaluationCases.length) {
  const selectedCases = evaluationCases.slice(0, limit)
  const results = []

  for (const testCase of selectedCases) {
    const history = testCase.id.includes('followup')
      ? [{ role: 'assistant' as const, text: 'I recommend 2022 Cloudy Bay Sauvignon Blanc.', wineIds: ['10069131'] }]
      : []
    const result = await answerWineQuestion(testCase.query, history)
    results.push(scoreEvaluationCase(testCase, result))
  }

  return {
    summary: summarizeEvaluation(results),
    results,
  }
}
