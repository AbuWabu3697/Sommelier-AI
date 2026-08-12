import { ingestWineDataset } from '@/lib/rag/ingest'

export const maxDuration = 60

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
    const result = await ingestWineDataset()
    return Response.json(result)
  } catch (error) {
    console.error('[sommelier.ingest] Error:', error)
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to ingest wine dataset',
    }, { status: 500 })
  }
}
