-- 89-jeux-differences-ombres.sql — Forest Card
-- Deux nouveaux jeux du jour, sur le theme du spectacle de marionnettes (une partie par jour, minuit heure de Paris).
--   - Les differences : deux scenes de theatre de marionnettes (dessinees par le site a partir d'une graine), 3 a 8
--     differences entre elles. Le joueur les regarde 60 secondes (compte depuis le debut de la partie, cote site), puis
--     donne le nombre de differences : exact, il gagne un booster (comme le duel d'ATQ : un booster en vente a 250
--     gold ou moins). Une scene differente pour chaque joueur et chaque jour.
--   - Le theatre d'ombres : la silhouette d'un combattant du jeu derriere un ecran de papier, 4 noms proposes ; le bon
--     nom rapporte ombres_gain() gold.
-- A lancer une fois dans Supabase (SQL Editor), apres 88-defense-par-vagues.sql ; peut etre relance.

-- ===================== Les differences =====================
create table if not exists public.differences_jour (
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  jour date not null,
  graine integer not null,
  nb integer not null check (nb between 1 and 12),
  debut timestamptz not null default now(),
  reponse integer,
  gagne boolean,
  booster jsonb,
  primary key (joueur_id, jour)
);
alter table public.differences_jour enable row level security;

-- L'etat du jour. La scene se dessine avec la graine et `k` (le nombre de differences, un peu brouille) ; le vrai
-- nombre n'est donne qu'apres la reponse.
create or replace function public.differences_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.differences_jour;
begin
  if auth.uid() is null then return jsonb_build_object('joue', false); end if;
  select * into d from public.differences_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false); end if;
  return jsonb_build_object('joue', true, 'graine', d.graine, 'k', d.nb * 37 + (d.graine % 37),
    'debut', d.debut, 'maintenant', now(), 'fini', d.reponse is not null, 'reponse', d.reponse,
    'nb', case when d.reponse is not null then d.nb end, 'gagne', d.gagne, 'booster', d.booster);
end $$;
grant execute on function public.differences_etat() to authenticated;

create or replace function public.differences_commencer()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  insert into public.differences_jour (joueur_id, jour, graine, nb)
  values (auth.uid(), public.champignons_jour_paris(), floor(random() * 2000000000)::int, 3 + floor(random() * 6)::int)
  on conflict do nothing;
  if not found then raise exception 'DEJA_JOUE'; end if;
  delete from public.differences_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;
  return public.differences_etat();
end $$;
grant execute on function public.differences_commencer() to authenticated;

create or replace function public.differences_repondre(p_nb integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.differences_jour; bo record; bj jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into d from public.differences_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if d.reponse is not null then raise exception 'PARTIE_FINIE'; end if;
  if p_nb = d.nb then
    select t.id, t.nom, t.image_path into bo from public.types_boosters t
      where t.actif and t.prix is not null and t.prix <= 250 order by random() limit 1;
    if found then
      insert into public.stock_boosters (joueur_id, type_id, quantite) values (auth.uid(), bo.id, 1)
      on conflict (joueur_id, type_id) do update set quantite = public.stock_boosters.quantite + 1;
      bj := jsonb_build_object('id', bo.id, 'nom', bo.nom, 'image', bo.image_path);
    end if;
  end if;
  update public.differences_jour set reponse = p_nb, gagne = (p_nb = d.nb), booster = bj
  where joueur_id = auth.uid() and jour = d.jour;
  return public.differences_etat();
end $$;
grant execute on function public.differences_repondre(integer) to authenticated;

-- ===================== Le theatre d'ombres =====================
create or replace function public.ombres_gain() returns integer language sql immutable as $$ select 75 $$;

create table if not exists public.ombres_jour (
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  jour date not null,
  carte_id bigint not null,
  image text not null,
  choix bigint[] not null,
  reponse bigint,
  gagne boolean,
  gain integer not null default 0,
  primary key (joueur_id, jour)
);
alter table public.ombres_jour enable row level security;

create or replace function public.ombres_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.ombres_jour;
begin
  if auth.uid() is null then return jsonb_build_object('joue', false, 'gain', public.ombres_gain()); end if;
  select * into o from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false, 'gain', public.ombres_gain()); end if;
  return jsonb_build_object('joue', true, 'image', o.image, 'fini', o.reponse is not null,
    'choix', (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom) order by array_position(o.choix, c.id::bigint))
              from public.cartes c where c.id = any(o.choix)),
    'reponse', o.reponse, 'bonne', case when o.reponse is not null then o.carte_id end,
    'gagne', o.gagne, 'gain', case when o.reponse is not null then o.gain else public.ombres_gain() end);
end $$;
grant execute on function public.ombres_etat() to authenticated;

-- Une ombre : un combattant actif avec son dessin (l'illustration seule, sans cadre ni texte qui donnerait la reponse ;
-- a defaut l'image de combat), et 3
-- autres combattants actifs aux noms differents, le tout melange. Seules les cartes actives sont tirees : une
-- collection encore secrete n'a aucune carte active, elle n'apparait donc jamais.
create or replace function public.ombres_commencer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; tous bigint[];
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if exists (select 1 from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris()) then
    raise exception 'DEJA_JOUE';
  end if;
  select k.id, k.nom, v.img into c
  from public.cartes k
  join public.collections co on co.id = k.collection_id and co.active
  cross join lateral (select coalesce(vc.dessin_path, vc.image_combat) img from public.variantes_carte vc
                      where vc.carte_id = k.id and coalesce(vc.dessin_path, vc.image_combat) is not null
                      order by coalesce(vc.poids, 100) desc, vc.id limit 1) v
  where k.type = 'combattant' and k.actif order by random() limit 1;
  if not found then raise exception 'AUCUNE_CARTE'; end if;
  select array_agg(id order by random()) into tous from (
    select c.id::bigint id
    union all
    (select l.id from (
       select distinct on (lower(btrim(k.nom))) k.id::bigint id from public.cartes k
       join public.collections co on co.id = k.collection_id and co.active
       where k.type = 'combattant' and k.actif and lower(btrim(k.nom)) <> lower(btrim(c.nom))
       order by lower(btrim(k.nom)), random()) l
     order by random() limit 3)) x;
  insert into public.ombres_jour (joueur_id, jour, carte_id, image, choix)
  values (auth.uid(), public.champignons_jour_paris(), c.id, c.img, tous);
  delete from public.ombres_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;
  return public.ombres_etat();
end $$;
grant execute on function public.ombres_commencer() to authenticated;

create or replace function public.ombres_repondre(p_carte bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.ombres_jour; ok boolean;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into o from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if o.reponse is not null then raise exception 'PARTIE_FINIE'; end if;
  if not (p_carte = any(o.choix)) then raise exception 'CHOIX_INCONNU'; end if;
  ok := p_carte = o.carte_id;
  update public.ombres_jour set reponse = p_carte, gagne = ok, gain = case when ok then public.ombres_gain() else 0 end
  where joueur_id = auth.uid() and jour = o.jour;
  if ok then update public.joueurs set monnaie = coalesce(monnaie, 0) + public.ombres_gain() where id = auth.uid(); end if;
  return public.ombres_etat();
end $$;
grant execute on function public.ombres_repondre(bigint) to authenticated;
