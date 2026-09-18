import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native module: must not be bundled by Vite, loaded via require at runtime.
      external: ['better-sqlite3'],
    },
  },
});
