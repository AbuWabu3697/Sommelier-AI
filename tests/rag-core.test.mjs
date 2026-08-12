import assert from 'node:assert/strict'

function parsePrice(price) {
  const parsed = Number.parseFloat(price.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function calculateBestValueScore(averageRating, price, config = {
  ratingWeight: 0.72,
  priceWeight: 0.28,
  pricePivot: 60,
  minimumUsefulRating: 82,
}) {
  if (averageRating === null || price === null || price <= 0) return null
  const ratingComponent = Math.max(0, Math.min(1, (averageRating - config.minimumUsefulRating) / (100 - config.minimumUsefulRating)))
  const priceComponent = 1 / (1 + Math.max(0, price - 10) / config.pricePivot)
  return Math.round((ratingComponent * config.ratingWeight + priceComponent * config.priceWeight) * 1000) / 10
}

function heuristicRoute(question) {
  const lower = question.toLowerCase()
  const asksCooking = /\bcook|cooking|recipe|ingredient|marinade|sauce|braise|deglaze\b/.test(lower)
  const asksPairing = /\bpair|pairs|pairing|serve with|goes with|food\b/.test(lower)
  const asksRecommendation = /\brecommend|suggest|buy|best|under|below|value|gift|bottle|wine from|crisp|dry|sweet|red|white|ros[eé]|sparkling\b/.test(lower)
  const vaguePreference = /what kind of wine.*like|what would i like|help me choose|not sure|where should i begin/.test(lower)
  if (vaguePreference && !/\b(red|white|sweet|dry|budget|under|with|for)\b/.test(lower)) return 'DIRECT_CHAT'
  if (asksCooking) return 'EXTERNAL_TOOL'
  if (asksRecommendation && asksPairing) return 'RETRIEVAL_PLUS_TOOL'
  if (asksRecommendation) return 'WINE_RETRIEVAL'
  if (asksPairing) return 'EXTERNAL_TOOL'
  return 'DIRECT_CHAT'
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('price parsing keeps exact numeric metadata available', () => {
  assert.equal(parsePrice('$24.99'), 24.99)
  assert.equal(parsePrice('Retail: 110'), 110)
  assert.equal(parsePrice('unknown'), null)
})

test('best value scoring rewards strong ratings without blindly dividing rating by price', () => {
  const balanced = calculateBestValueScore(92, 35)
  const expensive = calculateBestValueScore(94, 180)
  assert.ok(balanced > expensive)
  assert.ok(balanced <= 100)
})

test('router does not retrieve for vague preference discovery', () => {
  assert.equal(heuristicRoute('What kind of wine would I probably like?'), 'DIRECT_CHAT')
})

test('router combines retrieval and tools for pairing recommendations', () => {
  assert.equal(heuristicRoute('What wine from your collection pairs best with grilled salmon?'), 'RETRIEVAL_PLUS_TOOL')
})
