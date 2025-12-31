import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// basicSsl は削除します
export default defineConfig({
  plugins: [
    react()
    // basicSsl() も削除
  ],
})