// Backup manuale JSON contenente cartelle, ticket, divisioni e foto.
// Il file viene creato/scelto direttamente sul dispositivo.

const DB_NAME = 'parsmea-iphone-v1'
const DB_VERSION = 1
const STORES = ['tickets', 'attachments', 'splits']
const FOLDERS_KEY = 'parsmea-folders-v1'

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onabort = () => reject(tx.error || new Error('Ripristino annullato.'))
    tx.onerror = () => reject(tx.error || new Error('Errore salvataggio.'))
  })
}

function openDB() {
  return new Promise((resolve, reject) => {
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
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getAll(db, storeName) {
  const tx = db.transaction(storeName, 'readonly')
  return requestResult(tx.objectStore(storeName).getAll())
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function exportBackup() {
  const db = await openDB()
  let tickets, attachments, splits
  try {
    [tickets, attachments, splits] = await Promise.all(STORES.map((store) => getAll(db, store)))
  } finally {
    db.close()
  }

  let folders
  try { folders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]') } catch { folders = [] }

  const serializedAttachments = []
  for (const file of attachments) {
    const { blob, ...metadata } = file
    serializedAttachments.push({ ...metadata, dataUrl: await blobToDataUrl(blob) })
  }

  const backup = {
    format: 'parsmea-iphone-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    folders, tickets, splits,
    attachments: serializedAttachments
  }
  const json = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(json)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ParsMea-iPhone-Backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return { tickets: tickets.length, attachments: attachments.length }
}

function selectJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.append(input)
    let done = false
    const finish = (value, error) => {
      if (done) return
      done = true
      input.remove()
      if (error) reject(error)
      else resolve(value)
    }
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    input.click()
  })
}

export async function importBackup() {
  const file = await selectJSON()
  if (!file) return false

  let backup
  try { backup = JSON.parse(await file.text()) }
  catch { throw new Error('Il file selezionato non è un backup JSON valido.') }

  if (backup?.format !== 'parsmea-iphone-backup' || backup.version !== 1 ||
      !Array.isArray(backup.folders) || !Array.isArray(backup.tickets) ||
      !Array.isArray(backup.attachments) || !Array.isArray(backup.splits)) {
    throw new Error('Formato backup non riconosciuto.')
  }
  const ticketIds = new Set(backup.tickets.map((ticket) => ticket.id))
  const folderIds = new Set(backup.folders.map((folder) => folder.id))
  if (ticketIds.size !== backup.tickets.length || folderIds.size !== backup.folders.length ||
      backup.tickets.some((ticket) => !ticket.id || !folderIds.has(ticket.folderId)) ||
      backup.attachments.some((item) => !item.id || !ticketIds.has(item.ticketId) ||
        !/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(item.dataUrl || '')) ||
      backup.splits.some((split) => !ticketIds.has(split.ticketId))) {
    throw new Error('Il backup contiene dati non validi o incompleti.')
  }

  const confirmed = window.confirm(
    `Ripristinare ${backup.tickets.length} ticket e ${backup.attachments.length} allegati?\n\n` +
    'ATTENZIONE: le cartelle e i ticket attuali su questo iPhone verranno SOSTITUITI.\n' +
    'Esporta prima un backup se vuoi conservarli.'
  )
  if (!confirmed) return false

  // Valida e decodifica tutti gli allegati prima della transazione distruttiva.
  const attachments = []
  for (const item of backup.attachments) {
    const response = await fetch(item.dataUrl)
    const blob = await response.blob()
    if (blob.size !== item.sizeBytes) throw new Error('Dimensione di un allegato non valida.')
    const { dataUrl, ...metadata } = item
    attachments.push({ ...metadata, blob })
  }

  const db = await openDB()
  try {
    const tx = db.transaction(STORES, 'readwrite')
    const finished = transactionDone(tx)
    STORES.forEach((store) => tx.objectStore(store).clear())
    backup.tickets.forEach((ticket) => tx.objectStore('tickets').put(ticket))
    attachments.forEach((attachment) => tx.objectStore('attachments').put(attachment))
    backup.splits.forEach((split) => tx.objectStore('splits').put(split))
    await finished
  } finally {
    db.close()
  }

  localStorage.setItem(FOLDERS_KEY, JSON.stringify(backup.folders))
  window.location.reload()
  return true
}
