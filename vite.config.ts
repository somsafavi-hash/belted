import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/belted/ on GitHub Pages.
export default defineConfig({
  base: '/belted/',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts', 'server/**/*.test.ts'] },
});
