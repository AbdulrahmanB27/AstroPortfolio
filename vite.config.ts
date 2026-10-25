import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Base path is injected by the GitHub Pages workflow: "/" when public/CNAME exists (the
// custom domain, abdulrahmanbahjat.com), "/<repo>/" for a project site. Locally it stays
// "/" so `vite dev` and `vite preview` behave like the root of a domain.
const base = process.env.VITE_BASE_PATH ?? '/';
// Vite only warns about a malformed base and then ships a broken dist. The case that
// actually happened: Git Bash on Windows rewrites a lone "/" argument into the Git
// install path, so `VITE_BASE_PATH=/ npm run build` produced `/Program Files/Git/assets/…`
// in every entry. Refuse instead of warning (set the variable from PowerShell, or prefix
// the command with MSYS_NO_PATHCONV=1, or simply omit it — the default is "/").
if (!base.startsWith('/') || !base.endsWith('/')) {
  throw new Error(`VITE_BASE_PATH must look like "/" or "/repo/", got "${base}"`);
}

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
        // The simplified portfolio. A separate entry so it never pulls in three: it exists
        // to be fast and to work where WebGL does not.
        lite: `${root}lite/index.html`,
      },
      output: {
        /*
         * Function form, not the object form. React has to land in its own chunk or the
         * simplified entry reaches it through the r3f chunk and drags the whole renderer in
         * behind it — the one thing /lite/ exists to avoid. The object form declared a
         * `react` chunk that came out empty, because r3f had already claimed those modules;
         * matching on the resolved path is unambiguous.
         *
         * Order matters: `@react-three/*` lives under node_modules/@react-three, so it is
         * tested before the plain `react` prefix.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          const path = id.replace(/\\/g, '/');
          if (path.includes('/node_modules/postprocessing/')) return 'postfx';
          if (path.includes('/node_modules/@react-three/postprocessing/')) return 'postfx';
          if (path.includes('/node_modules/@react-three/')) return 'r3f';
          if (path.includes('/node_modules/three/')) return 'three';
          if (
            path.includes('/node_modules/react/') ||
            path.includes('/node_modules/react-dom/') ||
            path.includes('/node_modules/scheduler/')
          ) {
            return 'react';
          }
          return undefined;
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
