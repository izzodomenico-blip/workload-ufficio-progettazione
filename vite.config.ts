import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor React in un chunk stabile: alleggerisce il bundle iniziale
        // e migliora il caching (cambia raramente tra una build e l'altra).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-dom/client'],
        },
      },
    },
  },
})
