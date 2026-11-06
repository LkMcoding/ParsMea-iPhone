// Preparazione locale delle fotografie per Tesseract. Nessun upload.
// Il riconoscimento dei bordi lavora su una miniatura: il file originale
// non viene mai modificato nell'archivio di ParsMea.

const MAX_WORK_PIXELS = 3_200_000
const DETECTION_LONG_EDGE = 520

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value))
}

function brightnessAt(data, offset) {
  return (data[offset] * 77 + data[offset + 1] * 150 + data[offset + 2] * 29) >> 8
}

/**
 * Individua una pagina chiara su uno sfondo più scuro o colorato.
 * Restituisce coordinate riferite all'immagine fornita oppure null.
 * In caso di sfondo bianco/ambiguo non si forza un ritaglio rischioso.
 */
export function detectReceiptBounds(data, width, height) {
  if (!data || width < 40 || height < 40 || data.length < width * height * 4) return null

  const histogram = new Uint32Array(256)
  const light = new Uint8Array(width * height)
  for (let p = 0, i = 0; p < light.length; p++, i += 4) {
    const y = brightnessAt(data, i)
    light[p] = y
    histogram[y]++
  }

  // Separazione automatica tra scontrino e sfondo (Otsu).
  const total = width * height
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let backgroundWeight = 0
  let backgroundSum = 0
  let bestVariance = -1
  let threshold = 180
  for (let i = 0; i < 256; i++) {
    backgroundWeight += histogram[i]
    if (!backgroundWeight || backgroundWeight === total) continue
    backgroundSum += i * histogram[i]
    const foregroundWeight = total - backgroundWeight
    const diff = backgroundSum / backgroundWeight - (sum - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * diff * diff
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = i
    }
  }
  threshold = clamp(threshold + 14, 165, 222)

  const marked = new Uint8Array(total)
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    if (light[p] >= threshold && max - min <= 60) marked[p] = 1
  }

  const queue = new Int32Array(total)
  let best = null

  for (let start = 0; start < total; start++) {
    if (marked[start] !== 1) continue
    marked[start] = 2
    let head = 0
    let tail = 1
    queue[0] = start
    let left = width
    let right = 0
    let top = height
    let bottom = 0
    while (head < tail) {
      const pos = queue[head++]
      const x = pos % width
      const y = Math.floor(pos / width)
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y

      if (x > 0 && marked[pos - 1] === 1) { marked[pos - 1] = 2; queue[tail++] = pos - 1 }
      if (x + 1 < width && marked[pos + 1] === 1) { marked[pos + 1] = 2; queue[tail++] = pos + 1 }
      if (y > 0 && marked[pos - width] === 1) { marked[pos - width] = 2; queue[tail++] = pos - width }
      if (y + 1 < height && marked[pos + width] === 1) { marked[pos + width] = 2; queue[tail++] = pos + width }
    }

    const regionWidth = right - left + 1
    const regionHeight = bottom - top + 1
    const fraction = tail / total
    const fill = tail / (regionWidth * regionHeight)
    const ratio = regionHeight / regionWidth

    if (fraction < 0.075 || fill < 0.32 ||
        regionWidth < width * 0.18 || regionHeight < height * 0.28 ||
        ratio < 0.95 || ratio > 7.0) continue

    const score = tail * clamp(ratio, 1, 2.5)
    if (!best || score > best.score) {
      best = { x: left, y: top, width: regionWidth, height: regionHeight, score }
    }
  }
  if (!best) return null

  const padX = Math.max(3, Math.round(best.width * 0.025))
  const padY = Math.max(3, Math.round(best.height * 0.015))
  return {
    x: clamp(best.x - padX, 0, width - 1),
    y: clamp(best.y - padY, 0, height - 1),
    width: Math.min(width - clamp(best.x - padX, 0, width - 1), best.width + 2 * padX),
    height: Math.min(height - clamp(best.y - padY, 0, height - 1), best.height + 2 * padY)
  }
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return { image: bitmap, release: () => bitmap.close() }
    } catch {
      // In alcune versioni di Safari createImageBitmap non gestisce il formato.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => resolve({
      image,
      release: () => URL.revokeObjectURL(url)
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossibile aprire la fotografia dello scontrino.'))
    }
    image.src = url
  })
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function contrastGray(source) {
  const { width, height } = source
  const result = makeCanvas(width, height)
  const context = result.getContext('2d', { willReadFrequently: true })
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, width, height)
  const values = image.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < values.length; i += 4) hist[brightnessAt(values, i)]++
  const total = width * height
  let low = 0
  let high = 255
  let accumulated = 0
  for (let i = 0; i < 256; i++) {
    accumulated += hist[i]
    if (accumulated >= total * 0.01) { low = i; break }
  }
  accumulated = 0
  for (let i = 0; i < 256; i++) {
    accumulated += hist[i]
    if (accumulated >= total * 0.92) { high = i; break }
  }
  const scale = 255 / Math.max(70, high - low)
  for (let i = 0; i < values.length; i += 4) {
    const v = clamp(Math.round((brightnessAt(values, i) - low) * scale), 0, 255)
    values[i] = values[i + 1] = values[i + 2] = v
  }
  context.putImageData(image, 0, 0)
  return result
}

