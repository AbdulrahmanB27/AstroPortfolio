import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Base path is injected by the GitHub Pages workflow (e.g. "/AstroPortfolio/").
// Locally it stays "/" so `vite dev` and `vite preview` behave like the root of a domain.
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Multi-page build: the portfolio and the owner-only admin studio are separate
    // HTML entries so `/admin/` resolves as a real directory index on static hosting.
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        admin: `${root}admin/index.html`,
      },
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          postfx: ['postprocessing', '@react-three/postprocessing'],
        },
      },
    },
  },
  // Honour a harness-assigned PORT; fall back to the fixed ports the capture and e2e
  // scripts target when nothing assigns one.
  server: process.env.PORT
    ? { port: Number(process.env.PORT) }
    : { port: 5173, strictPort: true },
  preview: process.env.PORT
    ? { port: Number(process.env.PORT) }
    : { port: 4173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
