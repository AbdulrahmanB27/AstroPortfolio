import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Relative base: the build works unchanged at https://user.github.io/, at
// https://user.github.io/<repo>/ and from any static file server.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180, strictPort: false },
  preview: { port: 4180 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
          gsap: ['gsap'],
        },
      },
    },
  },
})
