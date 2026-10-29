-- 46-tournois.sql — Forest Card
-- Les tournois : un tableau à élimination directe joué en live, combat après combat, sans que les joueurs aient à être là.
--
--   - Création (Admin > Tournois) : un nom, un thème = la ceinture dont on prend le deck de championnat (Rare, Épique
--     ou Libre, 33-championnat.sql), un nombre maximum de joueurs, l'image du trophée (facultative). Un seul tournoi
--     ouvert à la fois.
--   - Récompenses (Admin > Récompenses) : pour chacune des 4 premières places, du gold, des boosters, un dos de carte et
--     une carte (une version précise). Un nouveau tournoi reprend celles du tournoi précédent. Le site les montre aux joueurs.
--   - Inscriptions : « !tournoi » dans le chat, ou le bouton de l'onglet Tournois du site. Il faut un deck de championnat
--     valide pour la ceinture du thème ; il est figé à l'inscription (le changer ensuite ne change rien au tournoi).
--     « !tournoi quitter » (ou le bouton du site) retire l'inscription tant que le tournoi n'a pas commencé.
--   - Lancement : le bouton « Lancer » de l'admin, ou la première commande « suivant » de Streamer.bot. Le tableau est tiré
--     au sort. Avec un nombre de joueurs qui n'est pas une puissance de 2, certains sont qualifiés d'office au premier tour
--     (jamais deux qualifiés d'office l'un contre l'autre).
--   - Matchs : combats en relais, 3 combattants par joueur, comme le combat pour le titre (sans gold à chaque combat).
--     Format par tour : BO1 jusqu'aux quarts, BO3 en demi-finale, BO5 en finale (réglages tournoi_format_autres,
--     tournoi_format_demi, tournoi_format_finale). Petite finale entre les perdants des demi-finales, jouée juste avant
--     la finale, en BO3 (réglage tournoi_format_petite). Un combat nul ne compte pour personne : il est rejoué.
--     Le joueur qui commence change à chaque combat du match.
--   - Fin : quand la finale et la petite finale sont jouées. Places : 1 (vainqueur de la finale), 2 (finaliste), 3 (vainqueur
--     de la petite finale), 4 (perdant de la petite finale). Avec 3 joueurs, le seul perdant de demi-finale est 3e sans jouer.
--     Trophées pour les places 1 à 3, gardés pour toujours (armoire du profil) : aucune remise à zéro ne les efface, même si
--     le tournoi est supprimé. Les récompenses des 4 places sont données à la fin.
--   - Enchaînement : à la fin de l'animation d'un combat, l'overlay lance lui-même le combat suivant (action Streamer.bot
--     « Tournoi - Suivant »), tant que l'enchaînement automatique est activé pour le tournoi (Admin > Tournois).
--   - Sans spoil : tant que l'animation d'un combat n'est pas finie à l'écran, l'onglet Tournois et l'armoire montrent le
--     tableau comme avant ce combat (même signal que l'historique, 21-historique-sans-spoil.sql ; 15 minutes au plus).
--
-- Utilise titre_deck_probleme, titre_joueur, titre_nom (33-championnat.sql) et reglage_num (28-echanges.sql).
-- À lancer une fois dans Supabase (SQL Editor), après 45-pantheon-doubles.sql ; peut être relancé sans risque.

-- ================= Réglages =================
insert into public.reglages_jeu (cle, valeur) values
  ('tournoi_format_autres', '1'),     -- BO1 jusqu'aux quarts de finale
  ('tournoi_format_demi', '3'),       -- BO3 en demi-finale
  ('tournoi_format_finale', '5'),     -- BO5 en finale
  ('tournoi_format_petite', '3'),     -- BO3 en petite finale (3e place)
  ('tournoi_max_joueurs', '32'),      -- nombre maximum de joueurs quand le tournoi n'en précise pas
  ('tournoi_pause_secondes', '8')     -- pause entre deux combats enchaînés automatiquement (overlay)
on conflict (cle) do nothing;

-- ================= Tables =================
create table if not exists public.tournois (
  id bigserial primary key,
  nom text not null,
  division text not null check (division in ('rare', 'epique', 'libre')),   -- le deck de championnat utilisé
  statut text not null default 'inscriptions' check (statut in ('inscriptions', 'en_cours', 'termine', 'annule')),
  max_joueurs int,                      -- null : réglage tournoi_max_joueurs
  trophee text,                         -- image du trophée (stockage « cartes »), facultative
  auto boolean not null default true,   -- l'overlay enchaîne les combats tout seul
  cree_le timestamptz not null default now(),
  lance_le timestamptz,
  fini_le timestamptz,
  gagnant uuid
);
-- un seul tournoi ouvert (inscriptions ou en cours) à la fois
create unique index if not exists tournois_un_ouvert on public.tournois ((true)) where statut in ('inscriptions', 'en_cours');

create table if not exists public.tournoi_inscrits (
  tournoi_id bigint not null references public.tournois (id) on delete cascade,
  joueur_id uuid not null,
  cartes bigint[] not null,             -- le deck de championnat, figé à l'inscription
  inscrit_le timestamptz not null default now(),
  primary key (tournoi_id, joueur_id)
);

create table if not exists public.tournoi_matchs (
  id bigserial primary key,
  tournoi_id bigint not null references public.tournois (id) on delete cascade,
  tour int not null,                    -- 1 : premier tour ; le plus grand : la finale
  position int not null,                -- place dans le tour, de haut en bas du tableau
  a uuid, b uuid,                       -- null : pas encore connu (ou absent : qualifié d'office)
  format int not null default 1,        -- BO1, BO3, BO5
  score_a int not null default 0,
  score_b int not null default 0,
  nuls int not null default 0,          -- combats nuls (rejoués)
  exempt boolean not null default false, -- a est qualifié d'office (pas d'adversaire au premier tour)
  gagnant uuid,
  fini_le timestamptz,
  suivant_id bigint references public.tournoi_matchs (id) on delete cascade,
  suivant_cote int,                     -- le vainqueur va en a (0) ou en b (1) du match suivant
  petite boolean not null default false, -- la petite finale (3e place), dans le même tour que la finale
  perdant_id bigint references public.tournoi_matchs (id) on delete set null,   -- demi-finale : le perdant va en petite finale
  perdant_cote int,
  unique (tournoi_id, tour, position)
);

create table if not exists public.tournoi_combats (
  id bigserial primary key,
  match_id bigint not null references public.tournoi_matchs (id) on delete cascade,
  num int not null,
  gagnant uuid,                         -- null : match nul
  seed text not null,                   -- le combat dans historique_combats (signal de fin d'animation)
  fini_le timestamptz not null default now()
);
create index if not exists tournoi_combats_match_idx on public.tournoi_combats (match_id);

create table if not exists public.trophees (
  id bigserial primary key,
  joueur_id uuid not null,
  tournoi_id bigint,                    -- sans clé étrangère : le trophée reste si le tournoi est supprimé
  place int not null check (place in (1, 2, 3)),
  nom text not null,                    -- nom du tournoi, recopié
  division text not null,
  image text,
  attribue_le timestamptz not null default now()
);
create index if not exists trophees_joueur_idx on public.trophees (joueur_id, attribue_le desc);

-- Récompenses des 4 premières places (Admin > Récompenses)
create table if not exists public.tournoi_recompenses (
  tournoi_id bigint not null references public.tournois (id) on delete cascade,
  place int not null check (place between 1 and 4),
  gold int not null default 0,
  booster_id int,                       -- types_boosters
  boosters int not null default 0,      -- nombre de boosters
  dos_id uuid,                          -- dos_cartes
  variante_id int,                      -- variantes_carte : la version précise de la carte offerte
  primary key (tournoi_id, place)
);

alter table public.tournois enable row level security;
alter table public.tournoi_inscrits enable row level security;
alter table public.tournoi_matchs enable row level security;
alter table public.tournoi_combats enable row level security;
alter table public.trophees enable row level security;
alter table public.tournoi_recompenses enable row level security;
revoke all on public.tournois, public.tournoi_inscrits, public.tournoi_matchs, public.tournoi_combats, public.trophees,
  public.tournoi_recompenses from anon, authenticated;

-- ================= Outils internes =================
-- Nom d'un tour d'après sa distance à la finale
create or replace function public.tournoi_tour_nom(p_tour int, p_tours int)
returns text language sql immutable as $$
  select case p_tours - p_tour when 0 then 'Finale' when 1 then 'Demi-finale' when 2 then 'Quart de finale'
    when 3 then 'Huitième de finale' when 4 then 'Seizième de finale' else 'Tour ' || p_tour end;
$$;
create or replace function public.tournoi_match_nom(p_tour int, p_tours int, p_petite boolean)
returns text language sql immutable as $$
  select case when p_petite then 'Petite finale' else public.tournoi_tour_nom(p_tour, p_tours) end;
$$;

-- Les récompenses d'un tournoi, lisibles (noms et images)
create or replace function public.tournoi_recompenses_json(p_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('place', r.place, 'gold', r.gold,
           'booster_id', r.booster_id, 'boosters', r.boosters, 'booster', b.nom, 'booster_image', b.image_path,
           'dos_id', r.dos_id, 'dos', d.nom, 'dos_image', d.image,
           'variante_id', r.variante_id, 'carte', c.nom, 'version', v.nom, 'carte_image', v.image_path) order by r.place), '[]')
  from public.tournoi_recompenses r
  left join public.types_boosters b on b.id = r.booster_id
  left join public.dos_cartes d on d.id = r.dos_id
  left join public.variantes_carte v on v.id = r.variante_id left join public.cartes c on c.id = v.carte_id
  where r.tournoi_id = p_id;
$$;

-- Le deck d'un joueur pour le moteur : cartes complètes, image de la version la plus rare qu'il possède
-- (ou, s'il ne l'a plus, la première version de la carte : le deck figé à l'inscription joue quand même)
create or replace function public.tournoi_deck_json(p_joueur uuid, p_cartes bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', j.id, 'pseudo', j.pseudo, 'deck', (
    select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('image', v.image_path, 'imageCombat', v.image_combat)), '[]')
    from public.cartes c
    cross join lateral (select vv.image_path, vv.image_combat from public.variantes_carte vv
       left join public.echange_coll k on k.variante_id = vv.id and k.joueur_id = p_joueur and k.quantite > 0
       where vv.carte_id = c.id order by (k.variante_id is null), coalesce(vv.poids, 100), vv.id limit 1) v
    where c.id = any(p_cartes)))
  from public.joueurs j where j.id = p_joueur;
