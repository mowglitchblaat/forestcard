import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Connect, defineConfig, type Plugin } from 'vite-plus';

// The patch notes file lives in apps/site/public; the published site puts it next to this app
// (tools/pages/assemble.ts). Locally (vp dev, vp preview), this serves the same file at the same
// relative URL: without it, the app's own index.html answers instead.
const NOTES = fileURLToPath(new URL('../site/public/patchnotes.json', import.meta.url));
const serveNotes: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.split('?')[0]?.endsWith('/patchnotes.json')) return next();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(readFileSync(NOTES));
};
const patchNotes = (): Plugin => ({
  name: 'forestcard-patchnotes',
  configureServer: (server) => void server.middlewares.use(serveNotes),
  configurePreviewServer: (server) => void server.middlewares.use(serveNotes),
});

export default defineConfig({
  plugins: [react(), tailwindcss(), patchNotes()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Relative asset URLs: the site is served under /forestcard/ on GitHub Pages.
  base: './',
});
