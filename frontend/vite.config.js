import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/datasets': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/summary': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/run-automl': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/predict': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/notebook': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/report': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/model': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