function adaptiveGray(source) {
  const { width, height } = source
  const result = makeCanvas(width, height)
  const context = result.getContext('2d', { willReadFrequently: true })
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, width, height)
  const values = image.data
  // Integral image for a fast local background estimate.
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      rowSum += brightnessAt(values, offset)
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum
    }
  }
  const radius = Math.max(12, Math.round(width / 68))
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const area = (x1 - x0) * (y1 - y0)
      const background = (integral[y1 * stride + x1] - integral[y0 * stride + x1] -
        integral[y1 * stride + x0] + integral[y0 * stride + x0]) / area
      const offset = (y * width + x) * 4
      const foreground = background - brightnessAt(values, offset)
      const v = foreground <= 11 ? 255 : clamp(Math.round(255 - (foreground - 11) * 6.2), 0, 255)
      values[offset] = values[offset + 1] = values[offset + 2] = v
    }
  }
  context.putImageData(image, 0, 0)
  return result
}

export async function prepareReceiptImages(blob) {
  const decoded = await decodeImage(blob)
  try {
    const srcWidth = decoded.image.width || decoded.image.naturalWidth
    const srcHeight = decoded.image.height || decoded.image.naturalHeight
    const detectionScale = Math.min(1, DETECTION_LONG_EDGE / Math.max(srcWidth, srcHeight))
    const mini = makeCanvas(
      Math.max(1, Math.round(srcWidth * detectionScale)),
      Math.max(1, Math.round(srcHeight * detectionScale))
    )
    const miniContext = mini.getContext('2d', { willReadFrequently: true })
    miniContext.drawImage(decoded.image, 0, 0, mini.width, mini.height)
    const data = miniContext.getImageData(0, 0, mini.width, mini.height)
    const bounds = detectReceiptBounds(data.data, mini.width, mini.height)
    const crop = bounds ? {
      x: bounds.x / mini.width * srcWidth,
      y: bounds.y / mini.height * srcHeight,
      width: bounds.width / mini.width * srcWidth,
      height: bounds.height / mini.height * srcHeight
    } : { x: 0, y: 0, width: srcWidth, height: srcHeight }
    mini.width = mini.height = 0

    // Ingrandisce la stampa minuta senza superare la memoria di Safari.
    const targetScale = Math.min(
      2.35,
      1450 / crop.width,
      Math.sqrt(MAX_WORK_PIXELS / (crop.width * crop.height))
    )
    const work = makeCanvas(
      Math.max(1, Math.round(crop.width * targetScale)),
      Math.max(1, Math.round(crop.height * targetScale))
    )
    work.getContext('2d', { alpha: false }).drawImage(
      decoded.image, crop.x, crop.y, crop.width, crop.height,
      0, 0, work.width, work.height
    )
    const contrast = contrastGray(work)
    const adaptive = adaptiveGray(work)
    return {
      original: work,
      contrast,
      adaptive,
      cropped: Boolean(bounds),
      release() {
        work.width = work.height = 0
        contrast.width = contrast.height = 0
        adaptive.width = adaptive.height = 0
      }
    }
  } finally {
    decoded.release()
  }
}
