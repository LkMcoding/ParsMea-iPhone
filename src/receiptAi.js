import { prepareReceiptImages } from './receiptImage.js'

export const AI_ENDPOINT_STORAGE_KEY = 'parsmea-ai-endpoint-v2'

export function sanitizeAiEndpoint(value) {
  const url = new URL(String(value || '').trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.hostname.endsWith('.workers.dev')) {
    throw new Error('Inserisci un URL HTTPS di Cloudflare Workers (termina con .workers.dev).')
  }
  return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''))
}

export function normalizeAiReceipt(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.items)) {
    throw new Error('L’IA non ha restituito un elenco valido: riprova con una foto più nitida.')
  }
  if (input.items.length === 0 || input.items.length > 160) {
    throw new Error('L’IA non è riuscita a riconoscere prodotti validi. Correggi la fotografia e riprova.')
  }
  const notes = Array.isArray(input.warnings)
    ? input.warnings.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 240)) : []
  let discountTotalCents = 0
  const appliedDiscounts = []
  const items = input.items.map((item, index) => {
    const name = String(item?.name || '').trim().slice(0, 160)
    const priceCents = item?.price_cents
    if (!name || !Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 2000000) {
      throw new Error(`Importo o nome non valido alla riga ${index + 1}: l’IA deve essere verificata.`)
    }
    const discounts = Array.isArray(item.discounts) ? item.discounts.filter((d) =>
      Number.isSafeInteger(d?.amount_cents) && d.amount_cents > 0 && d.amount_cents <= 2000000
    ).slice(0, 8).map((d) => ({
      description: String(d.description || 'Sconto').slice(0, 100),
      amountCents: d.amount_cents
    })) : []
    for (const discount of discounts) {
      discountTotalCents += discount.amountCents
      appliedDiscounts.push(discount)
    }
    const discountCents = discounts.reduce((sum, discount) => sum + discount.amountCents, 0)
    return {
      id: `ai-${index}-${crypto.randomUUID()}`,
      name,
      priceCents,
      discounts,
      discountCents,
      grossPriceCents: priceCents + discountCents
    }
  })
  const total = input.receipt_total_cents
  const receiptTotalCents = Number.isSafeInteger(total) && total >= 0 && total <= 20000000 ? total : null
  const itemsTotalCents = items.reduce((sum, item) => sum + item.priceCents, 0)
  if (receiptTotalCents === null) notes.push('Totale non leggibile: verifica e inserisci manualmente il totale stampato.')
  else if (itemsTotalCents !== receiptTotalCents) notes.push('ATTENZIONE: somma prodotti e totale dello scontrino non coincidono. Non vengono creati importi per compensare la differenza.')

  return {
    items, receiptTotalCents, itemsTotalCents,
    totalsMatch: receiptTotalCents !== null && itemsTotalCents === receiptTotalCents,
    discountTotalCents, appliedDiscounts, unresolvedDiscounts: [],
    confidence: 0, needsReview: true, correctionNotes: notes,
    language: 'it', recognitionMode: 'ai',
    rawText: [
      'Risultato generato dall’IA: verificare sulla fotografia originale.',
      ...items.map((i) => `${i.name}   ${(i.priceCents / 100).toFixed(2)} €`),
      `Totale: ${receiptTotalCents === null ? 'non letto' : (receiptTotalCents / 100).toFixed(2) + ' €'}`
    ].join('\n')
  }
}

export async function recognizeAiReceipt(sources, endpoint, accessCode) {
  const url = sanitizeAiEndpoint(endpoint)
  if (String(accessCode || '').length < 16) throw new Error('Inserisci il codice segreto dell’IA (almeno 16 caratteri).')
  if (sources.length > 3) throw new Error('Per l’IA gratuita seleziona al massimo 3 foto/pagine per scontrino.')
  const images = []
  for (const blob of sources) {
    const prepared = await prepareReceiptImages(blob)
    try {
      // Il ritaglio è creato in Safari. L’immagine originale resta nell’archivio locale.
      images.push(prepared.original.toDataURL('image/jpeg', 0.84))
    } finally {
      prepared.release()
    }
  }
  if (!images.length) throw new Error('Non ci sono immagini da analizzare.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessCode}` },
        body: JSON.stringify({ images }),
        signal: controller.signal
      })
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('L’IA non ha risposto entro 90 secondi. Riprova.')
      throw new Error('Non riesco a raggiungere il Worker IA. Controlla connessione, indirizzo e pubblicazione Cloudflare.')
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body.error || `Servizio IA temporaneamente non disponibile (${response.status}).`)
    }
    return { ...normalizeAiReceipt(body), imageCount: images.length }
  } finally {
    clearTimeout(timer)
  }
}
