import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Lắng nghe trên tất cả địa chỉ mạng (0.0.0.0) để truy cập qua LAN
    port: 5173,
  },
})
