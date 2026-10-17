-- 21-historique-sans-spoil.sql — Forest Card
-- Un combat n'apparaît dans l'historique qu'une fois son animation terminée à l'écran (pas de spoil).
-- L'overlay OBS (combat.html) prévient Supabase à la fin de chaque combat ; s'il n'est pas ouvert,
-- le combat apparaît quand même au bout de 15 minutes.

-- 1) Nouvelle colonne : les combats déjà enregistrés sont visibles, les nouveaux sont cachés au départ
alter table public.historique_combats add column if not exists affiche boolean not null default true;
alter table public.historique_combats alter column affiche set default false;

-- 2) Appelée par l'overlay à la fin de l'animation
create or replace function public.combat_affiche(p_seed text)
returns void language sql security definer set search_path = public as $$
  update public.historique_combats set affiche = true
  where not affiche and seed::text = p_seed and cree_le > now() - interval '1 hour';
$$;
grant execute on function public.combat_affiche(text) to anon, authenticated;

-- 3) Combats encore en cours d'animation (le site les masque)
create or replace function public.combats_caches()
returns setof text language sql stable security definer set search_path = public as $$
  select id::text from public.historique_combats
  where not affiche and cree_le > now() - interval '15 minutes';
$$;
grant execute on function public.combats_caches() to anon, authenticated;
