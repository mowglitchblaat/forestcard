// The game server (the edge function swift-responder), called from the site as the legacy page does
// (appelJeu): a "simple" request (text body, no custom header), so the browser sends no CORS
// preflight; the player's sign-in token goes in the body. Used by the paused game (Jouer) and the
// refusal of a belt challenge.

import { supabase } from '@/lib/supabase';

const GAME_URL = 'https://bjsvqikjnvaomyoifiml.supabase.co/functions/v1/swift-responder';

export type GameAnswer = { ok: boolean; json: unknown; text: string };

export async function callGame(body: Record<string, unknown>): Promise<GameAnswer> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('Reconnecte-toi.');
  let response: Response;
  try {
    response = await fetch(GAME_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ...body, jeton: session.access_token }),
    });
  } catch {
    throw new Error('Le serveur du jeu ne répond pas. Réessaie dans un instant.');
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: response.ok, json, text };
}
