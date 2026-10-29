-- 50-tournoi-suisse.sql : un deuxième format de tournoi, rondes suisses puis double élimination
--
--   - Format (Admin > Tournois, tant que les inscriptions sont ouvertes) : « elimination » (le tableau de 46-tournois.sql,
--     inchangé) ou « suisse ».
--   - Rondes suisses (BO1, réglage tournoi_format_suisse) : à chaque ronde, chaque joueur affronte un joueur au même
--     nombre de victoires qu'il n'a pas encore rencontré (à défaut, une revanche). Nombre impair : le joueur le moins bien
--     classé qui n'a pas encore été exempt l'est, et marque une victoire. Nombre de rondes selon les inscrits :
--     2 joueurs 1, 3 joueurs 2, 4 à 8 joueurs 3, 9 à 16 joueurs 4, 17 à 32 joueurs 5, au-delà 6.
--   - Classement : victoires, puis force des adversaires (Buchholz : le total des victoires des adversaires rencontrés,
--     exemption non comptée), puis face-à-face entre ex aequo, puis un tirage fixe (le même à chaque lecture).
--   - Qualifiés : les 4 premiers (moins de 16 inscrits) ou les 8 premiers (16 et plus) ; 2 avec 2 ou 3 inscrits.
--   - Double élimination : chaque qualifié a 2 vies, quel que soit son bilan des rondes suisses. Une défaite dans le
--     winner bracket fait descendre dans le loser bracket, une défaite dans le loser bracket élimine. Têtes de série :
--     1 contre 4 et 2 contre 3 (top 4) ; 1-8, 4-5, 2-7, 3-6 (top 8). BO3 (réglage tournoi_format_double), finale du loser
--     en BO5 (tournoi_format_finale_loser) : son vainqueur va en grande finale, son perdant est 3e.
--   - Grande finale (BO5, tournoi_format_grande) : le vainqueur du winner bracket (côté a) contre celui du loser bracket
--     (côté b). Si b gagne, chacun a perdu une fois : la revanche (BO5) décide. Avec 2 qualifiés : une finale seule.
--   - Places : 1 et 2 (grande finale ou revanche), 3 (perdant de la finale du loser), 4 (perdant du match du loser
--     d'avant) ; avec 2 qualifiés, 3 et 4 selon le classement suisse. Trophées, écharpes et récompenses comme avant.
--
-- À coller une fois dans l'éditeur SQL de Supabase, après 49-echarpe-participation.sql ; peut être relancé sans risque.

insert into public.reglages_jeu (cle, valeur) values
  ('tournoi_format_suisse', '1'),         -- BO1 pendant les rondes suisses
  ('tournoi_format_double', '3'),         -- BO3 dans le winner et le loser bracket
  ('tournoi_format_finale_loser', '5'),   -- BO5 en finale du loser (qualifie pour la grande finale, le perdant est 3e)
  ('tournoi_format_grande', '5')          -- BO5 en grande finale et en revanche
on conflict (cle) do nothing;

alter table public.tournois add column if not exists format text not null default 'elimination';
alter table public.tournois drop constraint if exists tournois_format_check;
alter table public.tournois add constraint tournois_format_check check (format in ('elimination', 'suisse'));
alter table public.tournois add column if not exists rondes int;   -- format suisse : nombre de rondes suisses
alter table public.tournois add column if not exists coupe int;    -- format suisse : nombre de qualifiés (2, 4 ou 8)

-- tableau : le tableau à élimination directe ; suisse, winner, loser, grande, revanche : le format suisse
alter table public.tournoi_matchs add column if not exists phase text not null default 'tableau';
alter table public.tournoi_matchs drop constraint if exists tournoi_matchs_phase_check;
alter table public.tournoi_matchs add constraint tournoi_matchs_phase_check
  check (phase in ('tableau', 'suisse', 'winner', 'loser', 'grande', 'revanche'));
alter table public.tournoi_matchs add column if not exists nom text;   -- format suisse : le nom du match (« Ronde 2 »…)

-- Le format d'un tournoi, tant que les inscriptions sont ouvertes (Admin > Tournois)
create or replace function public.tournoi_format(p_id bigint, p_format text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if p_format not in ('elimination', 'suisse') then raise exception 'Format inconnu : elimination ou suisse'; end if;
  update public.tournois set format = p_format where id = p_id and statut = 'inscriptions';
  if not found then raise exception 'Le format ne change plus une fois le tournoi lancé'; end if;
end $$;
revoke all on function public.tournoi_format(bigint, text) from public, anon;
grant execute on function public.tournoi_format(bigint, text) to authenticated;

-- ================= Rondes suisses =================
-- Le classement suisse, lu dans la copie de travail _tm (vraie ou sans spoil, voir tournoi_json)
create or replace function public.tournoi_suisse_classement(p_id bigint)
returns table (joueur uuid, victoires int, defaites int, buchholz int, rang int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with fin as (select * from _tm where phase = 'suisse' and gagnant is not null),
  js as (select i.joueur_id id from public.tournoi_inscrits i where i.tournoi_id = p_id),
  w as (select js.id, count(f.id) filter (where f.gagnant = js.id)::int v,
               count(f.id) filter (where f.gagnant <> js.id and not f.exempt)::int d
        from js left join fin f on js.id = f.a or js.id = f.b group by js.id),
  opp as (select js.id, case when f.a = js.id then f.b else f.a end o
          from js join fin f on (js.id = f.a or js.id = f.b) and not f.exempt),
  bu as (select w.id, coalesce(sum(w2.v), 0)::int b from w left join opp on opp.id = w.id
         left join w w2 on w2.id = opp.o group by w.id),
  vb as (select w.id, w.v, w.d, bu.b from w join bu on bu.id = w.id),
  -- face-à-face : victoires contre les ex aequo (mêmes victoires, même Buchholz)
  h as (select x.id, (select count(*) from fin f join vb y on y.id = case when f.a = x.id then f.b else f.a end
                       where f.gagnant = x.id and not f.exempt and y.v = x.v and y.b = x.b)::int hh from vb x)
  select vb.id, vb.v, vb.d, vb.b,
         (row_number() over (order by vb.v desc, vb.b desc, h.hh desc, md5(vb.id::text || p_id::text)))::int
  from vb join h on h.id = vb.id;
end $$;
revoke all on function public.tournoi_suisse_classement(bigint) from public, anon, authenticated;

-- La copie de travail _tm, remplie avec les vrais matchs
create or replace function public.tournoi_tm_remplir(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  create temp table if not exists _tm (like public.tournoi_matchs) on commit drop;
  delete from _tm where true;
  insert into _tm select * from public.tournoi_matchs where tournoi_id = p_id;
end $$;
revoke all on function public.tournoi_tm_remplir(bigint) from public, anon, authenticated;

-- Deux joueurs se sont-ils déjà affrontés en ronde suisse ? (copie de travail _tm)
create or replace function public.tournoi_deja_joue(x uuid, y uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return exists (select 1 from _tm where phase = 'suisse' and not exempt and ((a = x and b = y) or (a = y and b = x)));
end $$;
revoke all on function public.tournoi_deja_joue(uuid, uuid) from public, anon, authenticated;

-- Les matchs d'une ronde suisse : au même nombre de victoires, jamais deux fois le même adversaire si c'est possible
create or replace function public.tournoi_suisse_ronde(p_id bigint, p_ronde int)
returns void language plpgsql security definer set search_path = public as $$
declare ord uuid[]; libre uuid[]; pa uuid[] := '{}'; pb uuid[] := '{}'; x uuid; y uuid; ex uuid; k int; fs int; i int; j int;
        choisi int;
begin
  perform public.tournoi_tm_remplir(p_id);
  fs := greatest(1, public.reglage_num('tournoi_format_suisse', 1)::int);
  if p_ronde = 1 then
    ord := array(select joueur_id from public.tournoi_inscrits where tournoi_id = p_id order by random());
  else
    ord := array(select joueur from public.tournoi_suisse_classement(p_id) order by rang);
  end if;
  -- nombre impair : le moins bien classé qui n'a pas encore été exempt l'est (une victoire)
  if cardinality(ord) % 2 = 1 then
    for k in reverse cardinality(ord) .. 1 loop
      if not exists (select 1 from _tm where phase = 'suisse' and exempt and a = ord[k]) then ex := ord[k]; exit; end if;
    end loop;
    if ex is null then ex := ord[cardinality(ord)]; end if;
    ord := array_remove(ord, ex);
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, exempt, gagnant, fini_le)
    values (p_id, p_ronde, 1000, fs, 'suisse', 'Ronde ' || p_ronde, ex, true, ex, now());
  end if;
  -- du premier au dernier du classement : chacun prend le premier adversaire libre qu'il n'a pas encore rencontré
  libre := ord;
  while cardinality(libre) >= 2 loop
    x := libre[1];
    choisi := null;
    for j in 2 .. cardinality(libre) loop
      if not public.tournoi_deja_joue(x, libre[j]) then choisi := j; exit; end if;
    end loop;
    y := libre[coalesce(choisi, 2)];   -- tous déjà rencontrés : une revanche, que l'échange ci-dessous tente d'éviter
    pa := pa || x; pb := pb || y;
    libre := array_remove(array_remove(libre, x), y);
  end loop;
  -- une revanche restante : échange d'adversaires avec un autre match, si les deux nouveaux matchs sont inédits
  for i in 1 .. coalesce(cardinality(pa), 0) loop
    if public.tournoi_deja_joue(pa[i], pb[i]) then
      for j in 1 .. cardinality(pa) loop
        continue when j = i;
        if not public.tournoi_deja_joue(pa[i], pa[j]) and not public.tournoi_deja_joue(pb[i], pb[j]) then
          y := pb[i]; pb[i] := pa[j]; pa[j] := y; exit;
        elsif not public.tournoi_deja_joue(pa[i], pb[j]) and not public.tournoi_deja_joue(pb[i], pa[j]) then
          y := pb[i]; pb[i] := pb[j]; pb[j] := y; exit;
        end if;
      end loop;
    end if;
  end loop;
  for i in 1 .. coalesce(cardinality(pa), 0) loop
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, p_ronde, i, fs, 'suisse', 'Ronde ' || p_ronde, pa[i], pb[i]);
  end loop;
end $$;
revoke all on function public.tournoi_suisse_ronde(bigint, int) from public, anon, authenticated;

-- Après la dernière ronde : le winner et le loser bracket des qualifiés, la grande finale et sa revanche
create or replace function public.tournoi_double_creer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; s uuid[]; c int; t0 int; fd int; fl int; fg int;
begin
  select * into t from public.tournois where id = p_id;
  perform public.tournoi_tm_remplir(p_id);
  s := array(select joueur from public.tournoi_suisse_classement(p_id) order by rang);
  c := t.coupe;
  t0 := t.rondes;
  fd := greatest(1, public.reglage_num('tournoi_format_double', 3)::int);
  fl := greatest(1, public.reglage_num('tournoi_format_finale_loser', 5)::int);
  fg := greatest(1, public.reglage_num('tournoi_format_grande', 5)::int);
  if c = 2 then
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, t0 + 1, 1, fg, 'grande', 'Finale', s[1], s[2]);
    return;
  end if;
  if c = 4 then
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b) values
      (p_id, t0 + 1, 1, fd, 'winner', 'Demi-finale du winner', s[1], s[4]),
      (p_id, t0 + 1, 2, fd, 'winner', 'Demi-finale du winner', s[2], s[3]),
      (p_id, t0 + 2, 1, fd, 'loser', 'Loser bracket', null, null),
      (p_id, t0 + 3, 1, fd, 'winner', 'Finale du winner', null, null),
      (p_id, t0 + 4, 1, fl, 'loser', 'Finale du loser', null, null),
      (p_id, t0 + 5, 1, fg, 'grande', 'Grande finale', null, null),
      (p_id, t0 + 6, 1, fg, 'revanche', 'Revanche de la grande finale', null, null);
    -- winner bracket : le vainqueur monte, le perdant descend dans le loser bracket
    update public.tournoi_matchs m set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 3),
      suivant_cote = m.position - 1,
      perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 2), perdant_cote = m.position - 1
     where m.tournoi_id = p_id and m.tour = t0 + 1;
    update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 4), suivant_cote = 0
     where tournoi_id = p_id and tour = t0 + 2;
    update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 5), suivant_cote = 0,
      perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 4), perdant_cote = 1
     where tournoi_id = p_id and tour = t0 + 3;
    update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 5), suivant_cote = 1
     where tournoi_id = p_id and tour = t0 + 4;
    return;
  end if;
  -- top 8
  insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b) values
    (p_id, t0 + 1, 1, fd, 'winner', 'Quart de finale du winner', s[1], s[8]),
    (p_id, t0 + 1, 2, fd, 'winner', 'Quart de finale du winner', s[4], s[5]),
    (p_id, t0 + 1, 3, fd, 'winner', 'Quart de finale du winner', s[2], s[7]),
    (p_id, t0 + 1, 4, fd, 'winner', 'Quart de finale du winner', s[3], s[6]),
    (p_id, t0 + 2, 1, fd, 'loser', 'Loser bracket, 1er tour', null, null),
    (p_id, t0 + 2, 2, fd, 'loser', 'Loser bracket, 1er tour', null, null),
    (p_id, t0 + 3, 1, fd, 'winner', 'Demi-finale du winner', null, null),
    (p_id, t0 + 3, 2, fd, 'winner', 'Demi-finale du winner', null, null),
    (p_id, t0 + 4, 1, fd, 'loser', 'Loser bracket, 2e tour', null, null),
    (p_id, t0 + 4, 2, fd, 'loser', 'Loser bracket, 2e tour', null, null),
    (p_id, t0 + 5, 1, fd, 'winner', 'Finale du winner', null, null),
    (p_id, t0 + 6, 1, fd, 'loser', 'Demi-finale du loser', null, null),
    (p_id, t0 + 7, 1, fl, 'loser', 'Finale du loser', null, null),
    (p_id, t0 + 8, 1, fg, 'grande', 'Grande finale', null, null),
    (p_id, t0 + 9, 1, fg, 'revanche', 'Revanche de la grande finale', null, null);
  -- quarts du winner : vainqueur en demi-finale du winner, perdant au 1er tour du loser
  update public.tournoi_matchs m set
    suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 3 and position = (m.position + 1) / 2),
    suivant_cote = (m.position - 1) % 2,
    perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 2 and position = (m.position + 1) / 2),
    perdant_cote = (m.position - 1) % 2
   where m.tournoi_id = p_id and m.tour = t0 + 1;
  -- 1er tour du loser : au 2e tour, contre un perdant des demi-finales du winner
  update public.tournoi_matchs m set
    suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 4 and position = m.position), suivant_cote = 0
   where m.tournoi_id = p_id and m.tour = t0 + 2;
  -- demi-finales du winner : vainqueur en finale du winner, perdant croisé au 2e tour du loser (pas de revanche immédiate)
  update public.tournoi_matchs m set
    suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 5), suivant_cote = m.position - 1,
    perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 4 and position = 3 - m.position),
    perdant_cote = 1
   where m.tournoi_id = p_id and m.tour = t0 + 3;
  update public.tournoi_matchs m set
    suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 6), suivant_cote = m.position - 1
   where m.tournoi_id = p_id and m.tour = t0 + 4;
  update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 8), suivant_cote = 0,
    perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 7), perdant_cote = 1
   where tournoi_id = p_id and tour = t0 + 5;
  update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 7), suivant_cote = 0
   where tournoi_id = p_id and tour = t0 + 6;
  update public.tournoi_matchs set suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = t0 + 8), suivant_cote = 1
   where tournoi_id = p_id and tour = t0 + 7;
