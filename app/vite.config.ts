import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const design = fileURLToPath(new URL('../design', import.meta.url));

export default defineConfig({
  base: './',
  resolve: { alias: { '@design': design } },
  // Hanya untuk `npm run dev` (uji lokal): teruskan /api/ same-origin ke
  // backend lokal (bawaan port 3242). Produksi memakai Cloudflare Tunnel
  // atau nginx, yang menambahkan header proxy. Nilai header dibaca dari
  // env (nama saja, tanpa nilai di berkas ini); tanpa nilai itu backend
  // menjawab 403, sesuai perilaku fail-closed-nya. `vite preview` dan
  // suite E2E sengaja tidak memakai proxy ini.
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3242',
        headers: process.env.KANTOR_RPG_PROXY_SECRET
          ? { 'x-kantor-proxy': process.env.KANTOR_RPG_PROXY_SECRET }
          : {},
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // three.js (~650 kB minified) is the bulk of the JS: its own chunk keeps it
    // cacheable across app releases and lets the warning limit stay at the
    // default instead of being raised to hide the size (R2).
    rolldownOptions: {
      // mg.html: stand-alone page for one mini game (direct links, E2E per game).
      input: { index: fileURLToPath(new URL('./index.html', import.meta.url)), mg: fileURLToPath(new URL('./mg.html', import.meta.url)) },
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }, { name: 'studio', test: /[\\/]src[\\/]studio[\\/](ui|editor|validate)\.ts$/, includeDependenciesRecursively: false }] },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
  },
});
