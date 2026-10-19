import { defineConfig } from 'vite-plus';

// swift-responder is deployed by pasting ONE file in the Supabase dashboard (no CLI): the build
// inlines the engine and the journal projection into dist/swift-responder.ts.
const HEADER = [
  '// @ts-nocheck',
  '// GENERATED FILE: do not edit. Source: apps/edge/src/swift-responder.js (forestcard-rework).',
  '// Paste this whole file in Supabase > Edge Functions > swift-responder, then Deploy.',
].join('\n');

export default defineConfig({
  pack: {
    entry: ['src/swift-responder.js'],
    format: 'esm',
    platform: 'neutral',
    outDir: 'dist',
    deps: { alwaysBundle: [/^@forestcard\//] },
    minify: false,
    hash: false,
    dts: false,
    outExtensions: () => ({ js: '.ts' }),
    outputOptions: { banner: HEADER },
  },
});
