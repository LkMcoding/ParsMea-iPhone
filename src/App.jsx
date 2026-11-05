import { useEffect, useState } from 'react'
import TicketManager from './TicketManager.jsx'
import BackupPanel from './BackupPanel.jsx'
import './App.css'

const STORAGE_KEY = 'parsmea-folders-v1'

function loadFolders() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function App() {
  const [folders, setFolders] = useState(loadFolders)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')

  // Nuova cartella
  const [showForm, setShowForm] = useState(false)
  const [folderName, setFolderName] = useState('')

  // Persone da aggiungere alla nuova cartella
  const [pendingPeople, setPendingPeople] = useState([])
  const [personDraft, setPersonDraft] = useState('')
  const [showPersonInput, setShowPersonInput] = useState(false)

  // Nuove persone nelle cartelle esistenti
  const [newPerson, setNewPerson] = useState('')

  // Salvataggio provvisorio delle cartelle
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
  }, [folders])

  const selectedFolder =
    folders.find((folder) => folder.id === selectedId) || null

  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(search.toLowerCase())
  )

  // ========================================
  // CREAZIONE CARTELLE
  // ========================================

  function resetFolderForm() {
    setShowForm(false)
    setFolderName('')
    setPendingPeople([])
    setPersonDraft('')
    setShowPersonInput(false)
  }

  function addPendingPerson() {
    const name = personDraft.trim()

    if (!name) {
      window.alert('Inserisci il nome della persona.')
      return
    }

    const alreadyExists = pendingPeople.some(
      (person) => person.toLowerCase() === name.toLowerCase()
    )

    if (alreadyExists) {
      window.alert('Questa persona è già stata aggiunta.')
      return
    }

    setPendingPeople((current) => [...current, name])
    setPersonDraft('')
    setShowPersonInput(false)
  }

  function removePendingPerson(index) {
    setPendingPeople((current) =>
      current.filter((_, currentIndex) => currentIndex !== index)
    )
  }

  function createFolder(event) {
    event.preventDefault()

    const name = folderName.trim()
    if (!name) return

    if (personDraft.trim()) {
      window.alert(
        'Premi Aggiungi per confermare la persona prima di creare la cartella.'
      )
      return
    }

    const folder = {
      id: makeId(),
      name,
      people: pendingPeople.map((person) => ({
        id: makeId(),
        name: person
      })),
      createdAt: new Date().toISOString()
    }

    setFolders((current) => [folder, ...current])
    setSelectedId(folder.id)
    resetFolderForm()
  }

  // ========================================
  // MODIFICA ED ELIMINAZIONE CARTELLE
  // ========================================

  function renameFolder() {
    if (!selectedFolder) return

    const name = window.prompt(
      'Nuovo nome della cartella:',
      selectedFolder.name
    )

    if (!name || !name.trim()) return

    setFolders((current) =>
      current.map((folder) =>
        folder.id === selectedId
          ? { ...folder, name: name.trim() }
          : folder
      )
    )
  }

  async function deleteFolder() {
    if (!selectedFolder) return

    // Evita di perdere l'accesso ai ticket salvati
    if (!window.parsmea?.tickets) {
      window.alert('Apri ParsMea dalla finestra desktop.')
      return
    }

    try {
      const tickets = await window.parsmea.tickets.list(selectedId)

      if (tickets.length > 0) {
        window.alert(
          'Questa cartella contiene degli scontrini. Per sicurezza non può ancora essere eliminata. Aggiungeremo la gestione dell’eliminazione dei ticket.'
        )
        return
      }
    } catch (error) {
      window.alert(
        'Impossibile verificare i ticket: ' + error.message
      )
      return
    }

    const confirmed = window.confirm(
      `Eliminare la cartella "${selectedFolder.name}"?`
    )

    if (!confirmed) return

    setFolders((current) =>
      current.filter((folder) => folder.id !== selectedId)
    )

    setSelectedId(null)
  }

  // ========================================
  // GESTIONE PERSONE
  // ========================================

  function addPerson(event) {
    event.preventDefault()

    const name = newPerson.trim()
    if (!name || !selectedFolder) return

    const alreadyExists = selectedFolder.people.some(
      (person) => person.name.toLowerCase() === name.toLowerCase()
    )

    if (alreadyExists) {
      window.alert('Questa persona è già presente nella cartella.')
      return
    }

    setFolders((current) =>
      current.map((folder) =>
        folder.id === selectedId
          ? {
              ...folder,
              people: [
                ...folder.people,
                {
                  id: makeId(),
                  name
                }
              ]
            }
          : folder
      )
    )

    setNewPerson('')
  }

  function removePerson(personId) {
    if (!window.confirm('Rimuovere questa persona?')) return

    setFolders((current) =>
      current.map((folder) =>
        folder.id === selectedId
          ? {
              ...folder,
              people: folder.people.filter(
                (person) => person.id !== personId
              )
            }
          : folder
      )
    )
  }

  // ========================================
  // INTERFACCIA
  // ========================================

  return (
    <div className="app-shell">

      {/* BARRA LATERALE */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">P</div>

          <div>
            <h1>ParsMea</h1>
            <span>Ogni spesa, la sua parte.</span>
          </div>
        </div>

        <div className="sidebar-section">
          AREA PERSONALE
        </div>

        <button
          className="nav-button"
          onClick={() => setSelectedId(null)}
        >
          ◫ &nbsp; Le mie cartelle
        </button>

        <div className="sidebar-bottom">
          <span className="status-dot" />
          Archivio locale
        </div>
      </aside>

      {/* CONTENUTO PRINCIPALE */}

      <main className="main-content">

        <header className="topbar">
          <div>
            <span className="eyebrow">
              IL TUO SPAZIO
            </span>

            <h2>
              {selectedFolder
                ? selectedFolder.name
                : 'Le tue cartelle'}
            </h2>

            <p>
              {selectedFolder
                ? 'Gestisci le persone e gli scontrini di questa cartella.'
                : 'Organizza le spese e scegli con chi dividerle.'}
            </p>
          </div>

          {!selectedFolder && (
            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              + Nuova cartella
            </button>
          )}
        </header>

        {/* SCHERMATA CARTELLE */}

        {!selectedFolder ? (
          <>
            <div className="toolbar">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Cerca una cartella..."
              />

              <span>
                {folders.length} cartelle
              </span>
            </div>

            {filteredFolders.length === 0 ? (
              <section className="empty-state">
                <div className="empty-icon">
                  ▤
                </div>

                <h3>
                  {search
                    ? 'Nessuna cartella trovata'
                    : 'Il tuo spazio è pronto'}
                </h3>

                <p>
                  {search
                    ? 'Prova a modificare la ricerca.'
                    : 'Crea la prima cartella e aggiungi le persone con cui condividi le spese.'}
                </p>

                {!search && (
                  <button
                    className="primary-button"
                    onClick={() => setShowForm(true)}
                  >
                    + Crea la prima cartella
                  </button>
                )}
              </section>
            ) : (
              <div className="folder-grid">
                {filteredFolders.map((folder) => (
                  <button
                    key={folder.id}
                    className="folder-card"
                    onClick={() =>
                      setSelectedId(folder.id)
                    }
                  >
                    <div className="folder-symbol">
                      ▤
                    </div>

                    <h3>{folder.name}</h3>

                    <p>
                      {folder.people.length} persone
                    </p>

                    <span>
                      Apri cartella →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (

          /* SCHERMATA INTERNA CARTELLA */

          <div className="folder-details">

            <button
              className="back-button"
              onClick={() => setSelectedId(null)}
            >
              ← Torna alle cartelle
            </button>

            {/* PERSONE DELLA CARTELLA */}

            <section className="panel">

              <div className="panel-header">
                <div>
                  <h3>Persone della cartella</h3>

                  <p>
                    Questi profili saranno disponibili
                    quando dividerai uno scontrino.
                  </p>
                </div>

                <span className="count-badge">
                  {selectedFolder.people.length}
                </span>
              </div>

              <div className="people-list">

                {selectedFolder.people.length === 0 && (
                  <p className="muted">
                    Nessuna persona aggiunta.
                  </p>
                )}

                {selectedFolder.people.map((person) => (
                  <div
                    className="person-row"
                    key={person.id}
                  >
                    <div className="avatar">
                      {person.name.charAt(0).toUpperCase()}
                    </div>

                    <span>
                      {person.name}
                    </span>

                    <button
                      className="remove-button"
                      onClick={() =>
                        removePerson(person.id)
                      }
                    >
                      Rimuovi
                    </button>
                  </div>
                ))}
              </div>

              <form
                className="add-person-form"
                onSubmit={addPerson}
              >
                <input
                  value={newPerson}
                  onChange={(event) =>
                    setNewPerson(event.target.value)
                  }
                  placeholder="Nome della persona"
                  required
                />

                <button
                  className="secondary-button"
                  type="submit"
                >
                  + Aggiungi
                </button>
              </form>
            </section>

            {/* GESTIONE TICKET E SCONTRINI */}

            <TicketManager
              key={selectedFolder.id}
              folderId={selectedFolder.id}
              people={selectedFolder.people}
            />

            {/* AZIONI CARTELLA */}

            <div className="folder-actions">
              <button
                className="secondary-button"
                onClick={renameFolder}
              >
                Rinomina cartella
              </button>

              <button
                className="danger-button"
                onClick={deleteFolder}
              >
                Elimina cartella
              </button>
            </div>
          </div>
        )}
        <BackupPanel />
      </main>

      {/* POPUP NUOVA CARTELLA */}

      {showForm && (
        <div className="modal-backdrop">

          <form
            className="modal"
            onSubmit={createFolder}
          >
            <h3>Nuova cartella</h3>

            <p>
              Dai un nome alla cartella
              e aggiungi le persone.
            </p>

            <label>
              Nome della cartella
            </label>

            <input
              value={folderName}
              onChange={(event) =>
                setFolderName(event.target.value)
              }
              placeholder="Es. Spese Casa"
              required
              autoFocus
            />

            {/* AGGIUNTA PERSONE */}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 15
              }}
            >
              <label style={{ marginBottom: 0 }}>
                Persone
              </label>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowPersonInput(true)
                }
              >
                + Aggiungi persona
              </button>
            </div>

            {/* ELENCO PERSONE AGGIUNTE */}

            {pendingPeople.length > 0 && (
              <div
                className="people-list"
                style={{ marginBottom: 18 }}
              >
                {pendingPeople.map((person, index) => (
                  <div
                    className="person-row"
                    key={`${person}-${index}`}
                  >
                    <div className="avatar">
                      {person.charAt(0).toUpperCase()}
                    </div>

                    <span>
                      {person}
                    </span>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={() =>
                        removePendingPerson(index)
                      }
                    >
                      Rimuovi
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CAMPO INSERIMENTO PERSONA */}

            {showPersonInput && (
              <div
                className="add-person-form"
                style={{
                  marginTop: 0,
                  marginBottom: 20
                }}
              >
                <input
                  value={personDraft}
                  onChange={(event) =>
                    setPersonDraft(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addPendingPerson()
                    }
                  }}
                  placeholder="Nome della persona"
                  style={{ marginBottom: 0 }}
                  autoFocus
                />

                <button
                  type="button"
                  className="primary-button"
                  onClick={addPendingPerson}
                >
                  Aggiungi
                </button>
              </div>
            )}

            <small style={{ marginTop: 0 }}>
              Aggiungi una persona alla volta.
              Puoi rimuoverla prima di creare
              la cartella.
            </small>

            {/* PULSANTI FINALI */}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={resetFolderForm}
              >
                Annulla
              </button>

              <button
                className="primary-button"
                type="submit"
              >
                Crea cartella
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default App
