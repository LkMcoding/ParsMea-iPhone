// ParsMea iPhone: implementazione browser delle API Electron.
// I documenti e le divisioni restano sul dispositivo (IndexedDB).
import { calculateSplit } from './splitMath.js'
import { recognizeAiReceipt } from './receiptAi.js'

const DB_NAME = 'parsmea-iphone-v1'
const DB_VERSION = 1
const MAX_FILE_BYTES = 30 * 1024 * 1024
const pendingFiles = new Map()
let databasePromise

const ACCEPTED_TYPES = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['pdf', 'application/pdf']
])

function id() {
  return crypto.randomUUID()
}

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains('tickets')) {
        const store = db.createObjectStore('tickets', { keyPath: 'id' })
        store.createIndex('folderId', 'folderId')
      }
      if (!db.objectStoreNames.contains('attachments')) {
        const store = db.createObjectStore('attachments', { keyPath: 'id' })
        store.createIndex('ticketId', 'ticketId')
      }
      if (!db.objectStoreNames.contains('splits')) {
        db.createObjectStore('splits', { keyPath: 'ticketId' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error || new Error('Impossibile aprire l’archivio locale.'))
    }
    request.onblocked = () => reject(new Error('Chiudi le altre finestre di ParsMea e riprova.'))
  })

  return databasePromise
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Errore archivio locale.'))
  })
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('Operazione annullata.'))
    transaction.onerror = () => reject(transaction.error || new Error('Errore salvataggio.'))
  })
}

async function readOne(storeName, key) {
  const db = await openDatabase()
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).get(key))
}

async function readByIndex(storeName, indexName, value) {
  const db = await openDatabase()
  const store = db.transaction(storeName, 'readonly').objectStore(storeName)
  return requestResult(store.index(indexName).getAll(value))
}

async function putOne(storeName, record) {
  const db = await openDatabase()
  const tx = db.transaction(storeName, 'readwrite')
  const finished = transactionResult(tx)
  tx.objectStore(storeName).put(record)
  await finished
}

function publicAttachment(attachment) {
  const { blob, ...metadata } = attachment
  return metadata
}

