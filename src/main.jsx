import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './browserParsmea.js'
import App from './App.jsx'

// L'app resta disponibile anche senza rete dopo il primo caricamento.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.warn('Cache offline non disponibile:', error))
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
