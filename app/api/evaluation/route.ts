import { runEvaluation } from '@/lib/evaluation/evaluate'

export const maxDuration = 120

function authorized(req: Request): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN
  if (!adminToken) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${adminToken}`
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const limit = typeof body?.limit === 'number' ? body.limit : undefined
    const report = await runEvaluation(limit)
    return Response.json(report)
  } catch (error) {
    console.error('[sommelier.evaluation] Error:', error)
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to run evaluation',
    }, { status: 500 })
  }
}
