import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // Keep engine libraries in their own long-lived chunks so gameplay code
        // changes don't invalidate the (large) vendor downloads.
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
          postfx: ['postprocessing', 'n8ao'],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
