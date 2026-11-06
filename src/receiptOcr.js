// OCR nel browser: nessuna fotografia viene inviata a ParsMea o a GitHub.
// Al primo utilizzo Tesseract scarica i modelli linguistici necessari.
import { applyReceiptDiscounts } from './receiptDiscounts.js'
import { prepareReceiptImages } from './receiptImage.js'

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

    const match = line.match(/(-?\s*\d+(?:[.\s]\d{3})*[,.]\d{2})\s*(?:€|EUR|\*)?\s*$/i)
    if (!match) continue

    const priceCents = amountToCents(match[1])
    if (priceCents === null) continue

    const description = line.slice(0, match.index).replace(/[-.:]+$/g, '').trim()
    if (!description) continue

    // Rimuove l'eventuale prefisso casuale OCR nelle righe di riepilogo
    // (es. "oe SUBTOTALE" o "yj Importo pagato").
    const summary = /\b(?:TOTALE(?:\s+COMPLESSIVO)?|SUBTOTALE|IMPORTO\s+PAGATO|PAGAMENTO(?:\s+NON\s+RISCOSSO)?|VALORE\s+SCONTI|DI\s+CUI\s+IVA|TICKET\s+NON\s+RISCOSSO|DA\s+PAGARE)\b/i.exec(description)
    if (summary && summary.index <= 10) {
      if (/^(?:TOTALE(?:\s+COMPLESSIVO)?|DA\s+PAGARE)\b/i.test(summary[0])) {
        receiptTotalCents = priceCents
      }
      continue
    }
    if (/^(?:TOTALE\b|TOT\.?\b|IMPORTO\s+TOTALE\b|DA\s+PAGARE\b)/i.test(description)) {
      receiptTotalCents = priceCents
      continue
    }
    if (/^(?:SUBTOTALE|IVA|DI\s+CUI\s+IVA|PAGAMENTO|PAGATO|IMPORTO\s+PAGATO|CONTANTI|RESTO|NON\s+RISCOSSO|CARTA|BANCOMAT|VISA|MASTERCARD|VALORE\s+SCONTI|SCONTI\s+TOTALI|IMPOSTA|IMPONIBILE|TICKET\s+NON\s+RISCOSSO|\d+\s*[X×]\s*TICKET\b)\b/i.test(description)) {
      continue
    }
    if (priceCents <= 0) continue

    // Colonna IVA degli scontrini alimentari: "22% 0,10".
    // Non deve essere parte del nome né diventare un articolo autonomo.
    if (/^\d{1,3}\s*%$/.test(description)) continue
    const name = description.replace(/\s+\d{1,3}\s*%\s*$/, '').replace(/[-.:]+$/g, '').trim()
    if (!name || /^(?:CAD|PZ\.?|QUANTITA|PROMO|SCONTO)\b/i.test(name)) continue

    items.push({
      id: crypto.randomUUID(),
      name,
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
  const unrealisticDiscounts = candidate.appliedDiscounts.filter((discount) => {
    const item = candidate.items.find((row) => row.id === discount.productId)
    return item && discount.amountCents > item.grossPriceCents * 0.85
  }).length
  const difference = candidate.receiptTotalCents === null
    ? 0 : Math.abs(candidate.itemsTotalCents - candidate.receiptTotalCents)
  return candidate.items.length * 65 +
    (candidate.receiptTotalCents !== null ? 130 : 0) +
    (candidate.totalsMatch === true ? 180 : 0) +
    candidate.appliedDiscounts.length * 20 +
    candidate.confidence * 0.3 -
    candidate.unresolvedDiscounts.length * 65 -
    unrealisticDiscounts * 100 -
    Math.min(200, difference / 12)
}

export function chooseBestCandidate(candidates) {
  if (!candidates.length) throw new Error('Non è stato possibile leggere lo scontrino.')
  return candidates.reduce((best, candidate) =>
    !best || scoreCandidate(candidate) > scoreCandidate(best) ? candidate : best, null)
}

function formatCents(amount) {
  return `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, '0')}`
}

// Uno sconto negativo è presente ma illeggibile: se tutti i prodotti sono
// contabilizzati, il totale stampato può suggerire l'importo mancante.
// È una STIMA, esplicitamente segnalata all'utente, mai una lettura certa.
export function inferSingleDiscount(candidate) {
  if (candidate.totalsMatch === true || candidate.receiptTotalCents === null ||
      candidate.items.length < 3 ||
      candidate.appliedDiscounts.length + candidate.unresolvedDiscounts.length !== 1) return candidate

  const lines = candidate.rawText.split(/\r?\n/)
  const discountLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /-\s*\d+[,.]\d{2}\s*$/.test(line) &&
      /\b(?:PROMO|SCONTO)|^\s*\d{1,2}%/i.test(line))
  if (discountLines.length !== 1) return candidate

  const originalItems = parseReceiptText(candidate.rawText).items
  const gross = originalItems.reduce((total, item) => total + item.priceCents, 0)
  const difference = gross - candidate.receiptTotalCents
  const precedingLine = lines.slice(Math.max(0, discountLines[0].index - 3), discountLines[0].index)
    .some((line) => /\b(?:PROMO|SCONTO|PROMOZIONE)\b/i.test(line))
  const previousItems = originalItems.filter((item) =>
    candidate.rawText.indexOf(item.originalLine) <
      candidate.rawText.indexOf(discountLines[0].line))
  const previous = previousItems.at(-1)
  if (!precedingLine || !previous || difference < 1 ||
      difference > Math.min(300, previous.priceCents * 0.35)) return candidate

  lines[discountLines[0].index] = discountLines[0].line.replace(
    /-\s*\d+[,.]\d{2}\s*$/,
    `-${formatCents(difference)}`
  )
  const proposed = buildCandidate(lines.join('\n'), candidate.confidence, candidate.language)
  if (proposed.totalsMatch !== true || proposed.appliedDiscounts.length !== 1 ||
      proposed.unresolvedDiscounts.length > 0) return candidate
  return {
    ...proposed,
    preprocessing: candidate.preprocessing,
    inferredDiscount: true,
    correctionNotes: [
      ...(candidate.correctionNotes || []),
      `Sconto di ${formatCents(difference)} € ricavato per differenza dal totale; verifica sullo scontrino.`
    ]
  }
}