$$;

-- Le tableau d'un tournoi. p_masquer : sans spoil (les combats encore à l'écran sont retirés, comme s'ils n'avaient pas
-- eu lieu ; 15 minutes au plus). Une seule fonction pour le site, l'overlay et Streamer.bot.
create or replace function public.tournoi_json(p_id bigint, p_masquer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; m public.tournoi_matchs; k record; nt int; caches bigint[] := '{}';
begin
  select * into t from public.tournois where id = p_id;
  if t.id is null then return null; end if;
  -- copie de travail du tableau (table temporaire, effacée à la fin de la transaction)
  create temp table if not exists _tm (like public.tournoi_matchs) on commit drop;
  delete from _tm;
  insert into _tm select * from public.tournoi_matchs where tournoi_id = p_id;
  if p_masquer then
    -- du plus récent au plus ancien : chaque combat caché est retiré du tableau
    for k in select mn.* from public.tournoi_combats mn join _tm x on x.id = mn.match_id
              where mn.fini_le > now() - interval '15 minutes'
                and not exists (select 1 from public.historique_combats h where h.seed::text = mn.seed and h.affiche)
              order by mn.fini_le desc, mn.id desc loop
      select * into m from _tm where id = k.match_id;
      caches := caches || m.id;
      if m.gagnant is not null and m.fini_le >= k.fini_le then   -- ce combat a conclu le match
        update _tm set gagnant = null, fini_le = null where id = m.id;
        if m.suivant_id is not null then
          update _tm set a = case when m.suivant_cote = 0 then null else a end,
                         b = case when m.suivant_cote = 1 then null else b end where id = m.suivant_id;
        end if;
        if m.perdant_id is not null then   -- le perdant de la demi-finale n'est pas encore en petite finale
          update _tm set a = case when m.perdant_cote = 0 or exempt then null else a end,
                         b = case when m.perdant_cote = 1 then null else b end,
                         gagnant = case when exempt then null else gagnant end,
                         fini_le = case when exempt then null else fini_le end, exempt = false where id = m.perdant_id;
        end if;
        if t.statut = 'termine' then t.statut := 'en_cours'; t.gagnant := null; t.fini_le := null; end if;
      end if;
      update _tm set score_a = score_a - coalesce((k.gagnant = m.a)::int, 0),
                     score_b = score_b - coalesce((k.gagnant = m.b)::int, 0),
                     nuls = nuls - (k.gagnant is null)::int where id = m.id;
    end loop;
  end if;
  select coalesce(max(tour), 0) into nt from _tm;
  return jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'division', t.division, 'ceinture', public.titre_nom(t.division), 'statut', t.statut,
    'max_joueurs', coalesce(t.max_joueurs, public.reglage_num('tournoi_max_joueurs', 32)::int),
    'recompenses', public.tournoi_recompenses_json(t.id), 'trophee', t.trophee, 'auto', t.auto,
    'cree_le', t.cree_le, 'lance_le', t.lance_le, 'fini_le', t.fini_le,
    'gagnant', t.gagnant, 'pseudo_gagnant', (select pseudo from public.joueurs where id = t.gagnant),
    'tours', nt,
    'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('id', i.joueur_id, 'pseudo', j.pseudo) order by i.inscrit_le), '[]')
                 from public.tournoi_inscrits i left join public.joueurs j on j.id = i.joueur_id where i.tournoi_id = t.id),
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'tour', x.tour, 'position', x.position, 'nom_tour', public.tournoi_match_nom(x.tour, nt, x.petite),
        'petite', x.petite, 'format', x.format,
        'a', x.a, 'b', x.b, 'pseudo_a', ja.pseudo, 'pseudo_b', jb.pseudo, 'score_a', x.score_a, 'score_b', x.score_b,
        'nuls', x.nuls, 'exempt', x.exempt, 'gagnant', x.gagnant, 'a_l_ecran', x.id = any(caches)) order by x.tour, x.position), '[]')
      from _tm x left join public.joueurs ja on ja.id = x.a left join public.joueurs jb on jb.id = x.b));
