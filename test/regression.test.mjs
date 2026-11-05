import test from 'node:test'
import assert from 'node:assert/strict'
import { applyReceiptDiscounts } from '../src/receiptDiscounts.js'
import { calculateSplit, distributeCents } from '../src/splitMath.js'
import { parseReceiptText } from '../src/receiptOcr.js'

test('Scontrino vernice: quattro sconti e totale netto di 2 euro', () => {
  const lines = [
    'VERNICE DI FINITURA BRILLANTE 23 22% 10,90',
    'Fidelity Card Sconto in valore a 22% -10,90',
    'VERNICE DI FINITURA SATINATA 237 22% 10,90',
    'Fidelity Card Sconto in valore a 22% -10,90',
    'EVIDENZIATORE A MATITA TRIANGOLA 22% 2,00',
    'Fidelity Card Sconto in valore a 22% -2,00',
    'EVIDENZIATORE A MATITA TRIANGOLA 22% 2,00',
    'PENNA PUNTA 0.3 MM TRIPLUS FINEL 22% 1,20',
    'Fidelity Card Sconto in valore a 22% -1,20'
  ]
  const items = [0, 2, 4, 6, 7].map((index, position) => ({
    id: String(position + 1),
    name: lines[index].replace(/\s\d+[,.]\d{2}$/, ''),
    priceCents: [1090, 1090, 200, 200, 120][position],
    originalLine: lines[index]
  }))
  const result = applyReceiptDiscounts(lines.join('\n'), items)
  assert.equal(result.items.length, 5)
  assert.equal(result.appliedDiscounts.length, 4)
  assert.equal(result.discountTotalCents, 2500)
  assert.equal(result.items.reduce((sum, item) => sum + item.priceCents, 0), 200)
})

test('Scontrino Esselunga: sconto con suffisso -S', () => {
  const input = 'PORTOBELLO 300 G *a 2,84\nSCONTO 30% 0.86-S'
  const result = applyReceiptDiscounts(input, [{
    id: 'portobello', name: 'PORTOBELLO 300 G', priceCents: 284,
    originalLine: 'PORTOBELLO 300 G *a 2,84'
  }])
  assert.equal(result.discountTotalCents, 86)
  assert.equal(result.items[0].priceCents, 198)
})

test('Un prodotto gratuito da zero centesimi resta divisibile', () => {
  assert.deepEqual(distributeCents(0, [1, 2]), [0, 0])
  const split = calculateSplit(
    [{ id: 'free', name: 'Prodotto omaggio', priceCents: 0 }],
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    { free: { personIds: ['a', 'b'], weights: { a: 1, b: 1 } } }
  )
  assert.equal(split.complete, true)
  assert.equal(split.allocatedTotalCents, 0)
})

test('Riconosce il totale e ignora le righe quantità', () => {
  const parsed = parseReceiptText([
    'PANE *a 1,99',
    '2 x 1,99',
    'TOTALE EURO 1,99 *',
    'PAGAMENTO CONTANTI 1,99'
  ].join('\n'))
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.receiptTotalCents, 199)
})
