// The Supabase session as React state: null when signed out, undefined while it is being read.
//
// One store for the whole app: a single read and a single subscription to auth changes, shared by
// every useSession. A view mounted once the session is known gets it on its first render, so its
// queries start with the right player id: before, each call read the session on its own and
// rendered once without it, and every page flashed its loading skeleton, even with its data cached.

import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

let current: Session | null | undefined = undefined;
const listeners = new Set<() => void>();
let started = false;

function set(next: Session | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

// Started by the first subscriber; kept for the life of the page.
function start(): void {
  if (started) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => set(data.session));
  supabase.auth.onAuthStateChange((_event, next) => set(next));
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, () => current);
}

// Twitch sign-in comes back to this very page, as on the legacy site.
export function signIn(): void {
  void supabase.auth.signInWithOAuth({
    provider: 'twitch',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  location.reload();
}
