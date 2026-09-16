import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@groupviz/react/theme.css'
import 'katex/dist/katex.min.css'
import './App.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
