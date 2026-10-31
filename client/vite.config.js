
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// AEMA frontend development configuration
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
