// @ts-nocheck
// statut-stream — Forest Card (db/migrations/95-live-auto.sql)
// Called every minute by pg_cron. Asks Twitch whether the channel is live and writes the answer to
// reglages_jeu.stream_en_ligne; a database trigger then switches the game between live and site.
// Deployed as-is in Supabase (Edge Functions > statut-stream), "Verify JWT" off: the caller proves itself
// with the secret stored in public.stream_auto. Secrets: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET.

// Offline must be seen for this long before the game leaves live mode (a stream that drops and
// reconnects must not end a let's play or switch the game mid-stream).
const OFFLINE_GRACE_MS = 5 * 60 * 1000;

const U = Deno.env.get('SUPABASE_URL');
const K = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_KEY');
const CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET');

async function rest(path, init = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  return { ok: r.ok, data: text ? JSON.parse(text) : null };
}

const patchState = (values) =>
  rest('stream_auto?id=eq.1', { method: 'PATCH', body: JSON.stringify(values), headers: { Prefer: 'return=minimal' } });

async function newToken() {
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error(`Twitch token: ${r.status}`);
  const j = await r.json();
  const expires = new Date(Date.now() + (Number(j.expires_in) - 3600) * 1000).toISOString();
  await patchState({ jeton: j.access_token, jeton_expire: expires });
  return j.access_token;
}

async function isLive(channelId, token) {
  const r = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(channelId)}`, {
    headers: { 'Client-Id': CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) return null; // token expired or revoked
  if (!r.ok) throw new Error(`Twitch streams: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.data) && j.data.some((s) => s.type === 'live');
}

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const st = await rest('stream_auto?id=eq.1&select=*');
    const state = st.ok && Array.isArray(st.data) ? st.data[0] : null;
    if (!state || !state.secret || req.headers.get('x-secret') !== state.secret) return reply(401, { erreur: 'secret' });
    if (!CLIENT_ID || !CLIENT_SECRET) return reply(500, { erreur: 'secrets TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET manquants' });

    let token = state.jeton && state.jeton_expire && new Date(state.jeton_expire) > new Date() ? state.jeton : await newToken();
    let live = await isLive(state.chaine_id, token);
    if (live === null) live = await isLive(state.chaine_id, await newToken());
    if (live === null) throw new Error('Twitch refuse le jeton');

    const now = new Date();
    const offlineSince = live ? null : state.hors_ligne_depuis ? new Date(state.hors_ligne_depuis) : now;
    await patchState({ verifie_le: now.toISOString(), hors_ligne_depuis: offlineSince && offlineSince.toISOString() });

    // live: immediately; offline: only after the grace period
    const wanted = live ? '1' : now.getTime() - offlineSince.getTime() >= OFFLINE_GRACE_MS ? '0' : null;
    const cur = await rest('reglages_jeu?cle=eq.stream_en_ligne&select=valeur');
    const current = cur.ok && Array.isArray(cur.data) && cur.data[0] ? String(cur.data[0].valeur) : null;
    if (wanted !== null && wanted !== current) {
      await rest('reglages_jeu?on_conflict=cle', {
        method: 'POST',
        body: JSON.stringify({ cle: 'stream_en_ligne', valeur: wanted }),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
    return reply(200, { live, stream_en_ligne: wanted ?? current });
  } catch (e) {
    // Twitch or database unreachable: change nothing, try again next minute
    return reply(502, { erreur: String((e && e.message) || e) });
  }
});
