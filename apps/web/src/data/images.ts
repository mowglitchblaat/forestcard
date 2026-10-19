// Card images: served by GitHub Pages when the nightly job has copied them (img/liste.json lists
// them), else by Supabase storage, which costs quota. Same rule as the legacy page (MIROIR, img()).

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const MIRROR_URL = 'https://mowglitchblaat.github.io/forestcard/img/';

// The list is optional: without it (timeout, error), every image comes from Supabase. The legacy
// page waits at most 2.5 s for it.
export async function fetchMirror(): Promise<Set<string>> {
  try {
    const response = await fetch(MIRROR_URL + 'liste.json', { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return new Set();
    return new Set(z.array(z.string()).parse(await response.json()));
  } catch {
    return new Set();
  }
}

export function imageUrl(path: string | null, mirror: Set<string>): string | null {
  if (!path) return null;
  if (mirror.has(path)) return MIRROR_URL + encodeURI(path);
  return supabase.storage.from('cartes').getPublicUrl(path).data.publicUrl;
}

export const imageKeys = { mirror: ['imageMirror'] as const };