end $$;
revoke all on function public.tournoi_double_creer(bigint) from public, anon, authenticated;

-- ================= Les fonctions de 46-tournois.sql, avec le format suisse =================
-- Le vainqueur d'un match passe au suivant ; quand plus rien ne reste à jouer, le tournoi se termine
create or replace function public.tournoi_avancer(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; t public.tournois; perdant uuid; autre public.tournoi_matchs;
begin
  select * into m from public.tournoi_matchs where id = p_match;
  if m.gagnant is null then return; end if;
  select * into t from public.tournois where id = m.tournoi_id;
  perdant := case when m.exempt then null when m.gagnant = m.a then m.b else m.a end;
  -- rondes suisses : la ronde finie, la suivante, ou le bracket des qualifiés après la dernière
  if m.phase = 'suisse' then
    if not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'suisse' and tour = m.tour and gagnant is null) then
      if m.tour < t.rondes then perform public.tournoi_suisse_ronde(t.id, m.tour + 1);
      else perform public.tournoi_double_creer(t.id); end if;
    end if;
    return;
  end if;
  -- grande finale : le vainqueur du winner bracket (a) gagne le tournoi ; sinon, la revanche décide
  if m.phase = 'grande' then
    if m.gagnant = m.a or t.coupe = 2 then
      delete from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'revanche';
      perform public.tournoi_terminer(m.tournoi_id);
    else
      update public.tournoi_matchs set a = m.a, b = m.b where tournoi_id = m.tournoi_id and phase = 'revanche';
    end if;
    return;
  end if;
  if m.phase = 'revanche' then perform public.tournoi_terminer(m.tournoi_id); return; end if;
  if m.suivant_id is not null then
    update public.tournoi_matchs set a = case when m.suivant_cote = 0 then m.gagnant else a end,
                                     b = case when m.suivant_cote = 1 then m.gagnant else b end where id = m.suivant_id;
  end if;
  -- winner bracket : le perdant descend dans le loser bracket (2 vies : jamais de qualifié d'office ici)
  if m.phase = 'winner' then
    if m.perdant_id is not null and perdant is not null then
      update public.tournoi_matchs set a = case when m.perdant_cote = 0 then perdant else a end,
                                       b = case when m.perdant_cote = 1 then perdant else b end where id = m.perdant_id;
    end if;
    return;
  end if;
  if m.phase = 'loser' then return; end if;
  -- tableau à élimination directe (46-tournois.sql)
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

-- Tirage et début du tournoi : le tableau (élimination directe), ou la 1re ronde suisse
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
  delete from public.tournoi_matchs where tournoi_id = p_id;
  if t.format = 'suisse' then
    update public.tournois set
      rondes = case when n <= 2 then 1 when n = 3 then 2 when n <= 8 then 3 when n <= 16 then 4 when n <= 32 then 5 else 6 end,
      coupe = case when n < 4 then 2 when n < 16 then 4 else 8 end
     where id = p_id;
    perform public.tournoi_suisse_ronde(p_id, 1);
    update public.tournois set statut = 'en_cours', lance_le = now() where id = p_id;
    return;
  end if;
  while p < n loop p := p * 2; nt := nt + 1; end loop;
  -- ordre classique d'un tableau : la tête de série 1 contre la dernière, etc. ; les places en trop sont les qualifiés d'office,
  -- et elles ne tombent jamais l'une contre l'autre
  while cardinality(ord) < p loop
    nxt := '{}'; l := cardinality(ord);
    foreach x in array ord loop nxt := nxt || x || (2 * l + 1 - x); end loop;
    ord := nxt;
  end loop;
  js := array(select joueur_id from public.tournoi_inscrits where tournoi_id = p_id order by random());   -- tirage au sort
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

-- Fin du tournoi : places, trophées (1 à 3), récompenses (1 à 4), écharpe pour chaque inscrit (49-echarpe-participation.sql)
create or replace function public.tournoi_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; f public.tournoi_matchs; pf public.tournoi_matchs; nt int; pl uuid[]; img text[];
        g public.tournoi_matchs; lf public.tournoi_matchs; l4 public.tournoi_matchs; s uuid[];
begin
  select * into t from public.tournois where id = p_id for update;
  if t.statut <> 'en_cours' then return; end if;
  if t.format = 'suisse' then
    -- la revanche si elle a été jouée, sinon la grande finale
    select * into g from public.tournoi_matchs where tournoi_id = p_id and phase = 'revanche' and gagnant is not null;
    if g.id is null then select * into g from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande'; end if;
    select * into lf from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser' order by tour desc limit 1;
    select * into l4 from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser' and suivant_id = lf.id;
    pl := array[g.gagnant, case when g.gagnant = g.a then g.b else g.a end,
                case when lf.gagnant = lf.a then lf.b else lf.a end, case when l4.gagnant = l4.a then l4.b else l4.a end];
    if t.coupe = 2 then
      perform public.tournoi_tm_remplir(p_id);
      s := array(select joueur from public.tournoi_suisse_classement(p_id) where joueur <> all(array_remove(pl, null)) order by rang);
      pl[3] := s[1]; pl[4] := s[2];
    end if;
    f := g;
  else
    select max(tour) into nt from public.tournoi_matchs where tournoi_id = p_id;
    select * into f from public.tournoi_matchs where tournoi_id = p_id and tour = nt and not petite;
    select * into pf from public.tournoi_matchs where tournoi_id = p_id and petite;
    pl := array[f.gagnant, case when f.gagnant = f.a then f.b else f.a end,
                pf.gagnant, case when pf.exempt or pf.gagnant is null then null when pf.gagnant = pf.a then pf.b else pf.a end];
  end if;
  img := array[t.trophee, coalesce(t.trophee_2, t.trophee), coalesce(t.trophee_3, t.trophee)];
  update public.tournois set statut = 'termine', fini_le = now(), gagnant = pl[1] where id = p_id;
  for i in 1 .. 4 loop
    if pl[i] is not null then
      if i <= 3 then
        insert into public.trophees (joueur_id, tournoi_id, place, nom, division, image) values (pl[i], t.id, i, t.nom, t.division, img[i]);
      end if;
      perform public.tournoi_recompenser(t.id, pl[i], i);
    end if;
  end loop;
  insert into public.trophees (joueur_id, tournoi_id, place, nom, division, image)
  select i.joueur_id, t.id, 0, t.nom, t.division, t.echarpe from public.tournoi_inscrits i where i.tournoi_id = t.id;
end $$;

-- Le tableau d'un tournoi (48-tournoi-json-delete.sql), avec le format, le nom et la phase de chaque match, et le
-- classement suisse. Sans spoil : une ronde ou un bracket créé par un combat encore à l'écran est caché lui aussi.
create or replace function public.tournoi_json(p_id bigint, p_masquer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; m public.tournoi_matchs; k record; nt int; caches bigint[] := '{}'; ronde_cachee int;
begin
  select * into t from public.tournois where id = p_id;
  if t.id is null then return null; end if;
  -- copie de travail du tableau (table temporaire, effacée à la fin de la transaction)
  perform public.tournoi_tm_remplir(p_id);
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
        if m.phase = 'suisse' then ronde_cachee := least(coalesce(ronde_cachee, m.tour), m.tour); end if;
        if m.phase = 'grande' then update _tm set a = null, b = null where phase = 'revanche'; end if;
        if m.suivant_id is not null then
          update _tm set a = case when m.suivant_cote = 0 then null else a end,
                         b = case when m.suivant_cote = 1 then null else b end where id = m.suivant_id;
        end if;
        if m.perdant_id is not null then   -- le perdant n'est pas encore descendu (petite finale, loser bracket)
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
    -- la ronde suivante (ou le bracket) n'existe pas encore pour qui regarde
    if ronde_cachee is not null then delete from _tm where tour > ronde_cachee; end if;
  end if;
  select coalesce(max(tour), 0) into nt from _tm;
  return jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'division', t.division, 'ceinture', public.titre_nom(t.division), 'statut', t.statut,
    'format', t.format, 'rondes', t.rondes, 'coupe', t.coupe,
    'max_joueurs', coalesce(t.max_joueurs, public.reglage_num('tournoi_max_joueurs', 32)::int),
    'recompenses', public.tournoi_recompenses_json(t.id), 'trophee', t.trophee, 'auto', t.auto,
    'cree_le', t.cree_le, 'lance_le', t.lance_le, 'fini_le', t.fini_le,
    'gagnant', t.gagnant, 'pseudo_gagnant', (select pseudo from public.joueurs where id = t.gagnant),
    'tours', nt,
    'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('id', i.joueur_id, 'pseudo', j.pseudo) order by i.inscrit_le), '[]')
                 from public.tournoi_inscrits i left join public.joueurs j on j.id = i.joueur_id where i.tournoi_id = t.id),
    'classement', case when t.format = 'suisse' and t.statut <> 'inscriptions' then (
        select coalesce(jsonb_agg(jsonb_build_object('id', c.joueur, 'pseudo', j.pseudo, 'victoires', c.victoires,
                 'defaites', c.defaites, 'buchholz', c.buchholz, 'rang', c.rang) order by c.rang), '[]')
        from public.tournoi_suisse_classement(t.id) c left join public.joueurs j on j.id = c.joueur) end,
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'tour', x.tour, 'position', x.position, 'nom_tour', coalesce(x.nom, public.tournoi_match_nom(x.tour, nt, x.petite)),
        'petite', x.petite, 'format', x.format, 'phase', x.phase,
        'a', x.a, 'b', x.b, 'pseudo_a', ja.pseudo, 'pseudo_b', jb.pseudo, 'score_a', x.score_a, 'score_b', x.score_b,
        'nuls', x.nuls, 'exempt', x.exempt, 'gagnant', x.gagnant, 'a_l_ecran', x.id = any(caches)) order by x.tour, x.position), '[]')
      from _tm x left join public.joueurs ja on ja.id = x.a left join public.joueurs jb on jb.id = x.b));
