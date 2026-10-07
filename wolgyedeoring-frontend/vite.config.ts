import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 디자인 토큰 원본(docs/ui-handoff/design/tokens.css)을 복사하지 않고 직접 import 하기 위해 상위 폴더 허용
    fs: { allow: ['..'] },
  },
})