end $$;

-- Le prochain match à jouer : le plus tôt dans le tableau, avec ses deux joueurs connus
create or replace function public.tournoi_prochain(p_id bigint)
returns public.tournoi_matchs language sql stable security definer set search_path = public as $$
  select * from public.tournoi_matchs where tournoi_id = p_id and gagnant is null and a is not null and b is not null
  order by tour, petite desc, position limit 1;   -- la petite finale avant la finale
$$;

-- Les récompenses d'une place, données au joueur : gold, boosters, dos de carte (s'il ne l'a pas déjà), carte
create or replace function public.tournoi_recompenser(p_tournoi bigint, p_joueur uuid, p_place int)
returns void language plpgsql security definer set search_path = public as $$
declare r public.tournoi_recompenses;
begin
  if p_joueur is null then return; end if;
  select * into r from public.tournoi_recompenses where tournoi_id = p_tournoi and place = p_place;
  if r.tournoi_id is null then return; end if;
  if r.gold > 0 then update public.joueurs set monnaie = coalesce(monnaie, 0) + r.gold where id = p_joueur; end if;
  if r.booster_id is not null and r.boosters > 0 then
    insert into public.stock_boosters (joueur_id, type_id, quantite) values (p_joueur, r.booster_id, r.boosters)
    on conflict (joueur_id, type_id) do update set quantite = public.stock_boosters.quantite + excluded.quantite;
  end if;
  if r.dos_id is not null then
    insert into public.dos_joueur (joueur_id, dos_id) values (p_joueur, r.dos_id) on conflict do nothing;
  end if;
  if r.variante_id is not null then
    insert into public.collection_joueur (joueur_id, variante_id, quantite) values (p_joueur, r.variante_id, 1)
    on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
  end if;
