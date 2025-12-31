import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl' // 👈 追加1

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // 👈 追加2
  ],
})