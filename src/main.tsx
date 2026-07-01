import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

// Apply stored theme color before render to avoid flash
const storedColor = localStorage.getItem('pipely-primary-color')
if (storedColor) {
  document.documentElement.style.setProperty('--color-primary', storedColor)
  document.documentElement.style.setProperty('--color-ring', storedColor)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
