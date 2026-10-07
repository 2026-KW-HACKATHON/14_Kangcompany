import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '../../docs/ui-handoff/design/tokens.css' // 디자인 토큰 원본 (복사하지 않음)
// 화면 시안 스타일 (docs/ui-handoff/full-ui 4.12.1 → .phone 을 .app 으로 바꿔 복사)
import './styles/proto/app.css'
import './styles/proto/components-emphasis.css'
import './styles/proto/components-icons-navigation.css'
import './styles/proto/experience.css'
import './styles/proto/controls.css'
import './styles/proto/hub.css'
import './styles/proto/calendar-selection.css'
import './styles/proto/seating.css'
import './styles/proto/segmented-controls.css'
import './styles/proto/a2.css'
import './styles/shell.css'
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
