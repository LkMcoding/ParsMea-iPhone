import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Su GitHub Pages la cartella base coincide con il nome del repository.
// In sviluppo locale rimane '/'.
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const publishedBase = process.env.GITHUB_ACTIONS === 'true' && repositoryName
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  plugins: [react()],
  base: publishedBase,
})
