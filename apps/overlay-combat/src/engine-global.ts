// The engine as the page expects it: a global `Moteur` with simuler() and REG, like the legacy
// engine block it replaces. Built as an IIFE (vite.config.ts) and inlined into combat.html.
export { simuler } from '@forestcard/journal';
export { DEFAULT_RULES as REG } from '@forestcard/engine';
