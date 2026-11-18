import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'axios'],
          motion: ['framer-motion']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1/platform': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:4007',
        changeOrigin: true
      }
    }
  }
});
