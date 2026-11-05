
import { useMemo, useState } from 'react'
import { calculateSplit, distributeCents, formatEuro } from './splitMath'

const colors = {
  purple: '#6c59e8',
  dark: '#192443',
  muted: '#8490aa',
  border: '#e5e8f2',
  pale: '#f6f7fc',
  green: '#16885f',
  red: '#cc4357'
}

function getSelected(allocation) {
  return Array.isArray(allocation?.personIds) ? allocation.personIds : []
}

function getWeights(allocation, selected) {
  return selected.map((id) => Number(allocation?.weights?.[id] ?? 1))
}

function itemShares(item, people, allocation) {
  const selected = getSelected(allocation)
  if (selected.length === 0) return []

  const weights = getWeights(allocation, selected)
  if (!weights.every((weight) => Number.isSafeInteger(weight) && weight > 0)) {
    return []
  }

  try {
    const shares = distributeCents(item.priceCents, weights)
    return selected.map((id, index) => ({
      id,
      name: people.find((person) => person.id === id)?.name || 'Persona',
      cents: shares[index]
    }))
  } catch {
    return []
  }
}

export default function ExpenseSplitter({
  items = [],
  people = [],
  initialAllocations = {},
  onCancel,
  onSave
}) {
  const [allocations, setAllocations] = useState(initialAllocations)
  const [showSummary, setShowSummary] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const result = useMemo(() => {
    try {
      return { value: calculateSplit(items, people, allocations), error: '' }
    } catch (error) {
      return { value: null, error: error.message || 'Impossibile calcolare le quote.' }
    }
  }, [items, people, allocations])

  const missingItems = items.filter((item) => getSelected(allocations[item.id]).length === 0)
  const invalidItems = items.filter((item) => {
    const selected = getSelected(allocations[item.id])
    return selected.length > 0 && getWeights(allocations[item.id], selected)
      .some((weight) => !Number.isSafeInteger(weight) || weight <= 0)
  })

  const canCalculate = people.length > 0 && items.length > 0 &&
    missingItems.length === 0 && invalidItems.length === 0 &&
    !result.error && result.value?.complete === true

  const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0)

  const totalsByPerson = useMemo(() => {
    const totals = new Map(people.map((person) => [person.id, 0]))
    for (const item of items) {
      for (const share of itemShares(item, people, allocations[item.id])) {
        totals.set(share.id, (totals.get(share.id) || 0) + share.cents)
      }
    }
    return people.map((person) => ({
      ...person,
      totalCents: totals.get(person.id) || 0
    }))
  }, [items, people, allocations])

  function changeAllocation(itemId, personIds, weights) {
    setAllocations((current) => ({
      ...current,
      [itemId]: { personIds, weights }
    }))
    setShowSummary(false)
    setMessage('')
  }

  function assignOne(itemId, personId) {
    changeAllocation(itemId, [personId], { [personId]: 1 })
  }

  function togglePerson(itemId, personId) {
    const selected = getSelected(allocations[itemId])
    const next = selected.includes(personId)
      ? selected.filter((id) => id !== personId)
      : [...selected, personId]

    // Quando cambia la selezione, ripartiamo da quote uguali.
    changeAllocation(itemId, next, Object.fromEntries(next.map((id) => [id, 1])))
  }

  function equalParts(itemId, ids) {
    if (ids.length === 0) {
      setMessage('Seleziona almeno una persona per dividere il prodotto.')
      return
    }
    changeAllocation(itemId, ids, Object.fromEntries(ids.map((id) => [id, 1])))
  }

  function thirdParts(itemId, ids, reverse = false) {
    if (ids.length !== 2) return
    changeAllocation(itemId, ids, {
      [ids[0]]: reverse ? 2 : 1,
      [ids[1]]: reverse ? 1 : 2
    })
  }

  function changeWeight(itemId, personId, value) {
    const current = allocations[itemId]
    const ids = getSelected(current)
    const numeric = value === '' ? 0 : Number(value)
    changeAllocation(itemId, ids, {
      ...(current?.weights || {}),
      [personId]: numeric
    })
  }

  function calculate() {
    if (!canCalculate) {
      if (missingItems.length > 0) {
        setMessage(`Mancano ${missingItems.length} prodotti da assegnare. Controlla le righe evidenziate.`)
      } else if (invalidItems.length > 0) {
        setMessage('Controlla le quote personalizzate: devono essere numeri interi maggiori di zero.')
      } else {
        setMessage(result.error || 'Controlla i prodotti e le persone prima di calcolare.')
      }
      setShowSummary(false)
      return
    }

    setMessage('')
    setShowSummary(true)
  }

  async function save() {
    if (!canCalculate || !showSummary) {
      calculate()
      return
    }
    if (typeof onSave !== 'function') {
      setMessage('Il salvataggio del ticket sarà collegato nel prossimo passaggio.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await onSave({ allocations, totalsByPerson, totalCents })
    } catch (error) {
      setMessage(error.message || 'Non è stato possibile salvare la divisione.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{
        maxWidth: 900,
        width: 'min(900px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto'
      }}>
        <h3>Dividi la spesa</h3>
        <p>Assegna ogni prodotto alle persone della cartella, poi calcola gli importi.</p>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: colors.pale,
          padding: 14,
          borderRadius: 12,
          marginBottom: 18
        }}>
          <strong>{items.length} prodotti</strong>
          <strong>{people.length} persone</strong>
          <strong>Totale: {formatEuro(totalCents)}</strong>
        </div>

        {people.length === 0 && (
          <p role="alert" style={{ color: colors.red }}>
            Non ci sono persone in questa cartella. Aggiungile prima di dividere la spesa.
          </p>
        )}

        {items.map((item, index) => {
          const selected = getSelected(allocations[item.id])
          const allocation = allocations[item.id]
          const shares = itemShares(item, people, allocation)
          const missing = selected.length === 0
          const invalid = invalidItems.some((entry) => entry.id === item.id)

          return (
            <section key={item.id} style={{
              border: `1px solid ${missing || invalid ? '#f1c2ca' : colors.border}`,
              borderRadius: 14,
              padding: 16,
              marginBottom: 14,
              background: missing || invalid ? '#fffafb' : '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <strong style={{ color: colors.dark }}>{index + 1}. {item.name}</strong>
                  {missing && <small style={{ display: 'block', color: colors.red, marginTop: 4 }}>Da assegnare</small>}
                  {invalid && <small style={{ display: 'block', color: colors.red, marginTop: 4 }}>Quote da correggere</small>}
                </div>
                <strong style={{ whiteSpace: 'nowrap', color: colors.purple }}>
                  {formatEuro(item.priceCents)}
                </strong>
              </div>

              <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                ASSEGNA TUTTO A UNA PERSONA
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}>
                {people.map((person) => {
                  const chosen = selected.length === 1 && selected[0] === person.id
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => assignOne(item.id, person.id)}
                      style={{
                        border: `1px solid ${chosen ? colors.purple : colors.border}`,
                        background: chosen ? '#efedff' : '#fff',
                        color: chosen ? colors.purple : colors.dark,
                        borderRadius: 9,
                        padding: '8px 11px',
                        cursor: 'pointer',
                        fontWeight: chosen ? 700 : 500
                      }}
                    >
                      {chosen ? '✓ ' : ''}{person.name}
                    </button>
                  )
                })}
              </div>

              <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                OPPURE DIVIDI TRA PIÙ PERSONE
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                {people.map((person) => (
                  <label key={person.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: colors.dark
                  }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(person.id)}
                      onChange={() => togglePerson(item.id, person.id)}
                      style={{ margin: 0 }}
                    />
                    {person.name}
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <button type="button" className="secondary-button" onClick={() => equalParts(item.id, selected)}>
                  {selected.length === 2 ? 'Smezza 50/50' : 'Parti uguali tra selezionati'}
                </button>
                <button type="button" className="secondary-button" onClick={() => equalParts(item.id, people.map((person) => person.id))}>
                  Parti uguali tra tutti
                </button>
                {selected.length === 2 && (
                  <>
                    <button type="button" className="secondary-button" onClick={() => thirdParts(item.id, selected)}>
                      1/3 a {people.find((person) => person.id === selected[0])?.name || 'prima persona'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => thirdParts(item.id, selected, true)}>
                      2/3 a {people.find((person) => person.id === selected[0])?.name || 'prima persona'}
                    </button>
                  </>
                )}
              </div>

              {selected.length > 1 && (
                <div style={{
                  padding: 12,
                  borderRadius: 10,
                  background: colors.pale,
                  marginTop: 10
                }}>
                  <div style={{ color: colors.muted, fontSize: 12, marginBottom: 9 }}>
                    Quote personalizzate: 1 = una parte, 2 = due parti, ecc.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {selected.map((id) => (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                        {people.find((person) => person.id === id)?.name || 'Persona'}
                        <input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`Quota di ${people.find((person) => person.id === id)?.name || 'Persona'}`}
                          value={allocation?.weights?.[id] ?? 1}
                          onChange={(event) => changeWeight(item.id, id, event.target.value)}
                          style={{ width: 65, marginBottom: 0 }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {shares.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {shares.map((share) => (
                    <span key={share.id} style={{
                      borderRadius: 8,
                      background: '#edfbf4',
                      color: colors.green,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700
                    }}>
                      {share.name}: {formatEuro(share.cents)}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {message && <p role="alert" style={{ color: colors.red, fontWeight: 700 }}>{message}</p>}

        <button type="button" className="primary-button" onClick={calculate} style={{ width: '100%', marginTop: 8 }}>
          Calcola importi separati
        </button>

        {showSummary && canCalculate && (
          <section style={{ marginTop: 20, borderTop: `1px solid ${colors.border}`, paddingTop: 20 }}>
            <h3>Riepilogo del ticket</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              {totalsByPerson.map((person) => (
                <div key={person.id} style={{
                  padding: 16,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  background: colors.pale
                }}>
                  <div style={{ fontSize: 13, color: colors.muted }}>{person.name}</div>
                  <strong style={{ display: 'block', fontSize: 23, color: colors.purple, marginTop: 5 }}>
                    {formatEuro(person.totalCents)}
                  </strong>
                </div>
              ))}
            </div>
            <p style={{ color: colors.green, fontWeight: 700, marginTop: 12 }}>
              ✓ Tutti i prodotti assegnati. Totale: {formatEuro(totalCents)}.
            </p>
            <button type="button" className="primary-button" disabled={saving} onClick={save}>
              {saving ? 'Salvataggio...' : 'Salva divisione nel ticket'}
            </button>
          </section>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
            ← Torna ai prodotti
          </button>
        </div>
      </div>
    </div>
  )
}



