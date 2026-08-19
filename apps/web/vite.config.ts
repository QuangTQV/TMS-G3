import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 0.0.0.0 để VS Code Remote / port-forwarding truy cập được từ máy khác, không chỉ
  // loopback của máy chạy dev server.
  server: {
    host: '0.0.0.0',
  },
})
