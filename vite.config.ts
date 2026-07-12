import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // allow tunnel hosts (trycloudflare etc.) for phone testing
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    target: 'es2020',
  },
});
