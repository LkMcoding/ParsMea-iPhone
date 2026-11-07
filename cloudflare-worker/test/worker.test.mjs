import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.mjs'

const ORIGIN = 'https://lkmcoding.github.io'
const SECRET = 'test-secret-very-long'

function request(images, authorization = `Bearer ${SECRET}`, origin = ORIGIN) {
  return new Request('https://parsmea-ai-free.example.workers.dev/', {
    method: 'POST',
    headers: { Origin: origin, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  })
}

const photo = 'data:image/jpeg;base64,/9j/AA=='

test('accetta richiesta autorizzata e passa foto JPEG al modello vision', async () => {
  let called = false
  const res = await worker.fetch(request([photo]), {
    PARSMEA_ACCESS_CODE: SECRET,
    AI: { async run(model, options) {
      called = true
      assert.equal(model, '@cf/qwen/qwen3.8-27b')
      assert.deepEqual(options.messages[1].content[1].image_url, { url: photo })
      return { response: '{"items":[{"name":"PANE","price_cents":199}],"receipt_total_cents":199,"warnings":[]}' }
    } }
  })
  assert.equal(called, true)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.deepEqual((await res.json()).items[0].name, 'PANE')
})

test('rifiuta origine, codice errato e foto non JPEG', async () => {
  const env = { PARSMEA_ACCESS_CODE: SECRET, AI: { run: async () => ({}) } }
  assert.equal((await worker.fetch(request([photo], `Bearer ${SECRET}`, 'https://evil.example'), env)).status, 403)
  assert.equal((await worker.fetch(request([photo], 'Bearer codice-errato'), env)).status, 401)
  assert.equal((await worker.fetch(request(['data:image/png;base64,AAAA']), env)).status, 400)
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
