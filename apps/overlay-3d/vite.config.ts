import { defineConfig } from 'vite-plus';

// Two pages, served at the site's root as combat-3d.html and booster-3d.html (tools/pages/assemble.ts):
// relative URLs, their scripts in their own folder (overlay-3d/) so they never meet the React site's
// assets/.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'overlay-3d',
    emptyOutDir: true,
    rollupOptions: { input: { index: 'index.html', booster: 'booster.html' } },
  },
});
