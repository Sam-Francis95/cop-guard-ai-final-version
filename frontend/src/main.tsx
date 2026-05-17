import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mockFetch.ts' // MOCK BACKEND FOR DEMO DEPLOYMENT
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
