
// ========================================
// PARSMEA - MOTORE DI DIVISIONE SPESE
// ========================================

// Divide un importo espresso in centesimi
// secondo pesi interi (es. 1 e 2 per 1/3 e 2/3).

export function distributeCents(amountCents, weights) {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0
  ) {
    throw new Error('Importo non valido.')
  }

  if (
    !Array.isArray(weights) ||
    weights.length === 0 ||
    weights.some(
      (weight) =>
        !Number.isSafeInteger(weight) || weight <= 0
    )
  ) {
    throw new Error('Proporzioni di divisione non valide.')
  }

  const totalWeight = weights.reduce(
    (sum, weight) => sum + BigInt(weight),
    0n
  )

  const numerators = weights.map(
    (weight) => BigInt(amountCents) * BigInt(weight)
  )

  const shares = numerators.map(
    (numerator) => Number(numerator / totalWeight)
  )

  const assignedCents = shares.reduce(
    (sum, value) => sum + value,
    0
  )

  const remainingCents = amountCents - assignedCents

  // Distribuisce i centesimi residui in modo deterministico.
  const ranking = numerators
    .map((numerator, index) => ({
      index,
      remainder: numerator % totalWeight
    }))
    .sort((a, b) => {
      if (a.remainder === b.remainder) {
        return a.index - b.index
      }

      return a.remainder > b.remainder ? -1 : 1
    })

  for (let i = 0; i < remainingCents; i++) {
    shares[ranking[i].index] += 1
  }

  return shares
}

// ========================================
// CALCOLO COMPLESSIVO PER PERSONA
// ========================================

// items: prodotti con id e priceCents
// people: persone della cartella con id e name
//
// allocations:
// {
//   [itemId]: {
//     personIds: ['id-persona-1', 'id-persona-2'],
//     weights: {
//       'id-persona-1': 1,
//       'id-persona-2': 2
//     }
//   }
// }

export function calculateSplit(items, people, allocations) {
  const totals = Object.fromEntries(
    people.map((person) => [person.id, 0])
  )

  const validPeople = new Set(
    people.map((person) => person.id)
  )

  const unassignedItems = []
  const invalidItems = []
  const itemSplits = {}

  for (const item of items) {
    if (
      !Number.isSafeInteger(item.priceCents) ||
      item.priceCents < 0
    ) {
      invalidItems.push(item.id)
      continue
    }

    const rule = allocations[item.id]

    if (
      !rule ||
      !Array.isArray(rule.personIds) ||
      rule.personIds.length === 0
    ) {
      unassignedItems.push(item.id)
      continue
    }

    const personIds = [...new Set(rule.personIds)]

    if (
      personIds.some((id) => !validPeople.has(id))
    ) {
      invalidItems.push(item.id)
      continue
    }

    const weights = personIds.map(
      (id) => rule.weights?.[id] ?? 1
    )

    if (
      weights.some(
        (weight) =>
          !Number.isSafeInteger(weight) || weight <= 0
      )
    ) {
      invalidItems.push(item.id)
      continue
    }

    const shares = distributeCents(
      item.priceCents,
      weights
    )

    itemSplits[item.id] = {}

    personIds.forEach((personId, index) => {
      const amount = shares[index]

      totals[personId] += amount
      itemSplits[item.id][personId] = amount
    })
  }

  const complete =
    items.length > 0 &&
    unassignedItems.length === 0 &&
    invalidItems.length === 0

  const allocatedTotalCents = Object.values(totals).reduce(
    (sum, amount) => sum + amount,
    0
  )

  const originalTotalCents = items.reduce(
    (sum, item) =>
      sum + (
        Number.isSafeInteger(item.priceCents)
          ? item.priceCents
          : 0
      ),
    0
  )

  return {
    totals,
    itemSplits,
    unassignedItems,
    invalidItems,
    complete,
    allocatedTotalCents,
    originalTotalCents
  }
}

// ========================================
// FORMATTAZIONE EURO
// ========================================

export function formatEuro(cents) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
}
