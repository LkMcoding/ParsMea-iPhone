// OCR nel browser: nessuna fotografia viene inviata a ParsMea o a GitHub.
// Al primo utilizzo Tesseract scarica i modelli linguistici necessari.
import { applyReceiptDiscounts } from './receiptDiscounts.js'

function amountToCents(value) {
  const normalized = String(value).replace(/\s/g, '')
  const separator = Math.max(normalized.lastIndexOf(','), normalized.lastIndexOf('.'))
  if (separator < 0) return null
  const euros = Number(normalized.slice(0, separator).replace(/[.,]/g, ''))
  const cents = Number(normalized.slice(separator + 1))
  const result = euros * 100 + cents
  return Number.isSafeInteger(result) && result >= 0 ? result : null
}

export function parseReceiptText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const items = []
  let receiptTotalCents = null

  for (const line of lines) {
    // Le righe "2 x 1,99" descrivono quantità, non nuovi articoli.
    if (/^\d{1,4}\s*[x×*]\s*\d+(?:[.,]\d{2})?$/i.test(line)) continue

    const match = line.match(/(-?\d+(?:[.\s]\d{3})*[,.]\d{2})\s*(?:€|EUR|\*)?\s*$/i)
    if (!match) continue

    const priceCents = amountToCents(match[1])
    if (priceCents === null) continue

    const description = line.slice(0, match.index).replace(/[-.:]+$/g, '').trim()
    if (!description) continue

    if (/^(?:TOTALE\b|TOT\.?\b|IMPORTO\s+TOTALE\b|DA\s+PAGARE\b)/i.test(description)) {
      receiptTotalCents = priceCents
      continue
    }
    if (/^(?:SUBTOTALE|IVA|DI\s+CUI\s+IVA|PAGAMENTO|PAGATO|IMPORTO\s+PAGATO|CONTANTI|RESTO|NON\s+RISCOSSO|CARTA|BANCOMAT|VISA|MASTERCARD)\b/i.test(description)) {
      continue
    }
    if (priceCents <= 0) continue

    items.push({
      id: crypto.randomUUID(),
      name: description,
      priceCents,
      originalLine: line
    })
  }

  return { items, receiptTotalCents }
}

export function buildCandidate(rawText, confidence, language) {
  const parsed = parseReceiptText(rawText)
  const discounted = applyReceiptDiscounts(rawText, parsed.items)
  const itemsTotalCents = discounted.items.reduce((sum, item) => sum + item.priceCents, 0)
  return {
    rawText,
    confidence: Math.round(confidence || 0),
    language,
    items: discounted.items,
    itemsTotalCents,
    receiptTotalCents: parsed.receiptTotalCents,
    totalsMatch: parsed.receiptTotalCents === null
      ? null : itemsTotalCents === parsed.receiptTotalCents,
    appliedDiscounts: discounted.appliedDiscounts,
    unresolvedDiscounts: discounted.unresolvedDiscounts,
    discountTotalCents: discounted.discountTotalCents
  }
}

function scoreCandidate(candidate) {
  return (candidate.totalsMatch === true ? 1000 : 0) +
    (candidate.receiptTotalCents !== null ? 80 : 0) +
    candidate.items.length * 10 +
    candidate.appliedDiscounts.length * 30 -
    candidate.unresolvedDiscounts.length * 35 -
    (candidate.totalsMatch === false ? 80 : 0)
}

export function mergeOcrPages(texts) {
  const merged = []

  for (const text of texts) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    let overlap = 0
    const maxOverlap = Math.min(20, merged.length, lines.length)

    for (let size = maxOverlap; size >= 2; size -= 1) {
      const oldEnd = merged.slice(-size).map((line) => line.toUpperCase())
      const newStart = lines.slice(0, size).map((line) => line.toUpperCase())
      if (oldEnd.every((line, index) => line === newStart[index])) {
        overlap = size
        break
      }
    }
    merged.push(...lines.slice(overlap))
  }
  return merged.join('\n')
}

async function recognizePass(sources, language) {
  // I PDF con testo digitale possono essere mischiati con foto e pagine OCR.
  // Le stringhe non richiedono nessun download dei modelli Tesseract.
  const needsWorker = sources.some((source) => typeof source !== 'string')
  if (!needsWorker) return buildCandidate(mergeOcrPages(sources), 100, 'pdf-text')
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(language, 1)

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1'
    })
    const texts = []
    let confidenceTotal = 0

    let imageCount = 0
    for (const source of sources) {
      if (typeof source === 'string') {
        texts.push(source)
        continue
      }
      const result = await worker.recognize(source)
      texts.push(result.data.text || '')
      confidenceTotal += result.data.confidence || 0
      imageCount++
    }
    return buildCandidate(mergeOcrPages(texts), confidenceTotal / imageCount, language)
  } finally {
    await worker.terminate()
  }
}

export async function recognizeBrowserReceipt(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('Carica almeno un’immagine o un PDF dello scontrino.')
  }
  let best
  try {
    best = await recognizePass(sources, 'ita')
  } catch (error) {
    throw new Error(`OCR non disponibile: ${error.message}. Per il primo utilizzo serve Internet.`)
  }

  if (best.receiptTotalCents === null || best.totalsMatch !== true ||
      best.unresolvedDiscounts.length > 0) {
    try {
      const alternative = await recognizePass(sources, 'eng')
      if (scoreCandidate(alternative) > scoreCandidate(best)) best = alternative
    } catch (error) {
      console.warn('Modello OCR alternativo non disponibile:', error)
    }
  }

  return { ...best, imageCount: sources.length }
}
