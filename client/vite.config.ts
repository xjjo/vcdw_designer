import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));
// The shared design model lives one level up so client and server share it.
const sharedPath = resolve(rootDir, '..', 'shared');

export default defineConfig({
  plugins: [react()],
  // The pinned esbuild build cannot down-level some syntax; emit modern output.
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  build: { target: 'esnext' },
  resolve: {
    alias: {
      '@shared': sharedPath,
    },
  },
  server: {
    port: 5173,
    fs: {
      // allow importing the sibling ../shared folder
      allow: [rootDir, sharedPath],
    },
    proxy: {
      '/api': 'http://localhost:5177',
    },
  },
});
