import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
          router: ['react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux']
        }
      }
    },
    sourcemap: false,
    target: 'es2020'
  }
})