function normalizeFile(file) {
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  const mimeType = ACCEPTED_TYPES.get(extension)

  if (!mimeType || (file.type && file.type !== mimeType &&
      !(mimeType === 'image/jpeg' && file.type === 'image/jpg'))) {
    throw new Error(`Formato non supportato: ${file.name}. Usa JPG, PNG, WEBP o PDF.`)
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Il file ${file.name} supera 30 MB.`)
  }
  return {
    token: `${id()}.${extension}`,
    originalName: file.name,
    mimeType,
    sizeBytes: file.size,
    file
  }
}

function chooseFiles() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,.pdf,application/pdf'
    input.multiple = true
    input.style.display = 'none'
    document.body.append(input)

    let settled = false
    const finish = (result, error) => {
      if (settled) return
      settled = true
      input.remove()
      if (error) reject(error)
      else resolve(result)
    }

    input.addEventListener('change', () => {
      try {
        const selections = Array.from(input.files || []).map(normalizeFile)
        for (const item of selections) pendingFiles.set(item.token, item.file)
        finish(selections.map(({ file, ...metadata }) => metadata))
      } catch (error) {
        finish([], error)
      }
    }, { once: true })
    input.addEventListener('cancel', () => finish([]), { once: true })
    input.click()
  })
}

function pendingAttachments(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Seleziona almeno una fotografia o un PDF.')
  }
  if (new Set(files.map((file) => file.token)).size !== files.length) {
    throw new Error('Hai selezionato due volte lo stesso file.')
  }
  return files.map((file) => {
    const blob = pendingFiles.get(file.token)
    if (!blob) throw new Error(`Il file ${file.originalName} non è più disponibile. Selezionalo nuovamente.`)
    return {
      id: id(),
      token: file.token,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      blob
    }
  })
}

async function getTicket(ticketId) {
  const ticket = await readOne('tickets', ticketId)
  if (!ticket) throw new Error('Ticket non trovato.')
  return ticket
}

async function listTickets(folderId) {
  if (!folderId) return []
  const tickets = await readByIndex('tickets', 'folderId', folderId)
  return tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function listAttachments(ticketId) {
  await getTicket(ticketId)
  const attachments = await readByIndex('attachments', 'ticketId', ticketId)
  return attachments.sort((a, b) => a.position - b.position).map(publicAttachment)
}

async function createTicket(data) {
  const folderId = String(data?.folderId || '').trim()
  const name = String(data?.name || '').trim()
  const expenseDate = String(data?.expenseDate || '').trim()
  if (!folderId || !name || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    throw new Error('Inserisci un nome e una data validi.')
  }

  const files = pendingAttachments(data.attachments || (data.attachment ? [data.attachment] : []))
  const now = new Date().toISOString()
  const first = files[0]
  const ticket = {
    id: id(), folderId, name, expenseDate,
    fileToken: first.token,
    originalName: first.originalName,
    mimeType: first.mimeType,
    sizeBytes: first.sizeBytes,
    createdAt: now, updatedAt: now
  }

  const db = await openDatabase()
  const tx = db.transaction(['tickets', 'attachments'], 'readwrite')
  const finished = transactionResult(tx)
  tx.objectStore('tickets').add(ticket)
  const attachments = tx.objectStore('attachments')
  files.forEach((file, index) => attachments.add({ ...file, ticketId: ticket.id, position: index }))
  await finished
  files.forEach((file) => pendingFiles.delete(file.token))
  return ticket
}

async function updateTicket(data) {
  const previous = await getTicket(data?.id)
  const name = String(data?.name || '').trim()
  const expenseDate = String(data?.expenseDate || '').trim()
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    throw new Error('Nome o data della spesa non validi.')
  }
  const updated = { ...previous, name, expenseDate, updatedAt: new Date().toISOString() }
  await putOne('tickets', updated)
  return updated
}

async function addAttachments(ticketId, selections) {
  await getTicket(ticketId)
  const attachments = pendingAttachments(selections)
  const old = await listAttachments(ticketId)
  const next = old.length ? Math.max(...old.map((file) => file.position)) + 1 : 0
  const db = await openDatabase()
  const tx = db.transaction('attachments', 'readwrite')
  const finished = transactionResult(tx)
  attachments.forEach((file, index) => tx.objectStore('attachments').add({
    ...file, ticketId, position: next + index
  }))
  await finished
  attachments.forEach((file) => pendingFiles.delete(file.token))
  return listAttachments(ticketId)
}

async function reorderAttachments(ticketId, orderedIds) {
  await getTicket(ticketId)
  const current = await readByIndex('attachments', 'ticketId', ticketId)
  if (!Array.isArray(orderedIds) || orderedIds.length !== current.length ||
      new Set(orderedIds).size !== current.length ||
      orderedIds.some((idValue) => !current.some((file) => file.id === idValue))) {
    throw new Error('Ordine degli allegati non valido.')
  }
  const db = await openDatabase()
  const tx = db.transaction('attachments', 'readwrite')
  const finished = transactionResult(tx)
  const store = tx.objectStore('attachments')
  orderedIds.forEach((fileId, position) => {
    store.put({ ...current.find((file) => file.id === fileId), position })
  })
  await finished
  return listAttachments(ticketId)
}

async function deleteTicket(ticketId) {
  const existing = await readOne('tickets', ticketId)
  if (!existing) return false
  const attachments = await readByIndex('attachments', 'ticketId', ticketId)
  const db = await openDatabase()
  const tx = db.transaction(['tickets', 'attachments', 'splits'], 'readwrite')
  const finished = transactionResult(tx)
  tx.objectStore('tickets').delete(ticketId)
  tx.objectStore('splits').delete(ticketId)
  const store = tx.objectStore('attachments')
  attachments.forEach((file) => store.delete(file.id))
  await finished
  return true
}

function displayAttachment(blob, filename, mimeType) {
  const url = URL.createObjectURL(blob)
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', `Anteprima ${filename}`)
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111a30ed;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px'

  const top = document.createElement('div')
  top.style.cssText = 'width:100%;max-width:900px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:white'
  const title = document.createElement('strong')
  title.textContent = filename
  const close = document.createElement('button')
  close.textContent = 'Chiudi ✕'
  close.style.cssText = 'padding:12px 18px;border:0;border-radius:10px;background:white;color:#1d2949;font-weight:700'
  const dismiss = () => { overlay.remove(); URL.revokeObjectURL(url) }
  close.addEventListener('click', dismiss)
  overlay.addEventListener('click', (event) => { if (event.target === overlay) dismiss() })
  top.append(title, close)

  const viewer = document.createElement(mimeType === 'application/pdf' ? 'iframe' : 'img')
  viewer.src = url
  viewer.style.cssText = 'width:100%;max-width:900px;max-height:80vh;flex:1;object-fit:contain;background:white;border:0;border-radius:10px'
  overlay.append(top, viewer)
  document.body.append(overlay)
}

async function openAttachment(ticketId, attachmentId) {
  await getTicket(ticketId)
  const attachment = await readOne('attachments', attachmentId)
  if (!attachment || attachment.ticketId !== ticketId) throw new Error('Allegato non trovato.')
  displayAttachment(attachment.blob, attachment.originalName, attachment.mimeType)
}

async function getSplit(ticketId) {
  await getTicket(ticketId)
  return (await readOne('splits', ticketId)) || null
}

async function saveSplit(data) {
  await getTicket(data?.ticketId)
  const items = data?.items
  const people = data?.people
  const allocations = data?.allocations
  if (!Array.isArray(items) || items.length === 0 ||
      !Array.isArray(people) || people.length === 0 || !allocations ||
      new Set(items.map((item) => item.id)).size !== items.length ||
      new Set(people.map((person) => person.id)).size !== people.length ||
      items.some((item) => !item.id || !String(item.name || '').trim() ||
        !Number.isSafeInteger(item.priceCents) || item.priceCents < 0) ||
      people.some((person) => !person.id || !String(person.name || '').trim())) {
    throw new Error('Controlla prodotti e persone prima di salvare.')
  }
  const validIds = new Set(people.map((person) => person.id))
  for (const item of items) {
    const rule = allocations[item.id]
    const ids = rule?.personIds
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
        ids.some((personId) => !validIds.has(personId) ||
          !Number.isSafeInteger(rule?.weights?.[personId] ?? 1) ||
          (rule?.weights?.[personId] ?? 1) <= 0)) {
      throw new Error(`Controlla le quote del prodotto ${item.name}.`)
    }
  }
  const result = calculateSplit(items, people, allocations)
  if (!result.complete || result.allocatedTotalCents !== result.originalTotalCents) {
    throw new Error('Le quote non corrispondono al totale della spesa.')
  }
  const previous = await readOne('splits', data.ticketId)
  const now = new Date().toISOString()
  const split = {
    ticketId: data.ticketId,
    items: structuredClone(items),
    people: structuredClone(people),
    allocations: structuredClone(allocations),
    totalsByPerson: people.map((person) => ({
      ...person, totalCents: result.totals[person.id] || 0
    })),
    totalCents: result.originalTotalCents,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  }
  await putOne('splits', split)
  return split
}

async function recognize(ticketId, options = {}) {
  await getTicket(ticketId)
  const attachments = await readByIndex('attachments', 'ticketId', ticketId)
  if (!attachments.length) throw new Error('Non ci sono immagini o PDF nel ticket.')
  attachments.sort((a, b) => a.position - b.position)
  const { recognizeBrowserReceipt, buildCandidate, mergeOcrPages } = await import('./receiptOcr.js')
  const pdfCount = attachments.filter((file) => file.mimeType === 'application/pdf').length
  if (!pdfCount) {
    if (options.mode === 'ai') {
      return recognizeAiReceipt(attachments.map((file) => file.blob))
    }
    return recognizeBrowserReceipt(attachments.map((file) => file.blob))
  }

  const { extractBrowserPdfText, renderBrowserPdfPages } = await import('./browserPdfReceipt.js')

  // Prima prova il livello testuale del PDF (più accurato e molto più veloce
  // dell'OCR); solo se il totale non torna passa alle pagine rasterizzate.
  if (pdfCount === attachments.length) {
    const pages = []
    for (const file of attachments) {
      pages.push(...await extractBrowserPdfText(file.blob))
    }
    const digital = buildCandidate(mergeOcrPages(pages), 100, 'pdf-text')
    if (digital.items.length > 0 && digital.totalsMatch === true) {
      return { ...digital, imageCount: pages.length, pdfPageCount: pages.length, recognitionMode: 'pdf-text' }
    }
  }

  const sources = []
  let pdfPageCount = 0
  for (const file of attachments) {
    if (file.mimeType !== 'application/pdf') {
      sources.push(file.blob)
      continue
    }
    const pages = await renderBrowserPdfPages(file.blob)
    pdfPageCount += pages.length
    sources.push(...pages)
  }
  if (options.mode === 'ai') {
    const result = await recognizeAiReceipt(sources)
    return { ...result, pdfPageCount }
  }
  const result = await recognizeBrowserReceipt(sources)
  return { ...result, pdfPageCount, recognitionMode: 'ocr' }
}

export const browserParsmea = {
  tickets: {
    list: listTickets,
    create: createTicket,
    update: updateTicket,
    delete: deleteTicket,
    attachments: listAttachments,
    addAttachments,
    reorderAttachments
  },
  files: {
    select: async () => (await chooseFiles())[0] || null,
    selectMany: chooseFiles,
    openAttachment,
    open: async (ticketId) => {
      const attachments = await listAttachments(ticketId)
      if (attachments.length) await openAttachment(ticketId, attachments[0].id)
    }
  },
  ocr: { recognize },
  splits: { get: getSplit, save: saveSplit }
}

if (!window.parsmea) window.parsmea = browserParsmea
