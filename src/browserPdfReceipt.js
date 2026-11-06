// PDF.js gira interamente in Safari; il documento non lascia il dispositivo.
// Modulo caricato solo quando un ticket contiene un PDF.
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PAGES = 25
const MAX_BYTES = 30 * 1024 * 1024
const MAX_RENDER_PIXELS = 3_500_000

function textItemsToLines(items) {
  const rows = new Map()
  for (const item of items) {
    const content = String(item.str || '')
    const x = item.transform?.[4]
    const y = item.transform?.[5]
    if (!content || !Number.isFinite(x) || !Number.isFinite(y)) continue
    const row = Math.round(y)
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row).push({ x, content })
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, words]) => words.sort((a, b) => a.x - b.x)
      .map((word) => word.content).join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

async function withPdf(blob, callback) {
  if (!blob || blob.size > MAX_BYTES) {
    throw new Error('Il PDF supera il limite di 30 MB o non è valido.')
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true
  })
  try {
    const document = await loadingTask.promise
    if (document.numPages < 1 || document.numPages > MAX_PAGES) {
      throw new Error(`Il PDF deve contenere da 1 a ${MAX_PAGES} pagine.`)
    }
    return await callback(document)
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('PDF protetto da password: utilizza una copia non protetta.')
    }
    throw error
  } finally {
    await loadingTask.destroy()
  }
}

export function extractBrowserPdfText(blob) {
  return withPdf(blob, async (document) => {
    const pageTexts = []
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      try {
        pageTexts.push(textItemsToLines((await page.getTextContent()).items))
      } finally {
        page.cleanup()
      }
    }
    return pageTexts
  })
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((result) => {
    if (result) resolve(result)
    else reject(new Error('Non riesco a convertire questa pagina PDF in immagine.'))
  }, 'image/png'))
}

export function renderBrowserPdfPages(blob) {
  return withPdf(blob, async (document) => {
    const images = []
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      const canvas = window.document.createElement('canvas')
      try {
        const size = page.getViewport({ scale: 1 })
        const area = size.width * size.height
        if (!Number.isFinite(area) || area <= 0) {
          throw new Error('La pagina PDF contiene dimensioni non valide.')
        }
        const scale = Math.min(2.5, Math.sqrt(MAX_RENDER_PIXELS / area))
        const viewport = page.getViewport({ scale })
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas non disponibile su questo dispositivo.')
        await page.render({ canvasContext: context, canvas, viewport }).promise
        images.push(await canvasToBlob(canvas))
      } finally {
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
    }
    return images
  })
}