end $$;

-- Le combat suivant (46-tournois.sql), avec le nom et la phase du match
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
    'lance', lance, 'auto', t.auto, 'format', t.format,
    'match', jsonb_build_object('id', m.id, 'tour', m.tour, 'nom_tour', coalesce(m.nom, public.tournoi_match_nom(m.tour, nt, m.petite)),
       'petite', m.petite, 'phase', m.phase, 'format', m.format,
       'num', num, 'score_a', m.score_a, 'score_b', m.score_b),
    'inverse', inv,
    'a', public.tournoi_deck_json(m.a, ca), 'b', public.tournoi_deck_json(m.b, cb),
    'tableau', public.tournoi_json(t.id, false));
end $$;

-- Le combat a eu lieu (46-tournois.sql), avec ce que le format suisse ajoute : où vont le vainqueur et le perdant,
-- la revanche de la grande finale, le bilan suisse des deux joueurs, la fin des rondes suisses
create or replace function public.tournoi_conclure(p_match bigint, p_gagnant uuid, p_seed text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; t public.tournois; besoin int; nt int; prochain public.tournoi_matchs; fini boolean := false;
        perdant uuid; vers text; vers_phase text; vers_perdant text; place int; bilans jsonb; qualifies jsonb;
        ronde_finie boolean := false;
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
    perdant := case when m.gagnant = m.a then m.b else m.a end;
    select nom, phase into vers, vers_phase from public.tournoi_matchs where id = m.suivant_id;
    -- loser bracket : le perdant est éliminé ; 3e s'il perd la finale du loser, 4e s'il perd le match d'avant
    if m.phase = 'loser' then
      place := case when vers_phase = 'grande' then 3 when vers = 'Finale du loser' then 4 end;
    end if;
    if m.phase = 'winner' then select nom into vers_perdant from public.tournoi_matchs where id = m.perdant_id; end if;
    if m.phase = 'suisse' then
      ronde_finie := not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'suisse' and tour = m.tour and gagnant is null);
      perform public.tournoi_tm_remplir(m.tournoi_id);
      select jsonb_object_agg(c.joueur::text, jsonb_build_object('v', c.victoires, 'd', c.defaites, 'rang', c.rang)) into bilans
        from public.tournoi_suisse_classement(m.tournoi_id) c where c.joueur in (m.gagnant, perdant);
      if ronde_finie and m.tour >= t.rondes then
        select jsonb_agg(j.pseudo order by c.rang) into qualifies from public.tournoi_suisse_classement(m.tournoi_id) c
          join public.joueurs j on j.id = c.joueur where c.rang <= t.coupe;
      end if;
    end if;
  end if;
  select * into t from public.tournois where id = m.tournoi_id;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = t.id;
  prochain := public.tournoi_prochain(t.id);
  return jsonb_build_object('nom', t.nom, 'format', t.format, 'phase', m.phase, 'match_fini', fini, 'score_a', m.score_a, 'score_b', m.score_b,
    'nuls', m.nuls, 'besoin', besoin, 'nom_tour', coalesce(m.nom, public.tournoi_match_nom(m.tour, nt, m.petite)), 'petite', m.petite,
    'finale', case when m.phase = 'tableau' then m.suivant_id is null and not m.petite else m.phase in ('grande', 'revanche') end,
    -- demi-finale : le perdant joue la petite finale, ou il est 3e sans la jouer (l'autre demi-finale était un qualifié d'office)
    'vers_petite', fini and m.phase = 'tableau' and m.perdant_id is not null and not coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    'troisieme', fini and m.phase = 'tableau' and m.perdant_id is not null and coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    -- format suisse
    'vers', vers, 'vers_perdant', vers_perdant,
    'elimine', fini and m.phase = 'loser',
    'place_perdant', place,
    'revanche', fini and m.phase = 'grande' and m.gagnant = m.b and t.coupe > 2,
    'bilans', bilans, 'ronde_finie', ronde_finie, 'qualifies', qualifies,
    'gagnant', (select pseudo from public.joueurs where id = m.gagnant),
    'perdant', case when fini then (select pseudo from public.joueurs where id = perdant) end,
    'tournoi_fini', t.statut = 'termine', 'champion', (select pseudo from public.joueurs where id = t.gagnant),
    'suite', t.statut = 'en_cours' and t.auto and prochain.id is not null,
    'prochain', case when prochain.id is null then null else jsonb_build_object('nom_tour', coalesce(prochain.nom, public.tournoi_match_nom(prochain.tour, nt, prochain.petite)),
       'a', (select pseudo from public.joueurs where id = prochain.a), 'b', (select pseudo from public.joueurs where id = prochain.b)) end,
    'tableau', case when t.statut = 'termine' or ronde_finie then public.tournoi_json(t.id, false) end);
end $$;

-- Le palmarès et l'armoire attendent la fin de l'animation de la dernière finale (46-tournois.sql) : en format suisse,
-- les matchs des rondes suisses n'ont pas de match suivant, seuls la grande finale et la revanche comptent
create or replace function public.tournoi_fin_cachee(p_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournoi_combats mn join public.tournoi_matchs m on m.id = mn.match_id
    where m.tournoi_id = p_id and m.suivant_id is null and m.phase in ('tableau', 'grande', 'revanche')
      and mn.fini_le > now() - interval '15 minutes'
      and not exists (select 1 from public.historique_combats h where h.seed::text = mn.seed and h.affiche));
$$;

-- Les tournois pour l'admin, avec leur format
create or replace function public.tournois_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom, 'division', t.division, 'statut', t.statut,
            'format', t.format, 'cree_le', t.cree_le, 'fini_le', t.fini_le, 'pseudo_gagnant', j.pseudo,
            'joueurs', (select count(*) from public.tournoi_inscrits n where n.tournoi_id = t.id)) order by t.cree_le desc), '[]')
          from public.tournois t left join public.joueurs j on j.id = t.gagnant);
end $$;
