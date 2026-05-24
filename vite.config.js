import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Scripts are plain globals (not ES modules) until T-1.3 converts them.
// viteStaticCopy copies them verbatim into dist/ so the build is functional.
const legacyScripts = [
  'formats.js', 'db.js', 'venue.js', 'venue-worker.js',
  'tilt-toggle.js', 'map.js',
];

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        ...legacyScripts.map(f => ({ src: f, dest: '.' })),
        { src: 'data',  dest: '.' },
      ],
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
});
