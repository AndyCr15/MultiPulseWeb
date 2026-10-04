import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installAuthRefresh } from './lib/auth'
import './index.css'

// Keep MultiPulse apiToken fresh via Google when another device rotates it.
installAuthRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
