import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const port = Number(process.env.EVALUATION_PORT || process.env.PORT || 3100)
const baseUrl = process.env.EVALUATION_BASE_URL || `http://localhost:${port}`
const shouldIngest = process.env.EVALUATION_SKIP_INGEST !== 'true'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl)
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isServerReady()) return
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function postJson(path, body = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${text}`)
  }
  return json
}

let child = null

async function main() {
  const alreadyRunning = await isServerReady()
  if (!alreadyRunning) {
    const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm run dev -- -p ${port}`]
      : ['run', 'dev', '--', '-p', String(port)]
    child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  }

  await waitForServer()

  if (shouldIngest) {
    const ingest = await postJson('/api/ingest')
    console.log(`Ingested ${ingest.rowsIndexed}/${ingest.rowsLoaded} wines into ${ingest.collection}. Indexed wine records: ${ingest.indexedWineCount}.`)
    if (ingest.failures?.length) {
      console.log(`Ingestion failures: ${ingest.failures.length}`)
    }
  }

  const report = await postJson('/api/evaluation')
  const summary = report.summary
  console.log(`Cases: ${summary.totalCases}`)
  console.log(`Routing accuracy: ${(summary.routingAccuracy * 100).toFixed(1)}%`)
  console.log(`Chroma retrieval rate: ${summary.chromaRetrievalRate === null ? 'n/a' : `${(summary.chromaRetrievalRate * 100).toFixed(1)}%`}`)
  console.log(`Hit@k: ${summary.topKHitRate === null ? 'n/a' : `${(summary.topKHitRate * 100).toFixed(1)}%`}`)
  console.log(`Attribute accuracy: ${summary.retrievalAttributeAccuracy === null ? 'n/a' : `${(summary.retrievalAttributeAccuracy * 100).toFixed(1)}%`}`)
  console.log(`Tool routing accuracy: ${(summary.toolCallAccuracy * 100).toFixed(1)}%`)
  console.log(`Source-support rate: ${(summary.sourceSupportRate * 100).toFixed(1)}%`)
  console.log(`Average latency: ${summary.averageLatencyMs}ms`)
  console.log(`Average baseline tokens: ${summary.averageBaselineInputTokens ?? 'n/a'} estimated`)
  console.log(`Average RAG tokens: ${summary.averageRagInputTokens} estimated`)
  console.log(`Average token reduction: ${summary.averageTokenReductionPercentEstimate ?? 'n/a'}% estimated`)
  console.log(`Failures: ${summary.failures}`)

  if (process.env.EVALUATION_OUTPUT) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(process.env.EVALUATION_OUTPUT, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Saved report to ${process.env.EVALUATION_OUTPUT}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (!child) return
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  })
