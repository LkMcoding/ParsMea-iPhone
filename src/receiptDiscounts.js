// ParsMea - Riconoscimento degli sconti sugli scontrini

function normalizeLine(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// ========================================
// LETTURA IMPORTI
// ========================================

// Legge il prezzo alla fine di una riga.
// Supporta:
// -10,90
// 10,90-
// 0,86-S
// 0.86-S

function readLastAmount(value) {
  const line = normalizeLine(value)

  const match = line.match(
    /(-?\s*€?\s*(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[.,]\d{2})\s*€?\s*(-\s*S?)?\s*$/i
  )

  if (!match) return null

  const numericText = match[1]
    .replace(/[€\s]/g, '')
    .replace(/^-/, '')

  const separatorIndex = Math.max(
    numericText.lastIndexOf(','),
    numericText.lastIndexOf('.')
  )

  if (separatorIndex < 0) return null

  const euros = Number(
    numericText
      .slice(0, separatorIndex)
      .replace(/[.,]/g, '')
  )

  const cents = Number(
    numericText.slice(separatorIndex + 1)
  )

  const amountCents = euros * 100 + cents

  if (!Number.isSafeInteger(amountCents)) {
    return null
  }

  return {
    amountCents,
    negative:
      match[1].trimStart().startsWith('-') ||
      Boolean(match[2])
  }
}

// ========================================
// RICONOSCIMENTO QUANTITÀ
// ========================================

function isQuantityLine(value) {
  const line = normalizeLine(value)

  return /^\d{1,4}\s*[X×*]\s*(?:\d+(?:[.,]\d{2}))?$/.test(
    line
  )
}

// ========================================
// RICONOSCIMENTO TOTALI E PAGAMENTI
// ========================================

function isTotalOrPaymentLine(value) {
  const line = normalizeLine(value)

  return /^(?:TOTALE(?:\s|$)|TOT\.?\s|IMPORTO\s+TOTALE\b|TOTALE\s+COMPLESSIVO\b|DA\s+PAGARE\b|IMPORTO\s+PAGATO\b|PAGAMENTO\b|PAGATO\b|CONTANTI\b|CONTANTE\b|RESTO\b|NON\s+RISCOSSO\b|CARTA\b|BANCOMAT\b|VISA\b|MASTERCARD\b|SUBTOTALE\b|DI\s+CUI\s+IVA\b|IVA\b|IMPONIBILE\b|RIEPILOGO\b|DOCUMENTO\b|NUMERO\s+ORDINE\b|PARTITA\s+IVA\b|P\.I\.?\b)/.test(
    line
  )
}

// ========================================
// BUONI SCONTO GENERALI
// ========================================

// Alcuni buoni riguardano la spesa complessiva.
// Non devono essere applicati automaticamente
// all'ultimo prodotto.

function isGeneralVoucherLine(value) {
  const line = normalizeLine(value)

  return /^(?:BUONO\s+SCONTO\b|BUONO\s+SPESA\b|VOUCHER\b|COUPON\b|SCONTO\s+(?:SU(?:L)?\s+TOTALE|CASSA|COMPLESSIVO)\b)/.test(
    line
  )
}

// ========================================
// RICONOSCIMENTO RIGHE DI SCONTO
// ========================================

function isDiscountLine(value) {
  const line = normalizeLine(value)

  if (isGeneralVoucherLine(line)) {
    return false
  }

  // Sconti tradizionali.
  if (
    /^(?:SCONTO|SCONTI|PROMO|PROMOZIONE|RIDUZIONE|RIBASSO|ABBUONO)\b/.test(
      line
    )
  ) {
    return true
  }

  // Esempio:
  // Fidelity Card Sconto in valore a 22% -10,90
  if (
    /\b(?:FIDELITY|FIDATY|CARD|CARTA)\b.*\bSCONTO\b/.test(
      line
    )
  ) {
    return true
  }

  // Righe con un importo negativo.
  // Esempio: 0,86-S

  const amount = readLastAmount(line)

  return Boolean(amount?.negative)
}

// ========================================
// IMPORTI SU RIGHE SEPARATE
// ========================================

function isAmountOnlyLine(value) {
  const line = normalizeLine(value)

  return /^-?\s*€?\s*\d+(?:[.,]\d{2})\s*(?:€|-\s*S?)?$/.test(
    line
  )
}

// ========================================
// FILTRO DEI PRODOTTI
// ========================================

function isLikelyProduct(item) {
  const name = normalizeLine(item?.name)

  const originalLine = normalizeLine(
    item?.originalLine
  )

  if (
    !name ||
    !Number.isSafeInteger(item?.priceCents) ||
    item.priceCents < 0
  ) {
    return false
  }

  // Elimina sconti riconosciuti come prodotti.
  if (
    isDiscountLine(name) ||
    isDiscountLine(originalLine)
  ) {
    return false
  }

  // Esclude i buoni generali.
  if (
    isGeneralVoucherLine(name) ||
    isGeneralVoucherLine(originalLine)
  ) {
    return false
  }

  // Esclude totali, pagamenti e quantità.
  if (
    isTotalOrPaymentLine(name) ||
    isTotalOrPaymentLine(originalLine) ||
    isQuantityLine(name) ||
    isQuantityLine(originalLine)
  ) {
    return false
  }

  // Elimina frammenti OCR come "Li" oppure
  // stringhe senza una descrizione leggibile.
  //
  // Le descrizioni autentiche molto brevi
  // potranno essere reinserite manualmente.

  const letters = name.match(/\p{L}/gu) || []

  return letters.length >= 3
}

// ========================================
// ABBINAMENTO PRODOTTO / RIGA
// ========================================

function matchesProductLine(item, line) {
  const normalizedLine = normalizeLine(line)

  const originalLine = normalizeLine(
    item.originalLine
  )

  const productName = normalizeLine(
    item.name
  )

  if (
    originalLine &&
    originalLine === normalizedLine
  ) {
    return true
  }

  if (
    productName &&
    normalizedLine.startsWith(productName)
  ) {
    return true
  }

  return false
}

// ========================================
// DESCRIZIONE DELLO SCONTO
// ========================================

function discountDescriptionForDisplay(value) {
  // In questa dicitura:
  //
  // "Fidelity Card Sconto in valore a 22%"
  //
  // il 22% indica l'IVA, non la percentuale
  // dello sconto.
  //
  // Rimuoviamo quindi il riferimento all'IVA
  // dalla descrizione visualizzata.

  return String(value).replace(
    /(SCONTO\s+IN\s+VALORE)\s+A\s+\d{1,2}\s*%/gi,
    '$1'
  )
}

// ========================================
// APPLICAZIONE DEGLI SCONTI
// ========================================

function applyReceiptDiscounts(rawText, recognizedItems) {
  if (!Array.isArray(recognizedItems)) {
    throw new Error(
      "L'elenco dei prodotti non è valido."
    )
  }

  // Rimuove le righe che non rappresentano
  // prodotti acquistati.

  const items = recognizedItems
    .filter(isLikelyProduct)
    .map((item) => ({
      ...item,

      grossPriceCents: item.priceCents,

      discountCents: 0,

      discounts: []
    }))

  // Testo OCR suddiviso in righe.

  const lines = String(rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  // Controlli per evitare assegnazioni doppie.

  const matchedProducts = new Set()

  const appliedDiscounts = []

  const unresolvedDiscounts = []

  let activeItemIndex = -1

  let pendingDiscountLabel = null

  // ========================================
  // FUNZIONE DI APPLICAZIONE SCONTO
  // ========================================

  function applyDiscount(line, label) {
    const amount = readLastAmount(line)

    const description = discountDescriptionForDisplay(
      label ? `${label} ${line}` : line
    )

    // Nessun importo valido oppure
    // nessun prodotto a cui associarlo.

    if (
      !amount ||
      amount.amountCents <= 0 ||
      activeItemIndex < 0
    ) {
      unresolvedDiscounts.push(description)
      return
    }

    const item = items[activeItemIndex]

    const remainingCents =
      item.grossPriceCents -
      item.discountCents

    // Evita prezzi negativi o sconti
    // superiori al prezzo residuo.

    if (amount.amountCents > remainingCents) {
      unresolvedDiscounts.push(description)
      return
    }

    // Aggiorna lo sconto del prodotto.

    item.discountCents += amount.amountCents

    // Prezzo finale.

    item.priceCents =
      item.grossPriceCents -
      item.discountCents

    // Dettaglio dello sconto.

    const discount = {
      description,

      amountCents: amount.amountCents,

      originalLine: line
    }

    item.discounts.push(discount)

    appliedDiscounts.push({
      productId: item.id,

      productName: item.name,

      ...discount
    })
  }

  // ========================================
  // ANALISI DELLE RIGHE OCR
  // ========================================

  for (const line of lines) {

    // ----------------------------------------
    // 1. BUONI SCONTO GENERALI
    // ----------------------------------------

    if (isGeneralVoucherLine(line)) {
      if (pendingDiscountLabel) {
        unresolvedDiscounts.push(
          pendingDiscountLabel
        )

        pendingDiscountLabel = null
      }

      unresolvedDiscounts.push(
        `Buono da verificare: ${line}`
      )

      activeItemIndex = -1

      continue
    }

    // ----------------------------------------
    // 2. SCONTI SUI PRODOTTI
    // ----------------------------------------

    if (isDiscountLine(line)) {
      const amount = readLastAmount(line)

      // Alcuni scontrini stampano lo sconto
      // e il suo importo su righe differenti.

      if (amount === null) {
        if (pendingDiscountLabel) {
          unresolvedDiscounts.push(
            pendingDiscountLabel
          )
        }

        pendingDiscountLabel = line
      } else {
        applyDiscount(
          line,
          pendingDiscountLabel
        )

        pendingDiscountLabel = null
      }

      continue
    }

    // ----------------------------------------
    // 3. IMPORTO DELLO SCONTO SU RIGA SEPARATA
    // ----------------------------------------

    if (
      pendingDiscountLabel &&
      isAmountOnlyLine(line)
    ) {
      applyDiscount(
        line,
        pendingDiscountLabel
      )

      pendingDiscountLabel = null

      continue
    }

    // ----------------------------------------
    // 4. SCONTO NON COMPLETATO
    // ----------------------------------------

    if (pendingDiscountLabel) {
      unresolvedDiscounts.push(
        pendingDiscountLabel
      )

      pendingDiscountLabel = null
    }

    // ----------------------------------------
    // 5. TOTALI E PAGAMENTI
    // ----------------------------------------

    if (isTotalOrPaymentLine(line)) {
      activeItemIndex = -1
      continue
    }

    // ----------------------------------------
    // 6. RIGHE DI QUANTITÀ
    // ----------------------------------------

    // Esempio:
    // 2 x 1,99
    //
    // Non crea un nuovo prodotto e non
    // interrompe il collegamento con
    // il prodotto precedente.

    if (isQuantityLine(line)) {
      continue
    }

    // ----------------------------------------
    // 7. INDIVIDUAZIONE PRODOTTO
    // ----------------------------------------

    const matchingIndex = items.findIndex(
      (item, index) =>
        !matchedProducts.has(index) &&
        matchesProductLine(item, line)
    )

    if (matchingIndex >= 0) {
      activeItemIndex = matchingIndex

      matchedProducts.add(
        matchingIndex
      )

      continue
    }

    // ----------------------------------------
    // 8. IMPORTO NON RICONOSCIUTO
    // ----------------------------------------

    // Se incontriamo un importo appartenente
    // a una riga che non siamo riusciti
    // a riconoscere, interrompiamo
    // l'associazione con il prodotto.
    //
    // Questo evita che uno sconto venga
    // applicato all'articolo sbagliato.

    if (readLastAmount(line) !== null) {
      activeItemIndex = -1
    }
  }

  // ========================================
  // SCONTI RIMASTI IN SOSPESO
  // ========================================

  if (pendingDiscountLabel) {
    unresolvedDiscounts.push(
      pendingDiscountLabel
    )
  }

  // ========================================
  // TOTALE DEGLI SCONTI APPLICATI
  // ========================================

  const discountTotalCents = appliedDiscounts.reduce(
    (total, discount) =>
      total + discount.amountCents,
    0
  )

  // ========================================
  // RISULTATO FINALE
  // ========================================

  return {
    items,

    appliedDiscounts,

    unresolvedDiscounts,

    discountTotalCents
  }
}

// ========================================
// ESPORTAZIONE MODULO
// ========================================

export { applyReceiptDiscounts }