end $$;

-- Fin du tournoi (finale et petite finale jouées) : places, trophées (1 à 3), récompenses (1 à 4)
create or replace function public.tournoi_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; f public.tournoi_matchs; pf public.tournoi_matchs; nt int; pl uuid[];
begin
  select * into t from public.tournois where id = p_id for update;
  if t.statut <> 'en_cours' then return; end if;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = p_id;
  select * into f from public.tournoi_matchs where tournoi_id = p_id and tour = nt and not petite;
  select * into pf from public.tournoi_matchs where tournoi_id = p_id and petite;
  pl := array[f.gagnant, case when f.gagnant = f.a then f.b else f.a end,
              pf.gagnant, case when pf.exempt or pf.gagnant is null then null when pf.gagnant = pf.a then pf.b else pf.a end];
  update public.tournois set statut = 'termine', fini_le = now(), gagnant = f.gagnant where id = p_id;
  for i in 1 .. 4 loop
    if pl[i] is not null then
      if i <= 3 then
        insert into public.trophees (joueur_id, tournoi_id, place, nom, division, image) values (pl[i], t.id, i, t.nom, t.division, t.trophee);
      end if;
      perform public.tournoi_recompenser(t.id, pl[i], i);
    end if;
  end loop;
end $$;

-- Le vainqueur d'un match passe au suivant, le perdant d'une demi-finale va en petite finale ; quand plus rien ne reste à
-- jouer, le tournoi se termine
create or replace function public.tournoi_avancer(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; perdant uuid; autre public.tournoi_matchs;
begin
  select * into m from public.tournoi_matchs where id = p_match;
  if m.gagnant is null then return; end if;
  if m.suivant_id is not null then
    update public.tournoi_matchs set a = case when m.suivant_cote = 0 then m.gagnant else a end,
                                     b = case when m.suivant_cote = 1 then m.gagnant else b end where id = m.suivant_id;
  end if;
  perdant := case when m.exempt then null when m.gagnant = m.a then m.b else m.a end;
  if m.perdant_id is not null and perdant is not null then
    select * into autre from public.tournoi_matchs where perdant_id = m.perdant_id and id <> m.id;
    if autre.exempt then
      -- l'autre demi-finale n'a pas de perdant (qualifié d'office) : 3e place sans jouer
      update public.tournoi_matchs set a = perdant, b = null, exempt = true, gagnant = perdant, fini_le = now() where id = m.perdant_id;
      perform public.tournoi_avancer(m.perdant_id);
    else
      update public.tournoi_matchs set a = case when m.perdant_cote = 0 then perdant else a end,
                                       b = case when m.perdant_cote = 1 then perdant else b end where id = m.perdant_id;
    end if;
  end if;
  if m.suivant_id is null and not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and gagnant is null) then
    perform public.tournoi_terminer(m.tournoi_id);
  end if;
end $$;

-- Tirage du tableau et début du tournoi
create or replace function public.tournoi_tirer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; n int; p int := 2; nt int := 1; ord int[] := array[1, 2]; nxt int[]; l int; x int;
        js uuid[]; r int; k int; fa int; fb int; fmt int; fp int; id_m bigint; id_pf bigint;
begin
  select * into t from public.tournois where id = p_id for update;
  if t.id is null then raise exception 'Tournoi introuvable'; end if;
  if t.statut <> 'inscriptions' then raise exception 'Le tournoi « % » a déjà commencé', t.nom; end if;
  select count(*) into n from public.tournoi_inscrits where tournoi_id = p_id;
  if n < 2 then raise exception 'Il faut au moins 2 inscrits pour lancer le tournoi « % » (% pour l''instant)', t.nom, n; end if;
  while p < n loop p := p * 2; nt := nt + 1; end loop;
  -- ordre classique d'un tableau : la tête de série 1 contre la dernière, etc. ; les places en trop sont les qualifiés d'office,
  -- et elles ne tombent jamais l'une contre l'autre
  while cardinality(ord) < p loop
    nxt := '{}'; l := cardinality(ord);
    foreach x in array ord loop nxt := nxt || x || (2 * l + 1 - x); end loop;
    ord := nxt;
  end loop;
  js := array(select joueur_id from public.tournoi_inscrits where tournoi_id = p_id order by random());   -- tirage au sort
  delete from public.tournoi_matchs where tournoi_id = p_id;
  fa := public.reglage_num('tournoi_format_autres', 1)::int;
  fb := public.reglage_num('tournoi_format_demi', 3)::int;
  fmt := public.reglage_num('tournoi_format_finale', 5)::int;
  fp := public.reglage_num('tournoi_format_petite', 3)::int;
  -- de la finale au premier tour, pour connaître le match suivant de chacun
  for r in reverse nt .. 1 loop
    for k in 1 .. (p >> r) loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, suivant_id, suivant_cote)
      values (p_id, r, k, greatest(1, case when r = nt then fmt when r = nt - 1 then fb else fa end),
              (select id from public.tournoi_matchs where tournoi_id = p_id and tour = r + 1 and position = (k + 1) / 2),
              case when r = nt then null else (k - 1) % 2 end)
      returning id into id_m;
    end loop;
  end loop;
  -- petite finale (3e place) : les perdants des deux demi-finales
  if nt >= 2 then
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, petite) values (p_id, nt, 2, greatest(1, fp), true)
    returning id into id_pf;
    update public.tournoi_matchs set perdant_id = id_pf, perdant_cote = position - 1 where tournoi_id = p_id and tour = nt - 1;
  end if;
  for k in 1 .. p / 2 loop
    update public.tournoi_matchs set a = js[ord[2 * k - 1]], b = case when ord[2 * k] <= n then js[ord[2 * k]] end
     where tournoi_id = p_id and tour = 1 and position = k;
  end loop;
  -- qualifiés d'office
  for id_m in select id from public.tournoi_matchs where tournoi_id = p_id and tour = 1 and b is null order by position loop
    update public.tournoi_matchs set exempt = true, gagnant = a, fini_le = now() where id = id_m;
    perform public.tournoi_avancer(id_m);
  end loop;
  update public.tournois set statut = 'en_cours', lance_le = now() where id = p_id;
