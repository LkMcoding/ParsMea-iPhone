import test from 'node:test'
import assert from 'node:assert/strict'
import { applyReceiptDiscounts } from '../src/receiptDiscounts.js'
import { calculateSplit, distributeCents } from '../src/splitMath.js'
import { parseReceiptText, buildCandidate, chooseBestCandidate, inferSingleDiscount } from '../src/receiptOcr.js'
import { detectReceiptBounds } from '../src/receiptImage.js'

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

test('Lidl: dieci prodotti, IVA esclusa dai nomi, sconto e totale 21,87', () => {
  const raw = [
    'DESCRIZIONE IVA PREZZO(€)',
    'SHOPPER BIODEGRAD. 22% 0,10',
    'TARTARE DI SCOTTONA 10% 4,59',
    'SPECK A FETTE 10% 1,65',
    'AFFETTATO POLLO AFFU 10% 1,99',
    'CARPACC.CARNE SALADA 10% 2,89',
    'PROSC.CRUDO EFF.MOSS 10% 2,69',
    'PIZZA FICHI&GORGONZO 10% 2,99',
    '12 RUSTICI WUERSTEL 10% 2,04',
    'Cad 0,17 Pz. 12',
    'Promo vassoio rustici wurstel',
    '10% -0,05',
    'PESTO RADIC.SPECK 10% 1,49',
    'PATE DI CARCIOFI 10% 1,49',
    'VALORE SCONTI 0,05',
    'SUBTOTALE 21,87',
    'TOTALE COMPLESSIVO 21,87',
    'DI CUI IVA 2,00',
    'Pagamento elettronico 1,87',
    'Pagamento non riscosso 20,00',
    'Importo pagato 1,87',
    '2 x Ticket non riscosso 20,00'
  ].join('\n')
  const candidate = buildCandidate(raw, 84, 'ita')
  assert.equal(candidate.items.length, 10)
  assert.equal(candidate.items[0].name, 'SHOPPER BIODEGRAD')
  assert.equal(candidate.items[0].priceCents, 10)
  assert.equal(candidate.discountTotalCents, 5)
  assert.equal(candidate.itemsTotalCents, 2187)
  assert.equal(candidate.receiptTotalCents, 2187)
  assert.equal(candidate.totalsMatch, true)
  assert.equal(candidate.unresolvedDiscounts.length, 0)
})

test('Lidl: i pagamenti con buoni e il valore sconti non sono articoli', () => {
  const parsed = parseReceiptText([
    'PATE DI CARCIOFI 10% 1,49',
    'VALORE SCONTI 0,05',
    'SUBTOTALE 21,87',
    'TOTALE COMPLESSIVO 21,87',
    'Pagamento non riscosso 20,00',
    'Importo pagato 1,87'
  ].join('\n'))
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.receiptTotalCents, 2187)
})

test('Uno sconto ambiguo si può stimare dal totale, ma è marcato come stima', () => {
  const raw = [
    'SHOPPER 22% 0,10',
    'TARTARE 10% 4,59',
    'SPECK 10% 1,65',
    'POLLO 10% 1,99',
    'CARPACCIO 10% 2,89',
    'PROSCIUTTO 10% 2,69',
    'PIZZA 10% 2,99',
    'RUSTICI 10% 2,04',
    'Promo vassoio rustici',
    '10% -0,65',
    'PESTO 10% 1,49',
    'PATE 10% 1,49',
    'TOTALE COMPLESSIVO 21,87'
  ].join('\n')
  const candidate = inferSingleDiscount(buildCandidate(raw, 74, 'eng'))
  assert.equal(candidate.items.length, 10)
  assert.equal(candidate.discountTotalCents, 5)
  assert.equal(candidate.totalsMatch, true)
  assert.equal(candidate.inferredDiscount, true)
  assert.match(candidate.correctionNotes[0], /verifica/i)
})

test('Un OCR con più prodotti ha precedenza su una lettura parziale da due', () => {
  const partial = buildCandidate('AFFETTATO POLLO 1,99\nRUSTICI WUERSTEL 2,04', 37, 'ita')
  const complete = buildCandidate('SHOPPER 0,10\nTARTARE 4,59\nSPECK 1,65\nTOTALE 6,34', 66, 'eng')
  assert.equal(chooseBestCandidate([partial, complete]), complete)
})

test('Il ritaglio automatico individua un foglio chiaro su uno sfondo scuro', () => {
  const width = 90
  const height = 150
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const page = x >= 22 && x <= 69 && y >= 11 && y <= 135
      data[offset] = data[offset + 1] = data[offset + 2] = page ? 230 : 65
      data[offset + 3] = 255
    }
  }
  const region = detectReceiptBounds(data, width, height)
  assert.ok(region)
  assert.ok(region.x <= 22 && region.x >= 15)
  assert.ok(region.y <= 11 && region.y >= 5)
  assert.ok(region.width >= 48 && region.width <= 60)
})
