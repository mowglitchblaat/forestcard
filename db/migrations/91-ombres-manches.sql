-- 91-ombres-manches.sql — Forest Card
-- Le theatre d'ombres en 5 manches : chaque bonne reponse rapporte le gain de sa manche (ombres_gains() : 20, 30, 50,
-- 75, 100 gold, verses tout de suite) et passe a une nouvelle ombre ; une erreur arrete la partie, les gains restent.
-- Une ombre ne revient pas deux fois dans la meme partie.
-- A lancer une fois dans Supabase (SQL Editor), apres 90-atelier-tac.sql ; peut etre relance.

alter table public.ombres_jour
  add column if not exists manche integer not null default 1,
  add column if not exists vues bigint[] not null default '{}',
  add column if not exists derniere jsonb;

create or replace function public.ombres_gains() returns integer[] language sql immutable as $$ select array[20, 30, 50, 75, 100] $$;
create or replace function public.ombres_gain() returns integer language sql immutable as $$
  select sum(g)::int from unnest(public.ombres_gains()) g $$;

-- Une ombre : un combattant actif d'une collection active (jamais une collection secrete), pas deja vu dans la partie,
-- son dessin (l'illustration seule, sans cadre ni texte ; a defaut l'image de combat) et 4 noms melanges.
create or replace function public._ombres_tirer(p_vues bigint[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c record; tous bigint[];
begin
  select k.id, k.nom, v.img into c
  from public.cartes k
  join public.collections co on co.id = k.collection_id and co.active
  cross join lateral (select coalesce(vc.dessin_path, vc.image_combat) img from public.variantes_carte vc
                      where vc.carte_id = k.id and coalesce(vc.dessin_path, vc.image_combat) is not null
                      order by coalesce(vc.poids, 100) desc, vc.id limit 1) v
  where k.type = 'combattant' and k.actif and not (k.id = any(coalesce(p_vues, '{}')))
  order by random() limit 1;
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
  return jsonb_build_object('carte', c.id, 'image', c.img, 'choix', to_jsonb(tous));
end $$;
revoke all on function public._ombres_tirer(bigint[]) from public, anon, authenticated;

create or replace function public.ombres_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.ombres_jour; g integer[] := public.ombres_gains();
begin
  if auth.uid() is null then return jsonb_build_object('joue', false, 'gains', to_jsonb(g)); end if;
  select * into o from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false, 'gains', to_jsonb(g)); end if;
  return jsonb_build_object('joue', true, 'gains', to_jsonb(g), 'manche', o.manche, 'fini', o.reponse is not null,
    'image', case when o.reponse is null then o.image end,
    'choix', case when o.reponse is null then
      (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom) order by array_position(o.choix, c.id::bigint))
       from public.cartes c where c.id = any(o.choix)) end,
    'gagne', o.gagne, 'total', o.gain, 'derniere', o.derniere);
end $$;
grant execute on function public.ombres_etat() to authenticated;

create or replace function public.ombres_commencer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if exists (select 1 from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris()) then
    raise exception 'DEJA_JOUE';
  end if;
  t := public._ombres_tirer('{}');
  insert into public.ombres_jour (joueur_id, jour, carte_id, image, choix, manche, vues)
  values (auth.uid(), public.champignons_jour_paris(), (t->>'carte')::bigint, t->>'image',
          array(select jsonb_array_elements_text(t->'choix')::bigint), 1, array[(t->>'carte')::bigint]);
  delete from public.ombres_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;
  return public.ombres_etat();
end $$;
grant execute on function public.ombres_commencer() to authenticated;

-- Une reponse. Bonne : le gain de la manche est verse ; apres la derniere manche la partie est finie, sinon une
-- nouvelle ombre. Mauvaise : la partie est finie, les gains restent. `derniere` garde la manche jouee (pour la reveler).
create or replace function public.ombres_repondre(p_carte bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.ombres_jour; ok boolean; g integer[] := public.ombres_gains(); v_gain integer := 0; t jsonb; d jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into o from public.ombres_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if o.reponse is not null then raise exception 'PARTIE_FINIE'; end if;
  if not (p_carte = any(o.choix)) then raise exception 'CHOIX_INCONNU'; end if;
  ok := p_carte = o.carte_id;
  if ok then
    v_gain := coalesce(g[o.manche], 0);
    update public.joueurs set monnaie = coalesce(monnaie, 0) + v_gain where id = auth.uid();
  end if;
  d := jsonb_build_object('manche', o.manche, 'image', o.image, 'ok', ok, 'gain', v_gain,
    'bonne', (select nom from public.cartes where id = o.carte_id),
    'reponse', (select nom from public.cartes where id = p_carte));
  if ok and o.manche < array_length(g, 1) then
    t := public._ombres_tirer(o.vues);
    update public.ombres_jour set manche = o.manche + 1, gain = o.gain + v_gain, derniere = d, gagne = true,
      carte_id = (t->>'carte')::bigint, image = t->>'image',
      choix = array(select jsonb_array_elements_text(t->'choix')::bigint),
      vues = o.vues || (t->>'carte')::bigint
    where joueur_id = auth.uid() and jour = o.jour;
  else
    update public.ombres_jour set reponse = p_carte, gagne = ok, gain = o.gain + v_gain, derniere = d
    where joueur_id = auth.uid() and jour = o.jour;
  end if;
  return public.ombres_etat();
end $$;
grant execute on function public.ombres_repondre(bigint) to authenticated;