end $$;

-- Inscription d'un joueur au tournoi ouvert
create or replace function public.tournoi_inscrire_j(p_joueur uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; dc bigint[]; pb text; n int; mx int;
begin
  if p_joueur is null then raise exception 'Joueur inconnu : connecte-toi une fois au site'; end if;
  select * into t from public.tournois where statut in ('inscriptions', 'en_cours') for update;
  if t.id is null then raise exception 'Aucun tournoi n''est ouvert en ce moment'; end if;
  if t.statut = 'en_cours' then raise exception 'Le tournoi « % » a déjà commencé : les inscriptions sont fermées', t.nom; end if;
  if exists (select 1 from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = p_joueur) then
    raise exception 'Tu es déjà inscrit au tournoi « % »', t.nom; end if;
  mx := coalesce(t.max_joueurs, public.reglage_num('tournoi_max_joueurs', 32)::int);
  select count(*) into n from public.tournoi_inscrits where tournoi_id = t.id;
  if n >= mx then raise exception 'Le tournoi « % » est complet (% joueurs)', t.nom, mx; end if;
  select cartes into dc from public.decks_championnat where joueur_id = p_joueur and division = t.division;
  pb := case when dc is null then 'tu n''as pas de deck pour cette ceinture' else public.titre_deck_probleme(p_joueur, t.division, dc) end;
  if pb is not null then raise exception 'Ton deck de championnat (%) n''est pas prêt : % (onglet Mon deck du site)', public.titre_nom(t.division), pb; end if;
  insert into public.tournoi_inscrits (tournoi_id, joueur_id, cartes) values (t.id, p_joueur, dc);
  return jsonb_build_object('tournoi', t.nom, 'ceinture', public.titre_nom(t.division), 'pseudo', (select pseudo from public.joueurs where id = p_joueur),
    'inscrits', n + 1, 'max', mx);
end $$;

create or replace function public.tournoi_quitter_j(p_joueur uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois;
begin
  select * into t from public.tournois where statut in ('inscriptions', 'en_cours') for update;
  if t.id is null then raise exception 'Aucun tournoi n''est ouvert en ce moment'; end if;
  if t.statut = 'en_cours' then raise exception 'Le tournoi « % » a déjà commencé : impossible de se retirer', t.nom; end if;
  delete from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = p_joueur;
  if not found then raise exception 'Tu n''es pas inscrit au tournoi « % »', t.nom; end if;
  return jsonb_build_object('tournoi', t.nom, 'pseudo', (select pseudo from public.joueurs where id = p_joueur),
    'inscrits', (select count(*) from public.tournoi_inscrits where tournoi_id = t.id));
end $$;

revoke all on function public.tournoi_tour_nom(int, int) from public, anon, authenticated;
revoke all on function public.tournoi_deck_json(uuid, bigint[]) from public, anon, authenticated;
revoke all on function public.tournoi_json(bigint, boolean) from public, anon, authenticated;
revoke all on function public.tournoi_prochain(bigint) from public, anon, authenticated;
revoke all on function public.tournoi_avancer(bigint) from public, anon, authenticated;
revoke all on function public.tournoi_terminer(bigint) from public, anon, authenticated;
revoke all on function public.tournoi_recompenser(bigint, uuid, int) from public, anon, authenticated;
revoke all on function public.tournoi_match_nom(int, int, boolean) from public, anon, authenticated;
revoke all on function public.tournoi_recompenses_json(bigint) from public, anon, authenticated;
revoke all on function public.tournoi_tirer(bigint) from public, anon, authenticated;
revoke all on function public.tournoi_inscrire_j(uuid) from public, anon, authenticated;
revoke all on function public.tournoi_quitter_j(uuid) from public, anon, authenticated;

-- ================= Lecture publique : le tournoi, le palmarès, l'armoire =================
-- Le tournoi demandé, sinon le tournoi ouvert, sinon le dernier terminé ; avec la liste des tournois passés
create or replace function public.tournoi_etat(p_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  i := coalesce(p_id,
    (select id from public.tournois where statut in ('inscriptions', 'en_cours') limit 1),
    (select id from public.tournois where statut = 'termine' order by fini_le desc limit 1));
  return jsonb_build_object(
    'tournoi', case when i is null then null else public.tournoi_json(i, true) end,
    'pause', public.reglage_num('tournoi_pause_secondes', 8),
    -- palmarès : les tournois terminés (sauf celui dont la finale est encore à l'écran)
    'passes', (select coalesce(jsonb_agg(x order by x->>'fini_le' desc), '[]') from (
        select jsonb_build_object('id', t.id, 'nom', t.nom, 'division', t.division, 'fini_le', t.fini_le,
               'pseudo_gagnant', j.pseudo, 'joueurs', (select count(*) from public.tournoi_inscrits n where n.tournoi_id = t.id)) x
        from public.tournois t left join public.joueurs j on j.id = t.gagnant
        where t.statut = 'termine' and not public.tournoi_fin_cachee(t.id)
        order by t.fini_le desc limit 30) y));
end $$;

-- La finale ou la petite finale de ce tournoi est-elle encore à l'écran ? (le résultat du tournoi reste caché)
create or replace function public.tournoi_fin_cachee(p_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournoi_combats mn join public.tournoi_matchs m on m.id = mn.match_id
    where m.tournoi_id = p_id and m.suivant_id is null and mn.fini_le > now() - interval '15 minutes'
      and not exists (select 1 from public.historique_combats h where h.seed::text = mn.seed and h.affiche));
$$;
revoke all on function public.tournoi_fin_cachee(bigint) from public, anon, authenticated;

-- L'armoire à trophées d'un joueur (profil)
create or replace function public.trophees_joueur(p_joueur uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', tr.id, 'tournoi', tr.tournoi_id, 'place', tr.place, 'nom', tr.nom,
           'division', tr.division, 'ceinture', public.titre_nom(tr.division), 'image', tr.image, 'le', tr.attribue_le)
           order by tr.place, tr.attribue_le desc), '[]')
  from public.trophees tr
  where tr.joueur_id = p_joueur and (tr.tournoi_id is null or not public.tournoi_fin_cachee(tr.tournoi_id));
$$;

revoke all on function public.tournoi_etat(bigint) from public;
revoke all on function public.trophees_joueur(uuid) from public;
grant execute on function public.tournoi_etat(bigint) to anon, authenticated, service_role;
grant execute on function public.trophees_joueur(uuid) to anon, authenticated, service_role;

-- ================= Site : le joueur s'inscrit ou se retire =================
create or replace function public.tournoi_inscrire_site()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour t''inscrire'; end if;
  return public.tournoi_inscrire_j(auth.uid());
end $$;
create or replace function public.tournoi_quitter_site()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord'; end if;
  return public.tournoi_quitter_j(auth.uid());
end $$;
revoke all on function public.tournoi_inscrire_site() from public, anon;
revoke all on function public.tournoi_quitter_site() from public, anon;
grant execute on function public.tournoi_inscrire_site() to authenticated;
grant execute on function public.tournoi_quitter_site() to authenticated;

-- ================= Admin (site) : créer, lancer, régler, annuler, retirer un inscrit =================
create or replace function public.tournoi_creer(p_nom text, p_division text, p_max int default null, p_trophee text default null,
  p_auto boolean default true)
returns bigint language plpgsql security definer set search_path = public as $$
declare i bigint; prec bigint;
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Donne un nom au tournoi'; end if;
  if p_division not in ('rare', 'epique', 'libre') then raise exception 'Choisis le deck de championnat : rare, épique ou libre'; end if;
  if p_max is not null and (p_max < 2 or p_max > 64) then raise exception 'Le nombre maximum de joueurs va de 2 à 64'; end if;
  if exists (select 1 from public.tournois where statut in ('inscriptions', 'en_cours')) then
    raise exception 'Un tournoi est déjà ouvert : termine-le ou annule-le d''abord'; end if;
  select id into prec from public.tournois order by cree_le desc limit 1;
  insert into public.tournois (nom, division, max_joueurs, trophee, auto)
  values (trim(p_nom), p_division, p_max, nullif(trim(coalesce(p_trophee, '')), ''), coalesce(p_auto, true))
  returning id into i;
  -- les récompenses du tournoi précédent, à retoucher dans Admin > Récompenses
  insert into public.tournoi_recompenses (tournoi_id, place, gold, booster_id, boosters, dos_id, variante_id)
  select i, place, gold, booster_id, boosters, dos_id, variante_id from public.tournoi_recompenses where tournoi_id = prec;
  return i;
end $$;

-- Les récompenses d'une place (tant que le tournoi n'est pas terminé)
create or replace function public.tournoi_recompense_regler(p_id bigint, p_place int, p_gold int, p_booster int, p_boosters int,
  p_dos uuid, p_variante int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if p_place not between 1 and 4 then raise exception 'Place de 1 à 4'; end if;
  if not exists (select 1 from public.tournois where id = p_id and statut in ('inscriptions', 'en_cours')) then
    raise exception 'Ce tournoi est terminé : ses récompenses ne changent plus'; end if;
  insert into public.tournoi_recompenses (tournoi_id, place, gold, booster_id, boosters, dos_id, variante_id)
  values (p_id, p_place, greatest(0, coalesce(p_gold, 0)), p_booster, case when p_booster is null then 0 else greatest(0, coalesce(p_boosters, 0)) end,
          p_dos, p_variante)
  on conflict (tournoi_id, place) do update set gold = excluded.gold, booster_id = excluded.booster_id, boosters = excluded.boosters,
    dos_id = excluded.dos_id, variante_id = excluded.variante_id;
end $$;

create or replace function public.tournoi_lancer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  perform public.tournoi_tirer(p_id);
end $$;

create or replace function public.tournoi_regler(p_id bigint, p_auto boolean, p_trophee text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  update public.tournois set auto = coalesce(p_auto, auto), trophee = coalesce(nullif(trim(coalesce(p_trophee, '')), ''), trophee) where id = p_id;
end $$;

-- Annuler un tournoi ouvert : il disparaît du palmarès, personne ne reçoit de trophée
create or replace function public.tournoi_annuler(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  update public.tournois set statut = 'annule', fini_le = now() where id = p_id and statut in ('inscriptions', 'en_cours');
  if not found then raise exception 'Ce tournoi n''est plus ouvert'; end if;
end $$;

create or replace function public.tournoi_retirer(p_id bigint, p_joueur uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if not exists (select 1 from public.tournois where id = p_id and statut = 'inscriptions') then
    raise exception 'Les inscriptions de ce tournoi sont fermées'; end if;
  delete from public.tournoi_inscrits where tournoi_id = p_id and joueur_id = p_joueur;
end $$;

-- Les tournois pour l'admin (tous, annulés compris)
create or replace function public.tournois_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom, 'division', t.division, 'statut', t.statut,
            'cree_le', t.cree_le, 'fini_le', t.fini_le, 'pseudo_gagnant', j.pseudo,
            'joueurs', (select count(*) from public.tournoi_inscrits n where n.tournoi_id = t.id)) order by t.cree_le desc), '[]')
          from public.tournois t left join public.joueurs j on j.id = t.gagnant);
end $$;

revoke all on function public.tournoi_creer(text, text, int, text, boolean) from public, anon;
revoke all on function public.tournoi_recompense_regler(bigint, int, int, int, int, uuid, int) from public, anon;
revoke all on function public.tournoi_lancer(bigint) from public, anon;
revoke all on function public.tournoi_regler(bigint, boolean, text) from public, anon;
revoke all on function public.tournoi_annuler(bigint) from public, anon;
revoke all on function public.tournoi_retirer(bigint, uuid) from public, anon;
revoke all on function public.tournois_admin() from public, anon;
grant execute on function public.tournoi_creer(text, text, int, text, boolean) to authenticated;
grant execute on function public.tournoi_recompense_regler(bigint, int, int, int, int, uuid, int) to authenticated;
grant execute on function public.tournoi_lancer(bigint) to authenticated;
grant execute on function public.tournoi_regler(bigint, boolean, text) to authenticated;
grant execute on function public.tournoi_annuler(bigint) to authenticated;
grant execute on function public.tournoi_retirer(bigint, uuid) to authenticated;
grant execute on function public.tournois_admin() to authenticated;

-- ================= swift-responder (clé de service) : inscription par le chat, combat suivant, résultat =================
create or replace function public.tournoi_inscrire(p_twitch_id text)
returns jsonb language sql security definer set search_path = public as $$
  select public.tournoi_inscrire_j(public.titre_joueur(p_twitch_id));
$$;
create or replace function public.tournoi_quitter(p_twitch_id text)
returns jsonb language sql security definer set search_path = public as $$
  select public.tournoi_quitter_j(public.titre_joueur(p_twitch_id));
$$;

-- Le combat suivant : lance le tournoi s'il est encore aux inscriptions, puis renvoie le prochain match et les deux decks.
-- Le joueur qui commence (côté 0 du moteur) change à chaque combat du match : « inverse » dit si b joue en premier.
create or replace function public.tournoi_preparer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; m public.tournoi_matchs; ca bigint[]; cb bigint[]; num int; nt int; inv boolean; lance boolean := false;
begin
  select * into t from public.tournois where statut in ('inscriptions', 'en_cours') for update;
  if t.id is null then raise exception 'Aucun tournoi en cours : crée-le dans Admin > Tournois'; end if;
  if t.statut = 'inscriptions' then perform public.tournoi_tirer(t.id); lance := true; end if;
  m := public.tournoi_prochain(t.id);
  if m.id is null then raise exception 'Plus aucun match à jouer dans le tournoi « % »', t.nom; end if;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = t.id;
  select cartes into ca from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = m.a;
  select cartes into cb from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = m.b;
  num := m.score_a + m.score_b + m.nuls + 1;
  inv := num % 2 = 0;
  return jsonb_build_object('tournoi', t.id, 'nom', t.nom, 'division', t.division, 'ceinture', public.titre_nom(t.division),
    'lance', lance, 'auto', t.auto,
    'match', jsonb_build_object('id', m.id, 'tour', m.tour, 'nom_tour', public.tournoi_match_nom(m.tour, nt, m.petite), 'petite', m.petite,
       'format', m.format,
       'num', num, 'score_a', m.score_a, 'score_b', m.score_b),
    'inverse', inv,
    'a', public.tournoi_deck_json(m.a, ca), 'b', public.tournoi_deck_json(m.b, cb),
    'tableau', public.tournoi_json(t.id, false));
end $$;

-- Le combat a eu lieu : son résultat, le score, le vainqueur du match qui passe au tour suivant, la fin du tournoi
create or replace function public.tournoi_conclure(p_match bigint, p_gagnant uuid, p_seed text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; t public.tournois; besoin int; nt int; prochain public.tournoi_matchs; fini boolean := false;
begin
  select * into m from public.tournoi_matchs where id = p_match for update;
  if m.id is null then raise exception 'Match introuvable'; end if;
  if m.gagnant is not null then raise exception 'Ce match est déjà terminé'; end if;
  select * into t from public.tournois where id = m.tournoi_id;
  if t.statut <> 'en_cours' then raise exception 'Le tournoi « % » n''est plus en cours', t.nom; end if;
  if p_gagnant is not null and p_gagnant not in (m.a, m.b) then raise exception 'Ce joueur ne joue pas ce match'; end if;
  insert into public.tournoi_combats (match_id, num, gagnant, seed) values (m.id, m.score_a + m.score_b + m.nuls + 1, p_gagnant, coalesce(p_seed, ''));
  besoin := m.format / 2 + 1;   -- BO1 : 1, BO3 : 2, BO5 : 3
  update public.tournoi_matchs set score_a = score_a + (p_gagnant is not distinct from a and p_gagnant is not null)::int,
                                   score_b = score_b + (p_gagnant is not distinct from b and p_gagnant is not null)::int,
                                   nuls = nuls + (p_gagnant is null)::int
   where id = m.id returning * into m;
  if m.score_a >= besoin or m.score_b >= besoin then
    update public.tournoi_matchs set gagnant = case when m.score_a >= besoin then a else b end, fini_le = now()
     where id = m.id returning * into m;
    perform public.tournoi_avancer(m.id);
    fini := true;
  end if;
  select * into t from public.tournois where id = m.tournoi_id;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = t.id;
  prochain := public.tournoi_prochain(t.id);
  return jsonb_build_object('nom', t.nom, 'match_fini', fini, 'score_a', m.score_a, 'score_b', m.score_b, 'nuls', m.nuls,
    'besoin', besoin, 'nom_tour', public.tournoi_match_nom(m.tour, nt, m.petite), 'petite', m.petite,
    'finale', m.suivant_id is null and not m.petite,
    -- demi-finale : le perdant joue la petite finale, ou il est 3e sans la jouer (l'autre demi-finale était un qualifié d'office)
    'vers_petite', fini and m.perdant_id is not null and not coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    'troisieme', fini and m.perdant_id is not null and coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    'gagnant', (select pseudo from public.joueurs where id = m.gagnant),
    'perdant', case when fini then (select pseudo from public.joueurs where id = case when m.gagnant = m.a then m.b else m.a end) end,
    'tournoi_fini', t.statut = 'termine', 'champion', (select pseudo from public.joueurs where id = t.gagnant),
    'suite', t.statut = 'en_cours' and t.auto and prochain.id is not null,
    'prochain', case when prochain.id is null then null else jsonb_build_object('nom_tour', public.tournoi_match_nom(prochain.tour, nt, prochain.petite),
       'a', (select pseudo from public.joueurs where id = prochain.a), 'b', (select pseudo from public.joueurs where id = prochain.b)) end,
    'tableau', case when t.statut = 'termine' then public.tournoi_json(t.id, false) end);
end $$;

revoke all on function public.tournoi_inscrire(text) from public, anon, authenticated;
revoke all on function public.tournoi_quitter(text) from public, anon, authenticated;
revoke all on function public.tournoi_preparer() from public, anon, authenticated;
revoke all on function public.tournoi_conclure(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.tournoi_inscrire(text) to service_role;
grant execute on function public.tournoi_quitter(text) to service_role;
grant execute on function public.tournoi_preparer() to service_role;
grant execute on function public.tournoi_conclure(bigint, uuid, text) to service_role;
