import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.mjs'

const ORIGIN = 'https://lkmcoding.github.io'

function request(images, origin = ORIGIN, ip = '203.0.113.8') {
  return new Request('https://parsmea-ai-free.example.workers.dev/', {
    method: 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  })
}

const photo = 'data:image/jpeg;base64,/9j/AA=='
const allowed = { limit: async () => ({ success: true }) }

function makeEnv(aiRun = async () => ({ response: '{"items":[{"name":"PANE","price_cents":199}],"receipt_total_cents":199,"warnings":[]}' })) {
  return { AI: { run: aiRun }, IP_RATE_LIMITER: allowed, GLOBAL_RATE_LIMITER: allowed }
}

test('analizza senza password o autorizzazione e passa foto JPEG al modello vision', async () => {
  let called = false
  const res = await worker.fetch(request([photo]), makeEnv(async (model, options) => {
      called = true
      assert.equal(model, '@cf/qwen/qwen3.8-27b')
      assert.deepEqual(options.messages[1].content[1].image_url, { url: photo })
      return { response: '{"items":[{"name":"PANE","price_cents":199}],"receipt_total_cents":199,"warnings":[]}' }
  }))
  assert.equal(called, true)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.deepEqual((await res.json()).items[0].name, 'PANE')
})

test('rifiuta origine estranea e foto non JPEG', async () => {
  const env = makeEnv()
  assert.equal((await worker.fetch(request([photo], 'https://evil.example'), env)).status, 403)
  assert.equal((await worker.fetch(request(['data:image/png;base64,AAAA']), env)).status, 400)
})

test('limite per IP blocca prima di consumare la quota AI', async () => {
  let called = false
  const env = {
    ...makeEnv(async () => { called = true }),
    IP_RATE_LIMITER: { limit: async ({ key }) => {
      assert.equal(key, '203.0.113.8')
      return { success: false }
    } }
  }
  const res = await worker.fetch(request([photo]), env)
  assert.equal(res.status, 429)
  assert.equal(called, false)
})

test('limite complessivo blocca prima di consumare la quota AI', async () => {
  let called = false
  const env = {
    ...makeEnv(async () => { called = true }),
    GLOBAL_RATE_LIMITER: { limit: async ({ key }) => {
      assert.equal(key, 'parsmeai')
      return { success: false }
    } }
  }
  const res = await worker.fetch(request([photo]), env)
  assert.equal(res.status, 429)
  assert.equal(called, false)
})

test('rifiuta l’analisi se manca un binding protettivo', async () => {
  let called = false
  const env = makeEnv(async () => { called = true })
  delete env.IP_RATE_LIMITER
  const res = await worker.fetch(request([photo]), env)
  assert.equal(res.status, 503)
  assert.equal(called, false)
})

test('rifiuta richieste troppo grandi anche senza Content-Length', async () => {
  const req = new Request('https://example.workers.dev/', {
    method: 'POST',
    headers: { Origin: ORIGIN },
    body: 'a'.repeat(8_000_001)
  })
  req.headers.delete('Content-Length')
  assert.equal((await worker.fetch(req, makeEnv())).status, 413)
})

test('risponde alla preflight CORS del sito e di Vite locale', async () => {
  for (const origin of [ORIGIN, 'http://localhost:5173']) {
    const res = await worker.fetch(new Request('https://example.workers.dev/', {
      method: 'OPTIONS', headers: { Origin: origin }
    }), {})
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin)
  }
})
