import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'
import { sommelierSystemPrompt } from '@/lib/ai/prompts'

export interface LlmResult {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export async function generateSommelierText(prompt: string, maxOutputTokens = 600): Promise<LlmResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
  const result = await generateText({
    model: groq(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'),
    system: sommelierSystemPrompt,
    prompt,
    maxOutputTokens,
  })

  const usage = result.usage
  return {
    text: result.text,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  }
}
