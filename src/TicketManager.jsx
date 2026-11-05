import { useEffect, useRef, useState } from 'react'
import ExpenseSplitter from './ExpenseSplitter.jsx'

// ========================================
// FUNZIONI DI SUPPORTO
// ========================================

function todayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDate(value) {
  if (!value) return 'Data non disponibile'

  const parts = value.split('-')

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : value
}

function formatFileSize(bytes) {
  return `${Math.round((bytes || 0) / 1024)} KB`
}

function formatMoney(cents) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
}

function centsToInput(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function inputToCents(value) {
  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace('€', '')
    .replace(',', '.')

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const parts = normalized.split('.')
  const euros = Number(parts[0])
  const cents = Number((parts[1] || '').padEnd(2, '0'))

  if (!Number.isSafeInteger(euros)) {
    return null
  }

  const result = euros * 100 + cents

  return Number.isSafeInteger(result)
    ? result
    : null
}

function discountLabel(item) {
  const discounts = Array.isArray(item.discounts)
    ? item.discounts
    : []

  if (discounts.length > 1) {
    return `${discounts.length} sconti applicati`
  }

  const description = discounts[0]?.description || ''

  const percent = description.match(
    /(\d+(?:[,.]\d+)?)\s*%/
  )

  return percent
    ? `Sconto ${percent[1]}%`
    : 'Sconto applicato'
}

function readFolderPeople(folderId) {
  try {
    const folders = JSON.parse(
      localStorage.getItem('parsmea-folders-v1') || '[]'
    )

    if (!Array.isArray(folders)) {
      return []
    }

    return folders.find(
      (folder) => folder.id === folderId
    )?.people || []
  } catch {
    return []
  }
}

// ========================================
// COMPONENTE PRINCIPALE
// ========================================

export default function TicketManager({
  folderId,
  people = []
}) {

  // ========================================
  // ELENCO TICKET
  // ========================================

  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ========================================
  // CREAZIONE TICKET
  // ========================================

  const [showCreate, setShowCreate] = useState(false)
  const [ticketName, setTicketName] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayDate())

  const [createAttachments, setCreateAttachments] = useState([])
  const [saving, setSaving] = useState(false)

  // ========================================
  // DETTAGLIO TICKET
  // ========================================

  const [selectedTicket, setSelectedTicket] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDate, setEditDate] = useState('')

  // ========================================
  // FOTOGRAFIE
  // ========================================

  const [attachments, setAttachments] = useState([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsBusy, setAttachmentsBusy] = useState(false)

  const attachmentsRequest = useRef(0)

  // ========================================
  // ELIMINAZIONE
  // ========================================

  const [deleting, setDeleting] = useState(false)

  // ========================================
  // RICONOSCIMENTO OCR
  // ========================================

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrView, setOcrView] = useState(false)
  const [ocrError, setOcrError] = useState('')

  const [ocrItems, setOcrItems] = useState([])
  const [ocrRawText, setOcrRawText] = useState('')

  const [receiptTotalCents, setReceiptTotalCents] = useState(null)
  const [ocrConfidence, setOcrConfidence] = useState(0)

  const [ocrDiscountTotalCents, setOcrDiscountTotalCents] = useState(0)
  const [ocrAppliedDiscounts, setOcrAppliedDiscounts] = useState([])
  const [ocrUnresolvedDiscounts, setOcrUnresolvedDiscounts] = useState([])

  // ========================================
  // DIVISIONE DELLA SPESA
  // ========================================

  const [splitView, setSplitView] = useState(false)
  const [splitItems, setSplitItems] = useState([])
  const [splitPeople, setSplitPeople] = useState([])

  const [editingSavedSplit, setEditingSavedSplit] = useState(false)
  const [initialAllocations, setInitialAllocations] = useState({})

  // ========================================
  // DIVISIONE SALVATA
  // ========================================

  const [savedSplit, setSavedSplit] = useState(null)
  const [savedSplitLoading, setSavedSplitLoading] = useState(false)
  const [savedSplitError, setSavedSplitError] = useState('')

  const savedSplitRequest = useRef(0)

  const availablePeople = people.length > 0
    ? people
    : readFolderPeople(folderId)

  // ========================================
  // CARICAMENTO TICKET
  // ========================================

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      setSelectedTicket(null)

      try {
        if (!window.parsmea?.tickets) {
          throw new Error(
            'Apri ParsMea dalla finestra desktop Electron.'
          )
        }

        const result = await window.parsmea.tickets.list(
          folderId
        )

        if (active) {
          setTickets(result)
        }
      } catch (err) {
        if (active) {
          setError(err.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [folderId])

  async function refreshTickets() {
    const result = await window.parsmea.tickets.list(
      folderId
    )

    setTickets(result)
  }

  // ========================================
  // CREAZIONE TICKET
  // ========================================

  function closeCreateForm() {
    setShowCreate(false)
    setTicketName('')
    setExpenseDate(todayDate())
    setCreateAttachments([])
    setError('')
  }

  async function chooseFiles() {
    try {
      setError('')

      const files = await window.parsmea.files.selectMany()

      if (
        Array.isArray(files) &&
        files.length > 0
      ) {
        setCreateAttachments((current) => [
          ...current,
          ...files
        ])
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function moveCreateAttachment(index, direction) {
    setCreateAttachments((current) => {
      const nextIndex = index + direction

      if (
        nextIndex < 0 ||
        nextIndex >= current.length
      ) {
        return current
      }

      const updated = [...current]

      const temporary = updated[index]

      updated[index] = updated[nextIndex]
      updated[nextIndex] = temporary

      return updated
    })
  }

  async function createTicket(event) {
    event.preventDefault()

    if (createAttachments.length === 0) {
      setError(
        'Carica almeno una foto o un PDF dello scontrino.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      await window.parsmea.tickets.create({
        folderId,
        name: ticketName.trim(),
        expenseDate,
        attachments: createAttachments
      })

      await refreshTickets()

      closeCreateForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ========================================
  // AZZERAMENTO OCR
  // ========================================

  function resetOcr() {
    setOcrView(false)
    setSplitView(false)

    setSplitItems([])
    setSplitPeople([])
    setEditingSavedSplit(false)
    setInitialAllocations({})

    setOcrError('')
    setOcrItems([])
    setOcrRawText('')

    setReceiptTotalCents(null)
    setOcrConfidence(0)

    setOcrDiscountTotalCents(0)
    setOcrAppliedDiscounts([])
    setOcrUnresolvedDiscounts([])
  }

  // ========================================
  // CARICAMENTO FOTOGRAFIE
  // ========================================

  async function loadAttachments(ticketId) {
    const requestId = ++attachmentsRequest.current

    setAttachmentsLoading(true)
    setError('')

    try {
      const files = await window.parsmea.tickets.attachments(
        ticketId
      )

      if (requestId === attachmentsRequest.current) {
        setAttachments(files)
      }
    } catch (err) {
      if (requestId === attachmentsRequest.current) {
        setError(err.message)
      }
    } finally {
      if (requestId === attachmentsRequest.current) {
        setAttachmentsLoading(false)
      }
    }
  }

  // ========================================
  // RECUPERO DIVISIONE SALVATA
  // ========================================

  async function loadSavedSplit(ticketId) {
    const requestId = ++savedSplitRequest.current

    setSavedSplitLoading(true)
    setSavedSplitError('')

    try {
      const saved = await window.parsmea.splits.get(
        ticketId
      )

      if (requestId === savedSplitRequest.current) {
        setSavedSplit(saved)
      }
    } catch (err) {
      if (requestId === savedSplitRequest.current) {
        setSavedSplitError(err.message)
      }
    } finally {
      if (requestId === savedSplitRequest.current) {
        setSavedSplitLoading(false)
      }
    }
  }

  // ========================================
  // APERTURA TICKET
  // ========================================

  function openTicket(ticket) {
    setSelectedTicket(ticket)
    setEditing(false)

    setEditName(ticket.name)
    setEditDate(ticket.expenseDate)

    resetOcr()
    setError('')

    setAttachments([])
    setSavedSplit(null)

    loadAttachments(ticket.id)
    loadSavedSplit(ticket.id)
  }

  function closeTicket() {
    attachmentsRequest.current += 1
    savedSplitRequest.current += 1

    setSelectedTicket(null)
    setEditing(false)

    setAttachments([])
    setAttachmentsLoading(false)

    setSavedSplit(null)
    setSavedSplitLoading(false)
    setSavedSplitError('')

    resetOcr()
    setError('')
  }

  // ========================================
  // APERTURA ALLEGATI
  // ========================================

  async function viewFile(attachmentId) {
    if (!selectedTicket) return

    try {
      setError('')

      await window.parsmea.files.openAttachment(
        selectedTicket.id,
        attachmentId
      )
    } catch (err) {
      setError(err.message)
    }
  }

  // ========================================
  // AGGIUNTA FOTOGRAFIE
  // ========================================

  async function addPhotosToTicket() {
    if (
      !selectedTicket ||
      attachmentsBusy
    ) {
      return
    }

    setAttachmentsBusy(true)
    setError('')

    try {
      const files = await window.parsmea.files.selectMany()

      if (
        !Array.isArray(files) ||
        files.length === 0
      ) {
        return
      }

      const updated = await window.parsmea.tickets.addAttachments(
        selectedTicket.id,
        files
      )

      setAttachments(updated)

      resetOcr()
    } catch (err) {
      setError(err.message)
    } finally {
      setAttachmentsBusy(false)
    }
  }

  // ========================================
  // RIORDINO FOTOGRAFIE
  // ========================================

  async function movePhoto(index, direction) {
    if (
      !selectedTicket ||
      attachmentsBusy
    ) {
      return
    }

    const newIndex = index + direction

    if (
      newIndex < 0 ||
      newIndex >= attachments.length
    ) {
      return
    }

    const ordered = [...attachments]

    const temporary = ordered[index]

    ordered[index] = ordered[newIndex]
    ordered[newIndex] = temporary

    setAttachmentsBusy(true)
    setError('')

    try {
      const updated = await window.parsmea.tickets.reorderAttachments(
        selectedTicket.id,
        ordered.map((file) => file.id)
      )

      setAttachments(updated)

      resetOcr()
    } catch (err) {
      setError(err.message)
    } finally {
      setAttachmentsBusy(false)
    }
  }

  // ========================================
  // ELIMINAZIONE TICKET
  // ========================================

  async function deleteSelectedTicket() {
    if (
      !selectedTicket ||
      deleting ||
      attachmentsBusy ||
      ocrLoading
    ) {
      return
    }

    const confirmed = window.confirm(
      `Vuoi eliminare definitivamente il ticket "${selectedTicket.name}"?\n\n` +
      'Verranno eliminati anche tutti i suoi allegati e gli eventuali dati di divisione salvati.\n\n' +
      'Questa operazione non può essere annullata.'
    )

    if (!confirmed) {
      return
    }

    setDeleting(true)
    setError('')

    try {
      const removed = await window.parsmea.tickets.delete(
        selectedTicket.id
      )

      if (!removed) {
        throw new Error(
          'Il ticket non è stato trovato.'
        )
      }

      closeTicket()

      await refreshTickets()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ========================================
  // MODIFICA TICKET
  // ========================================

  async function saveChanges(event) {
    event.preventDefault()

    if (!selectedTicket) {
      return
    }

    setSaving(true)
    setError('')

    try {
      const updated = await window.parsmea.tickets.update({
        id: selectedTicket.id,
        name: editName.trim(),
        expenseDate: editDate
      })

      setSelectedTicket(updated)
      setEditing(false)

      await refreshTickets()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ========================================
  // RICONOSCIMENTO OCR
  // ========================================

  async function runOcr() {
    if (!selectedTicket) {
      return
    }

    setOcrLoading(true)
    setOcrError('')
    setError('')

    try {
      const result = await window.parsmea.ocr.recognize(
        selectedTicket.id
      )

      const items = result.items.map((item) => ({
        ...item,
        priceText: centsToInput(item.priceCents)
      }))

      setOcrItems(items)
      setOcrRawText(result.rawText || '')

      setReceiptTotalCents(result.receiptTotalCents)
      setOcrConfidence(result.confidence || 0)

      setOcrDiscountTotalCents(
        result.discountTotalCents || 0
      )

      setOcrAppliedDiscounts(
        result.appliedDiscounts || []
      )

      setOcrUnresolvedDiscounts(
        result.unresolvedDiscounts || []
      )

      setInitialAllocations({})
      setEditingSavedSplit(false)

      setSplitView(false)
      setOcrView(true)
    } catch (err) {
      setOcrError(err.message)
    } finally {
      setOcrLoading(false)
    }
  }

  // ========================================
  // MODIFICA PRODOTTI
  // ========================================

  function updateOcrItem(itemId, field, value) {
    setOcrItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value
            }
          : item
      )
    )
  }

  function addManualItem() {
    const id = `manual-${Date.now()}-${Math.random()}`

    setOcrItems((current) => [
      ...current,
      {
        id,
        name: '',
        priceText: '',
        originalLine: ''
      }
    ])
  }

  function removeOcrItem(itemId) {
    setOcrItems((current) =>
      current.filter(
        (item) => item.id !== itemId
      )
    )
  }

  // ========================================
  // TOTALI OCR
  // ========================================

  const parsedPrices = ocrItems.map(
    (item) => inputToCents(item.priceText)
  )

  const hasInvalidPrices = parsedPrices.some(
    (price) => price === null
  )

  const itemsTotalCents = parsedPrices.reduce(
    (sum, price) => sum + (price || 0),
    0
  )

  const totalsMatch =
    receiptTotalCents !== null &&
    !hasInvalidPrices &&
    itemsTotalCents === receiptTotalCents

  // ========================================
  // APERTURA DIVISIONE
  // ========================================

  function openSplitter() {
    setOcrError('')

    const peopleForSplit =
      editingSavedSplit && splitPeople.length > 0
        ? splitPeople
        : availablePeople

    if (peopleForSplit.length === 0) {
      setOcrError(
        'Aggiungi almeno una persona alla cartella prima di dividere la spesa.'
      )
      return
    }

    if (ocrItems.length === 0) {
      setOcrError(
        'Aggiungi almeno un prodotto prima di proseguire.'
      )
      return
    }

    const cleanedItems = ocrItems.map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      priceCents: inputToCents(item.priceText)
    }))

    if (
      cleanedItems.some(
        (item) =>
          !item.name ||
          item.priceCents === null ||
          item.priceCents < 0
      )
    ) {
      setOcrError(
        'Controlla i prodotti: ogni riga deve avere un nome e un prezzo valido (anche 0,00 € per articoli gratuiti).'
      )
      return
    }

    if (
      receiptTotalCents !== null &&
      !totalsMatch
    ) {
      const confirmed = window.confirm(
        'La somma dei prodotti è diversa dal totale dello scontrino. Vuoi comunque procedere con questi importi?'
      )

      if (!confirmed) {
        return
      }
    }

    setSplitItems(cleanedItems)
    setSplitPeople(peopleForSplit)

    setOcrView(false)
    setSplitView(true)
  }

  // ========================================
  // RIAPERTURA DIVISIONE SALVATA
  // ========================================

  function openSavedDivision() {
    if (
      !savedSplit ||
      !selectedTicket
    ) {
      return
    }

    const restoredItems = Array.isArray(savedSplit.items)
      ? savedSplit.items
      : []

    const restoredPeople = Array.isArray(savedSplit.people)
      ? savedSplit.people
      : []

    setOcrItems(
      restoredItems.map((item) => ({
        ...item,
        priceText: centsToInput(item.priceCents)
      }))
    )

    setSplitItems(restoredItems)
    setSplitPeople(restoredPeople)

    setEditingSavedSplit(true)
    setInitialAllocations(savedSplit.allocations || {})

    setReceiptTotalCents(null)

    setOcrView(false)
    setSplitView(true)
    setOcrError('')
  }

  // ========================================
  // SALVATAGGIO DIVISIONE
  // ========================================

  async function saveDivision({ allocations }) {
    if (!selectedTicket) {
      throw new Error(
        'Ticket non selezionato.'
      )
    }

    const saved = await window.parsmea.splits.save({
      ticketId: selectedTicket.id,
      items: splitItems,
      people: splitPeople,
      allocations
    })

    setSavedSplit(saved)

    setInitialAllocations(
      saved.allocations || {}
    )

    setEditingSavedSplit(false)
    setSplitView(false)
    setOcrView(false)
  }

  function returnToProducts() {
    setSplitView(false)
    setOcrView(true)
  }

  // ========================================
  // INTERFACCIA
  // ========================================

  return (
    <>

      {/* ELENCO TICKET */}

      <section className="panel">
        <div className="panel-header">

          <div>
            <h3>Scontrini</h3>

            <p>
              Crea un ticket per ogni spesa e conserva
              il documento originale.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setError('')
              setShowCreate(true)
            }}
          >
            + Nuovo ticket
          </button>
        </div>

        {loading && (
          <div className="tickets-placeholder">
            Caricamento degli scontrini...
          </div>
        )}

        {error && !showCreate && !selectedTicket && (
          <p style={{ color: '#d64b58' }}>
            {error}
          </p>
        )}

        {!loading && !error && tickets.length === 0 && (
          <div className="tickets-placeholder">
            Nessuno scontrino presente.
            Clicca su Nuovo ticket per iniziare.
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="people-list">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                className="person-row"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                onClick={() => openTicket(ticket)}
              >
                <div className="avatar">
                  ▤
                </div>

                <span>
                  <strong>{ticket.name}</strong>

                  <small
                    style={{
                      display: 'block',
                      marginTop: 5,
                      color: '#98a1b2'
                    }}
                  >
                    {formatDate(ticket.expenseDate)}
                    {' · '}
                    {ticket.originalName}
                  </small>
                </span>

                <span
                  style={{
                    color: '#7161e8',
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  Apri →
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* NUOVO TICKET */}

      {showCreate && (
        <div className="modal-backdrop">

          <form
            className="modal"
            onSubmit={createTicket}
            style={{
              maxWidth: 700,
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto'
            }}
          >
            <h3>Nuovo ticket</h3>

            <p>
              Inserisci i dati della spesa.
              Puoi caricare più fotografie dello
              stesso scontrino.
            </p>

            <label>Nome della spesa</label>

            <input
              value={ticketName}
              onChange={(event) =>
                setTicketName(event.target.value)
              }
              placeholder="Es. Spesa Esselunga"
              required
              autoFocus
            />

            <label>Data della spesa</label>

            <input
              type="date"
              value={expenseDate}
              onChange={(event) =>
                setExpenseDate(event.target.value)
              }
              required
            />

            <label>Foto e documenti dello scontrino</label>

            <button
              type="button"
              className="secondary-button"
              onClick={chooseFiles}
              style={{ marginBottom: 14 }}
            >
              + Seleziona una o più foto / PDF
            </button>

            {createAttachments.length > 0 && (
              <div style={{ marginBottom: 18 }}>

                <p style={{
                  fontSize: 12,
                  color: '#667085'
                }}>
                  {createAttachments.length}
                  {' '}
                  {createAttachments.length === 1
                    ? 'allegato selezionato'
                    : 'allegati selezionati'}.
                  {' '}
                  L'OCR leggerà le immagini
                  dall'alto verso il basso.
                </p>

                <div
                  className="people-list"
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto'
                  }}
                >
                  {createAttachments.map((file, index) => (
                    <div
                      className="person-row"
                      key={file.token}
                      style={{
                        gap: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div className="avatar">
                        {index + 1}
                      </div>

                      <span style={{
                        flex: '1 1 150px',
                        overflowWrap: 'anywhere'
                      }}>
                        {file.originalName}

                        <small style={{
                          display: 'block',
                          marginTop: 4,
                          color: '#98a1b2'
                        }}>
                          {formatFileSize(file.sizeBytes)}
                        </small>
                      </span>

                      <button
                        type="button"
                        className="secondary-button"
                        aria-label={`Sposta ${file.originalName} in alto`}
                        disabled={index === 0}
                        onClick={() =>
                          moveCreateAttachment(index, -1)
                        }
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        aria-label={`Sposta ${file.originalName} in basso`}
                        disabled={
                          index === createAttachments.length - 1
                        }
                        onClick={() =>
                          moveCreateAttachment(index, 1)
                        }
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        className="remove-button"
                        onClick={() =>
                          setCreateAttachments((current) =>
                            current.filter(
                              (entry) => entry.token !== file.token
                            )
                          )
                        }
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p style={{ color: '#d64b58' }}>
                {error}
              </p>
            )}

            <div className="modal-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={closeCreateForm}
                disabled={saving}
              >
                Annulla
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving
                  ? 'Salvataggio...'
                  : 'Crea ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DETTAGLIO TICKET */}

      {selectedTicket && !ocrView && !splitView && (
        <div className="modal-backdrop">

          <div
            className="modal"
            style={{
              maxWidth: 700,
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto'
            }}
          >
            <h3>{selectedTicket.name}</h3>

            <p>
              Spesa del {formatDate(selectedTicket.expenseDate)}
            </p>

            {editing ? (

              <form onSubmit={saveChanges}>

                <label>Nome della spesa</label>

                <input
                  value={editName}
                  onChange={(event) =>
                    setEditName(event.target.value)
                  }
                  required
                />

                <label>Data della spesa</label>

                <input
                  type="date"
                  value={editDate}
                  onChange={(event) =>
                    setEditDate(event.target.value)
                  }
                  required
                />

                <div className="modal-actions">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setEditing(false)
                    }
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    Salva modifiche
                  </button>
                </div>
              </form>

            ) : (

              <>

                {/* DIVISIONE SALVATA */}

                {savedSplitLoading && (
                  <p className="muted">
                    Controllo divisione salvata...
                  </p>
                )}

                {savedSplitError && (
                  <p style={{ color: '#d64b58' }}>
                    Impossibile recuperare la divisione:
                    {' '}
                    {savedSplitError}
                  </p>
                )}

                {savedSplit && (
                  <section
                    style={{
                      background: '#f0fbf5',
                      border: '1px solid #bfe9d0',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 20
                    }}
                  >
                    <h4 style={{
                      color: '#16885f',
                      marginTop: 0
                    }}>
                      ✓ Divisione salvata
                    </h4>

                    <p style={{
                      fontSize: 13,
                      margin: '6px 0 12px'
                    }}>
                      Totale:
                      {' '}
                      <strong>
                        {formatMoney(savedSplit.totalCents)}
                      </strong>
                      {' · '}
                      {savedSplit.items.length} prodotti
                    </p>

                    {savedSplit.totalsByPerson.map((person) => (
                      <div
                        key={person.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          marginBottom: 7,
                          fontSize: 13
                        }}
                      >
                        <span>{person.name}</span>

                        <strong>
                          {formatMoney(person.totalCents)}
                        </strong>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={openSavedDivision}
                      disabled={
                        ocrLoading ||
                        attachmentsBusy ||
                        deleting
                      }
                      style={{
                        width: '100%',
                        marginTop: 10
                      }}
                    >
                      Apri o modifica la divisione salvata
                    </button>

                    <small style={{
                      display: 'block',
                      color: '#667085',
                      marginTop: 9
                    }}>
                      Se aggiungi altre foto, dovrai aggiornare
                      e salvare nuovamente la divisione.
                    </small>
                  </section>
                )}

                {/* FOTOGRAFIE */}

                <div style={{ marginBottom: 18 }}>

                  <h4 style={{ marginBottom: 9 }}>
                    Fotografie dello scontrino
                  </h4>

                  <p style={{
                    fontSize: 12,
                    color: '#667085'
                  }}>
                    L'OCR leggerà tutte le foto
                    nell'ordine indicato qui sotto.
                  </p>

                  {attachmentsLoading && (
                    <p className="muted">
                      Caricamento fotografie...
                    </p>
                  )}

                  {!attachmentsLoading &&
                    attachments.length === 0 && (
                      <p className="muted">
                        Nessun allegato trovato.
                      </p>
                    )}

                  <div
                    className="people-list"
                    style={{
                      maxHeight: 260,
                      overflowY: 'auto'
                    }}
                  >
                    {attachments.map((file, index) => (
                      <div
                        className="person-row"
                        key={file.id}
                        style={{
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 7
                        }}
                      >
                        <div className="avatar">
                          {index + 1}
                        </div>

                        <span style={{
                          flex: '1 1 160px',
                          overflowWrap: 'anywhere'
                        }}>
                          {file.originalName}

                          <small style={{
                            display: 'block',
                            marginTop: 4,
                            color: '#98a1b2'
                          }}>
                            {formatFileSize(file.sizeBytes)}
                          </small>
                        </span>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            viewFile(file.id)
                          }
                          disabled={
                            ocrLoading ||
                            attachmentsBusy ||
                            deleting
                          }
                        >
                          Apri
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          aria-label={`Sposta ${file.originalName} in alto`}
                          onClick={() =>
                            movePhoto(index, -1)
                          }
                          disabled={
                            index === 0 ||
                            ocrLoading ||
                            attachmentsBusy ||
                            deleting
                          }
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          aria-label={`Sposta ${file.originalName} in basso`}
                          onClick={() =>
                            movePhoto(index, 1)
                          }
                          disabled={
                            index === attachments.length - 1 ||
                            ocrLoading ||
                            attachmentsBusy ||
                            deleting
                          }
                        >
                          ↓
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addPhotosToTicket}
                    disabled={
                      ocrLoading ||
                      attachmentsBusy ||
                      attachmentsLoading ||
                      deleting
                    }
                    style={{
                      width: '100%',
                      marginTop: 12
                    }}
                  >
                    {attachmentsBusy
                      ? 'Aggiornamento fotografie...'
                      : '+ Aggiungi fotografie'}
                  </button>
                </div>

                {/* OCR */}

                <button
                  className="primary-button"
                  style={{
                    width: '100%',
                    marginBottom: 12
                  }}
                  onClick={runOcr}
                  disabled={
                    ocrLoading ||
                    attachmentsBusy ||
                    attachmentsLoading ||
                    deleting ||
                    attachments.length === 0
                  }
                >
                  {ocrLoading
                    ? 'Analisi dello scontrino in corso...'
                    : 'Dividi spesa'}
                </button>

                {ocrLoading && (
                  <p style={{
                    textAlign: 'center',
                    color: '#7161e8'
                  }}>
                    Attendi: ParsMea sta leggendo
                    lo scontrino.
                  </p>
                )}

                {ocrError && (
                  <p style={{ color: '#d64b58' }}>
                    {ocrError}
                  </p>
                )}

                <button
                  className="secondary-button"
                  style={{ width: '100%' }}
                  onClick={() =>
                    setEditing(true)
                  }
                  disabled={
                    ocrLoading ||
                    attachmentsBusy ||
                    deleting
                  }
                >
                  Modifica ticket
                </button>

                <button
                  type="button"
                  className="danger-button"
                  style={{
                    width: '100%',
                    marginTop: 12
                  }}
                  disabled={
                    ocrLoading ||
                    attachmentsBusy ||
                    deleting ||
                    attachmentsLoading
                  }
                  onClick={deleteSelectedTicket}
                >
                  {deleting
                    ? 'Eliminazione...'
                    : 'Elimina ticket'}
                </button>

                {error && (
                  <p style={{ color: '#d64b58' }}>
                    {error}
                  </p>
                )}

                <div className="modal-actions">

                  <button
                    className="secondary-button"
                    onClick={closeTicket}
                    disabled={
                      ocrLoading ||
                      attachmentsBusy ||
                      deleting
                    }
                  >
                    Chiudi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* RISULTATI OCR */}

      {selectedTicket && ocrView && !splitView && (
        <div className="modal-backdrop">

          <div
            className="modal"
            style={{
              maxWidth: 780,
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto'
            }}
          >
            <h3>Prodotti riconosciuti</h3>

            <p>
              {selectedTicket.name}
              {' · '}
              {ocrItems.length} prodotti individuati
            </p>

            <div style={{
              padding: 14,
              marginBottom: 20,
              borderRadius: 12,
              background: '#f7f8fc'
            }}>
              <strong>
                Riconoscimento OCR completato
              </strong>

              <p style={{
                margin: '7px 0 0',
                fontSize: 12,
                color: '#8892a7'
              }}>
                Attendibilità generale OCR: {ocrConfidence}%
              </p>

              {ocrAppliedDiscounts.length > 0 && (
                <p style={{
                  margin: '8px 0 0',
                  fontSize: 13,
                  color: '#21875d',
                  fontWeight: 700
                }}>
                  ✓ {ocrAppliedDiscounts.length}
                  {' '}
                  {ocrAppliedDiscounts.length === 1
                    ? 'sconto riconosciuto'
                    : 'sconti riconosciuti'}
                  {' · '}
                  {formatMoney(ocrDiscountTotalCents)}
                  {' '}
                  risparmiati
                </p>
              )}
            </div>

            {ocrUnresolvedDiscounts.length > 0 && (
              <div
                role="alert"
                style={{
                  background: '#fff8ea',
                  border: '1px solid #edcf8a',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 18,
                  color: '#8b5d17'
                }}
              >
                <strong>
                  ⚠ {ocrUnresolvedDiscounts.length}
                  {' '}
                  {ocrUnresolvedDiscounts.length === 1
                    ? 'sconto da verificare'
                    : 'sconti da verificare'}
                </strong>

                <p style={{
                  margin: '8px 0',
                  fontSize: 13
                }}>
                  ParsMea non è riuscita ad associare
                  automaticamente queste righe a un prodotto:
                </p>

                <ul style={{
                  margin: '6px 0 8px',
                  paddingLeft: 22
                }}>
                  {ocrUnresolvedDiscounts.map((line, index) => (
                    <li key={`${line}-${index}`}>
                      {line}
                    </li>
                  ))}
                </ul>

                <small>
                  Controlla lo scontrino originale
                  e correggi manualmente i prezzi.
                </small>
              </div>
            )}

            {/* PRODOTTI MODIFICABILI */}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              {ocrItems.map((item, index) => {

                const discountCents = Number(
                  item.discountCents || 0
                )

                const hasDiscount =
                  Number.isSafeInteger(discountCents) &&
                  discountCents > 0

                const priceEdited =
                  Number.isSafeInteger(item.priceCents) &&
                  item.priceText !== centsToInput(item.priceCents)

                return (
                  <div
                    className="person-row"
                    key={item.id}
                    style={{
                      alignItems: 'flex-start',
                      gap: 10,
                      flexWrap: 'wrap'
                    }}
                  >
                    <span style={{
                      flex: '0 0 24px',
                      color: '#98a1b2',
                      paddingTop: 12
                    }}>
                      {index + 1}.
                    </span>

                    <div style={{
                      flex: '1 1 235px',
                      minWidth: 170
                    }}>
                      <input
                        value={item.name}
                        onChange={(event) =>
                          updateOcrItem(
                            item.id,
                            'name',
                            event.target.value
                          )
                        }
                        placeholder="Nome prodotto"
                        style={{
                          width: '100%',
                          minWidth: 0,
                          marginBottom: 0
                        }}
                      />

                      {hasDiscount && (
                        <div style={{
                          marginTop: 9,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 5
                        }}>
                          <span style={{
                            color: '#8892a7',
                            fontSize: 12
                          }}>
                            Prezzo originale:
                            {' '}
                            <span style={{
                              textDecoration: 'line-through'
                            }}>
                              {formatMoney(item.grossPriceCents)}
                            </span>
                          </span>

                          <span style={{
                            color: '#21875d',
                            fontSize: 12,
                            fontWeight: 700
                          }}>
                            {discountLabel(item)}:
                            {' '}
                            −{formatMoney(discountCents)}
                          </span>

                          {Array.isArray(item.discounts) &&
                            item.discounts.length > 1 && (
                              <details style={{
                                fontSize: 12,
                                color: '#667085'
                              }}>
                                <summary>
                                  Dettaglio sconti
                                </summary>

                                <ul style={{ paddingLeft: 18 }}>
                                  {item.discounts.map(
                                    (discount, discountIndex) => (
                                      <li key={discountIndex}>
                                        {discount.description}:
                                        {' '}
                                        −{formatMoney(
                                          discount.amountCents
                                        )}
                                      </li>
                                    )
                                  )}
                                </ul>
                              </details>
                            )}

                          <span style={{
                            fontSize: 11,
                            color: '#667085'
                          }}>
                            Il prezzo finale da dividere
                            è nella casella a destra.
                          </span>
                        </div>
                      )}

                      {priceEdited && (
                        <small style={{
                          display: 'block',
                          marginTop: 6,
                          color: '#8863d4'
                        }}>
                          Prezzo finale modificato manualmente
                        </small>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <input
                        value={item.priceText}
                        onChange={(event) =>
                          updateOcrItem(
                            item.id,
                            'priceText',
                            event.target.value
                          )
                        }
                        placeholder="0,00"
                        aria-label={`Prezzo finale di ${
                          item.name || `prodotto ${index + 1}`
                        }`}
                        style={{
                          width: 90,
                          marginBottom: 0,
                          textAlign: 'right'
                        }}
                      />

                      <strong>€</strong>
                    </div>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={() =>
                        removeOcrItem(item.id)
                      }
                    >
                      Rimuovi
                    </button>
                  </div>
                )
              })}
            </div>

            {ocrItems.length === 0 && (
              <div className="tickets-placeholder">
                Nessun prodotto individuato automaticamente.
                Puoi aggiungerli manualmente.
              </div>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={addManualItem}
              style={{
                marginTop: 15,
                marginBottom: 20
              }}
            >
              + Aggiungi prodotto
            </button>

            {/* TOTALI */}

            <div style={{
              borderTop: '1px solid #e8eaf1',
              paddingTop: 18
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 10,
                gap: 10
              }}>
                <span>
                  Somma dei prodotti (prezzi finali)
                </span>

                <strong>
                  {formatMoney(itemsTotalCents)}
                </strong>
              </div>

              {ocrAppliedDiscounts.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  gap: 10,
                  color: '#21875d'
                }}>
                  <span>
                    Sconti riconosciuti
                  </span>

                  <strong>
                    −{formatMoney(ocrDiscountTotalCents)}
                  </strong>
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 12,
                gap: 10
              }}>
                <span>
                  Totale letto dallo scontrino
                </span>

                <strong>
                  {receiptTotalCents === null
                    ? 'Non riconosciuto'
                    : formatMoney(receiptTotalCents)}
                </strong>
              </div>

              {hasInvalidPrices ? (
                <p style={{ color: '#d64b58' }}>
                  Controlla i prezzi:
                  almeno un importo non è valido.
                </p>
              ) : receiptTotalCents === null ? (
                <p style={{ color: '#b47d23' }}>
                  Non è stato riconosciuto il totale
                  dello scontrino.
                </p>
              ) : totalsMatch ? (
                <p style={{ color: '#27996b' }}>
                  ✓ I totali corrispondono.
                </p>
              ) : (
                <p style={{ color: '#d64b58' }}>
                  Attenzione: la somma dei prodotti
                  non corrisponde al totale dello scontrino.
                  Controlla gli eventuali sconti non riconosciuti.
                </p>
              )}
            </div>

            {/* TESTO OCR */}

            <details style={{ marginTop: 14 }}>
              <summary style={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}>
                Visualizza testo OCR originale
              </summary>

              <pre style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                background: '#f7f8fc',
                padding: 14,
                borderRadius: 10,
                fontSize: 12
              }}>
                {ocrRawText}
              </pre>
            </details>

            <p style={{
              color: '#98a1b2',
              fontSize: 11,
              marginTop: 20
            }}>
              Le correzioni dei prodotti vengono conservate
              quando completi e salvi la divisione.
              Se chiudi prima di salvare,
              perderai le modifiche non confermate.
            </p>

            {ocrError && (
              <p
                role="alert"
                style={{
                  color: '#d64b58',
                  fontWeight: 700
                }}
              >
                {ocrError}
              </p>
            )}

            <button
              type="button"
              className="primary-button"
              onClick={openSplitter}
              style={{
                width: '100%',
                marginTop: 12
              }}
            >
              Conferma prodotti e dividi spesa →
            </button>

            <div className="modal-actions">

              <button
                className="secondary-button"
                onClick={() =>
                  setOcrView(false)
                }
              >
                ← Torna al ticket
              </button>

              <button
                className="primary-button"
                onClick={closeTicket}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIVISIONE SPESA */}

      {selectedTicket && splitView && (
        <ExpenseSplitter
          items={splitItems}
          people={splitPeople}
          initialAllocations={initialAllocations}
          onCancel={returnToProducts}
          onSave={saveDivision}
        />
      )}

    </>
  )
}