export async function rereadUncertainPrices(worker, PSM, sourceCanvas, recognized) {
  if (!recognized.blocks?.length) return { text: recognized.text || '', correctionNotes: [] }
  const lines = String(recognized.text || '').split(/\r?\n/)
  const blockLines = recognized.blocks.flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []))
  const notes = []
  let retries = 0

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
    for (const line of blockLines) {
      if (retries >= 6) break
      const words = line.words || []
      const price = [...words].reverse().find((word) =>
        /-?\d+[,.]\d{2}/.test(word.text))
      if (!price || price.confidence >= 68) continue
      const sourceLine = line.text.trim()
      const position = lines.findIndex((entry) => entry.trim() === sourceLine)
      if (position < 0 || !/-?\d+[,.]\d{2}\s*$/.test(sourceLine)) continue
      const isProduct = parseReceiptText(sourceLine).items.length > 0
      const isDiscount = /-\s*\d+[,.]\d{2}\s*$/.test(sourceLine) &&
        /(?:\bPROMO|\bSCONTO|^\d{1,2}\s*%)/i.test(sourceLine)
      if (!isProduct && !isDiscount) continue
      const bounds = line.bbox
      if (!bounds) continue
      retries++

      const y = Math.max(0, bounds.y0 - 16)
      const height = Math.min(sourceCanvas.height - y, bounds.y1 - y + 16)
      if (height <= 0) continue
      const canvas = document.createElement('canvas')
      canvas.width = sourceCanvas.width
      canvas.height = Math.ceil(height)
      canvas.getContext('2d').drawImage(
        sourceCanvas, 0, y, sourceCanvas.width, height,
        0, 0, canvas.width, canvas.height
      )
      try {
        const isolated = await worker.recognize(canvas)
        const amounts = [...String(isolated.data.text || '').matchAll(/-?\d{1,4}[,.]\d{2}/g)]
        const newPrice = amounts.at(-1)?.[0]
        if (!newPrice || isolated.data.confidence < 35) continue
        const previous = /-?\d{1,4}[,.]\d{2}\s*$/.exec(sourceLine)?.[0]?.trim()
        if (!previous || newPrice === previous) continue
        // Non attribuire a un prodotto un importo negativo o viceversa.
        const fixed = previous.startsWith('-')
          ? `-${newPrice.replace(/^-/, '')}` : newPrice.replace(/^-/, '')
        const updated = lines[position].replace(/-?\d{1,4}[,.]\d{2}\s*$/, fixed)
        if (updated === lines[position]) continue
        const originalCandidate = buildCandidate(lines.join('\n'), 0, 'check')
        const proposedLines = [...lines]
        proposedLines[position] = updated
        const revisedCandidate = buildCandidate(proposedLines.join('\n'), 0, 'check')
        if (originalCandidate.receiptTotalCents !== null) {
          const initialError = Math.abs(originalCandidate.itemsTotalCents - originalCandidate.receiptTotalCents)
          const revisedError = Math.abs(revisedCandidate.itemsTotalCents - revisedCandidate.receiptTotalCents)
          if (revisedError >= initialError) continue
        } else if (isolated.data.confidence < price.confidence + 15) {
          continue
        }
        lines[position] = updated
        notes.push(`Prezzo riletto: ${previous} → ${fixed} (controllare).`)
      } finally {
        canvas.width = canvas.height = 0
      }
    }
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  }

  return { text: lines.join('\n'), correctionNotes: notes }
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
  if (!needsWorker) return [buildCandidate(mergeOcrPages(sources), 100, 'pdf-text')]
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(language, 1)

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1'
    })
    const modes = ['contrast', 'adaptive']
    const texts = modes.map(() => [])
    const confidences = modes.map(() => 0)
    let imageCount = 0
    for (const source of sources) {
      if (typeof source === 'string') {
        for (const lines of texts) lines.push(source)
        continue
      }
      let prepared
      try {
        prepared = await prepareReceiptImages(source)
      } catch (error) {
        // Fallback: alcuni dispositivi non supportano tutte le operazioni
        // canvas. Conserva comunque la lettura OCR classica.
        console.warn('Pre-elaborazione non disponibile:', error)
        const fallback = await worker.recognize(source)
        for (let index = 0; index < modes.length; index++) {
          texts[index].push(fallback.data.text || '')
          confidences[index] += fallback.data.confidence || 0
        }
        imageCount++
        continue
      }
      try {
        for (let index = 0; index < modes.length; index++) {
          const result = await worker.recognize(
            prepared[modes[index]], {}, { text: true, blocks: index === 0 }
          )
          let reread = { text: result.data.text || '', correctionNotes: [] }
          if (index === 0) {
            try {
              reread = await rereadUncertainPrices(worker, PSM, prepared.original, result.data)
            } catch (error) {
              console.warn('Rilettura dei prezzi saltata:', error)
              await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
            }
          }
          texts[index].push(reread.text)
          confidences[index] += result.data.confidence || 0
          if (reread.correctionNotes.length) {
            // Le note vengono aggregate per modalità e restituite all'utente.
            if (!texts[index].correctionNotes) texts[index].correctionNotes = []
            texts[index].correctionNotes.push(...reread.correctionNotes)
          }
        }
        imageCount++
      } finally {
        prepared.release()
      }
    }
    return modes.map((mode, index) => {
      const inferred = inferSingleDiscount(buildCandidate(mergeOcrPages(texts[index]),
        imageCount ? confidences[index] / imageCount : 100, language))
      return {
        ...inferred,
        correctionNotes: [
          ...(inferred.correctionNotes || []),
          ...(texts[index].correctionNotes || [])
        ],
        preprocessing: mode
      }
    })
  } finally {
    await worker.terminate()
  }
}

