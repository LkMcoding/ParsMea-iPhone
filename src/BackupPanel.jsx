import { useState } from 'react'
import { exportBackup, importBackup } from './browserBackup.js'

export default function BackupPanel() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run(action) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (action === exportBackup) {
        setMessage(`Backup pronto: ${result.tickets} ticket, ${result.attachments} allegati.`)
      }
    } catch (error) {
      setMessage(error.message || 'Operazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <h3>Backup iPhone</h3>
      <p>Le spese restano su questo dispositivo. Salva periodicamente una copia nei File del telefono.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button className="secondary-button" type="button" disabled={busy}
          onClick={() => run(exportBackup)}>
          Esporta backup
        </button>
        <button className="secondary-button" type="button" disabled={busy}
          onClick={() => run(importBackup)}>
          Ripristina backup
        </button>
      </div>
      {message && <p role="status" style={{ marginTop: 12, color: '#6c59e8' }}>{message}</p>}
    </section>
  )
}
