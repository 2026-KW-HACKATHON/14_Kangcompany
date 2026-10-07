import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '../../docs/ui-handoff/design/tokens.css' // 디자인 토큰 원본 (복사하지 않음)
import './styles/app.css'
import App from './App'
import { SessionProvider } from './app/session'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
