/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves from /<repo>/; PR previews from /<repo>/pr-preview/pr-N/.
// CI passes the exact path via BASE_PATH; local dev uses '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    // Separates IndexedDB per deploy channel so previews never touch production data.
    __DEPLOY_CHANNEL__: JSON.stringify(process.env.DEPLOY_CHANNEL ?? 'local'),
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/unit/setup.ts'],
    coverage: { include: ['src/domain/**'] },
  },
});