export async function recognizeBrowserReceipt(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('Carica almeno un’immagine o un PDF dello scontrino.')
  }
  let candidates
  try {
    candidates = await recognizePass(sources, 'ita')
  } catch (error) {
    throw new Error(`OCR non disponibile: ${error.message}. Per il primo utilizzo serve Internet.`)
  }

  let best = chooseBestCandidate(candidates)
  if (best.receiptTotalCents === null || best.totalsMatch !== true ||
      best.unresolvedDiscounts.length > 0 || best.confidence < 78 ||
      best.inferredDiscount || (best.correctionNotes?.length || 0) > 0) {
    try {
      const alternatives = await recognizePass(sources, 'eng')
      best = chooseBestCandidate([...candidates, ...alternatives])
    } catch (error) {
      console.warn('Modello OCR alternativo non disponibile:', error)
    }
  }

  // Un totale coincidente non certifica la correttezza dei singoli importi.
  // Specialmente su scontrini termici il carattere 0 può sembrare 8.
  const needsReview = best.totalsMatch !== true ||
    best.unresolvedDiscounts.length > 0 ||
    best.confidence < 75 ||
    Boolean(best.inferredDiscount) ||
    (best.correctionNotes?.length || 0) > 0
  return { ...best, needsReview, imageCount: sources.length }
}
