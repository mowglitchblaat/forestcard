-- 84-parrainage.sql — Forest Card
-- Parrainage : chaque joueur a un lien (le site avec ?parrain=<son pseudo>). Un nouveau venu qui arrive par ce lien
-- et se connecte pour la premiere fois est rattache a son parrain : il recoit tout de suite un gold de bienvenue
-- (parrainage_gain_filleul, 500). Quand il a joue parrainage_combats combats (5), son parrain recoit
-- parrainage_gain_parrain gold (1000), une seule fois par filleul. Pas de limite de filleuls.
-- Garde-fous : seul un compte cree depuis moins d'un jour peut etre rattache, une seule fois, ni a lui-meme ni a son
-- propre filleul ; le parrain n'est paye qu'apres de vrais combats (un compte Twitch vide ne rapporte rien).
-- A lancer une fois dans Supabase (SQL Editor), apres 83-boss-duel.sql ; peut etre relance.

alter table public.joueurs
  add column if not exists parrain_id uuid references public.joueurs(id) on delete set null,
  add column if not exists parrainage_combats integer not null default 0,
  add column if not exists parrainage_paye_le timestamptz;
create index if not exists joueurs_parrain_idx on public.joueurs (parrain_id) where parrain_id is not null;

insert into public.reglages_jeu (cle, valeur) values
  ('parrainage_gain_parrain', '1000'), ('parrainage_gain_filleul', '500'), ('parrainage_combats', '5')
on conflict (cle) do nothing;

-- Un reglage entier du parrainage (Admin > Reglages), sa valeur par defaut s'il manque.
create or replace function public.parrainage_reglage(p_cle text, p_defaut integer)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((select round(valeur::numeric)::int from public.reglages_jeu
    where cle = p_cle and valeur ~ '^[0-9]+(\.[0-9]+)?$'), p_defaut));
$$;
revoke all on function public.parrainage_reglage(text, integer) from public, anon, authenticated;

-- Appele par le site juste apres la connexion d'un joueur venu par un lien de parrainage.
-- Rend { ok, parrain, gain } ou { ok: false, raison } (deja, ancien, inconnu, soi).
create or replace function public.parrainage_lier(p_parrain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare moi public.joueurs; p public.joueurs; g integer;
begin
  select * into moi from public.joueurs where id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'raison', 'inconnu'); end if;
  if moi.parrain_id is not null then return jsonb_build_object('ok', false, 'raison', 'deja'); end if;
  if coalesce(moi.cree_le, now()) < now() - interval '1 day' then
    return jsonb_build_object('ok', false, 'raison', 'ancien');
  end if;
  select * into p from public.joueurs where lower(pseudo) = lower(btrim(coalesce(p_parrain, '')))
  order by cree_le nulls last limit 1;
  if not found then return jsonb_build_object('ok', false, 'raison', 'inconnu'); end if;
  if p.id = moi.id or p.parrain_id = moi.id then return jsonb_build_object('ok', false, 'raison', 'soi'); end if;
  g := public.parrainage_reglage('parrainage_gain_filleul', 500);
  update public.joueurs set parrain_id = p.id, monnaie = coalesce(monnaie, 0) + g where id = moi.id;
  return jsonb_build_object('ok', true, 'parrain', p.pseudo, 'gain', g);
end $$;
revoke all on function public.parrainage_lier(text) from public, anon;
grant execute on function public.parrainage_lier(text) to authenticated;

-- Chaque combat enregistre compte pour les filleuls pas encore payes ; au seuil, le parrain recoit son gold.
create or replace function public.parrainage_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
declare j uuid; f public.joueurs; seuil integer;
begin
  begin
    seuil := greatest(1, public.parrainage_reglage('parrainage_combats', 5));
    foreach j in array array[new.joueur_a, new.joueur_b] loop
      if j is null then continue; end if;
      update public.joueurs set parrainage_combats = parrainage_combats + 1
      where id = j and parrain_id is not null and parrainage_paye_le is null
      returning * into f;
      if found and f.parrainage_combats >= seuil then
        update public.joueurs set parrainage_paye_le = now() where id = f.id;
        update public.joueurs set monnaie = coalesce(monnaie, 0) + public.parrainage_reglage('parrainage_gain_parrain', 1000)
        where id = f.parrain_id;
      end if;
    end loop;
  exception when others then
    raise warning 'parrainage_apres_combat : %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists parrainage_combats on public.historique_combats;
create trigger parrainage_combats after insert on public.historique_combats
  for each row execute function public.parrainage_apres_combat();

-- Ce que le profil montre a son joueur : les montants, son parrain, et ses filleuls (combats joues, paye ou non).
create or replace function public.parrainage_moi()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gain_parrain', public.parrainage_reglage('parrainage_gain_parrain', 1000),
    'gain_filleul', public.parrainage_reglage('parrainage_gain_filleul', 500),
    'combats', greatest(1, public.parrainage_reglage('parrainage_combats', 5)),
    'parrain', (select p.pseudo from public.joueurs m join public.joueurs p on p.id = m.parrain_id where m.id = auth.uid()),
    'filleuls', coalesce((select jsonb_agg(jsonb_build_object('pseudo', f.pseudo, 'combats', f.parrainage_combats,
        'paye', f.parrainage_paye_le is not null) order by f.cree_le desc)
      from public.joueurs f where f.parrain_id = auth.uid()), '[]'::jsonb));
$$;
revoke all on function public.parrainage_moi() from public, anon;
grant execute on function public.parrainage_moi() to authenticated;
