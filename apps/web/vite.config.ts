import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // host 写死 127.0.0.1：默认的 'localhost' 在 Node 18+ 会解析成 ::1（只监听 IPv6），
  // 而 verify/e2e/* 一律按 `http://127.0.0.1:5273` 连（见 verify/README.md）。
  server: { host: '127.0.0.1', port: 5273, strictPort: false },
})
