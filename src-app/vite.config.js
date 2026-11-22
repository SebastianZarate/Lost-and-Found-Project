import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, '.'),
  base: './',
  plugins: [react()],
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, '../app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5500',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: resolve(__dirname, 'src/testSetup.js'),
  },
});
