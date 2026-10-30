-- 51-tournoi-loser-tetes.sql : format suisse, les suivants du classement commencent dans le loser bracket
--
--   Avant : seuls les qualifiés (les 4 ou 8 premiers des rondes suisses) jouaient le tableau final ; le loser bracket ne
--   recevait que les perdants du winner bracket.
--   Maintenant : les qualifiés commencent dans le winner bracket (2 vies) et les suivants du classement, autant que de
--   qualifiés (5e à 8e avec un top 4, 9e à 16e avec un top 8), commencent dans le loser bracket (1 vie). Le 1er tour du
--   loser bracket les oppose entre eux (5-8, 6-7 ; 9-16, 12-13, 10-15, 11-14), puis chaque tour du loser bracket reçoit les
--   perdants du winner bracket (croisés, pour éviter une revanche immédiate), jusqu'à la finale du loser contre le perdant
--   de la finale du winner. Grande finale et revanche comme avant.
--   Pas assez de joueurs pour remplir le loser bracket : une tête sans adversaire passe le 1er tour (exempt) ; un match
--   sans aucun joueur laisse passer le perdant du winner bracket qui devait l'affronter. Personne au-delà des qualifiés
--   (exactement 4 ou 8 inscrits) : le tableau d'avant, inchangé.
--   Places : 1 et 2 (grande finale ou revanche), 3 (perdant de la finale du loser), 4 (perdant de la demi-finale du loser).
--
-- À coller une fois dans l'éditeur SQL de Supabase, après 50-tournoi-suisse.sql ; peut être relancé sans risque.

-- Le tableau d'avant (50-tournoi-suisse.sql, inchangé), quand personne ne reste au-delà des qualifiés
create or replace function public.tournoi_double_creer_sans_loser(p_id bigint)
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
revoke all on function public.tournoi_double_creer_sans_loser(bigint) from public, anon, authenticated;

-- Après la dernière ronde : le winner bracket des qualifiés, le loser bracket des suivants, la grande finale et sa revanche
create or replace function public.tournoi_double_creer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; s uuid[]; lb uuid[]; c int; k int; t0 int; fd int; fl int; fg int; nr int; r int; i int; n int;
        cur int; tw int[] := '{}'; td int[] := '{}'; tre int[] := '{}'; ordre int[]; nb int := 1; x uuid; y uuid; id_m bigint;
begin
  select * into t from public.tournois where id = p_id;
  perform public.tournoi_tm_remplir(p_id);
  s := array(select joueur from public.tournoi_suisse_classement(p_id) order by rang);
  c := t.coupe;
  t0 := t.rondes;
  fd := greatest(1, public.reglage_num('tournoi_format_double', 3)::int);
  fl := greatest(1, public.reglage_num('tournoi_format_finale_loser', 5)::int);
  fg := greatest(1, public.reglage_num('tournoi_format_grande', 5)::int);
  k := case when c = 2 then 0 else least(c, greatest(0, cardinality(s) - c)) end;   -- têtes du loser bracket
  if k = 0 then perform public.tournoi_double_creer_sans_loser(p_id); return; end if;
  nr := case when c = 4 then 2 else 3 end;   -- tours du winner bracket
  ordre := case when c = 4 then array[1, 4, 2, 3] else array[1, 8, 4, 5, 2, 7, 3, 6] end;
  lb := s[c + 1 : c + k];
  -- les tours : 1er tour (winner et loser ensemble), puis pour chaque tour r du winner bracket, le tour du loser qui reçoit
  -- ses perdants, le tour suivant du winner, et le tour du loser qui réduit de moitié
  cur := t0 + 1; tw := tw || cur;
  for r in 1 .. nr loop
    cur := cur + 1; td := td || cur;
    if r < nr then cur := cur + 1; tw := tw || cur; cur := cur + 1; tre := tre || cur; end if;
  end loop;
  -- winner bracket
  for i in 1 .. c / 2 loop
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, tw[1], i, fd, 'winner', case when c = 4 then 'Demi-finale du winner' else 'Quart de finale du winner' end,
            s[ordre[2 * i - 1]], s[ordre[2 * i]]);
  end loop;
  for r in 2 .. nr loop
    n := c / (2 ^ r)::int;
    for i in 1 .. n loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom)
      values (p_id, tw[r], i, fd, 'winner', case when n = 1 then 'Finale du winner' else 'Demi-finale du winner' end);
    end loop;
  end loop;
  -- loser bracket : 1er tour (les suivants du classement, entre eux), puis les tours qui reçoivent et qui réduisent
  for i in 1 .. c / 2 loop
    x := lb[ordre[2 * i - 1]]; y := lb[ordre[2 * i]];
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, tw[1], c / 2 + i, fd, 'loser', 'Loser bracket, 1er tour', coalesce(x, y), case when x is not null then y end);
  end loop;
  for r in 1 .. nr loop
    n := c / (2 ^ r)::int;
    nb := nb + 1;
    for i in 1 .. n loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom)
      values (p_id, td[r], i, case when r = nr then fl else fd end, 'loser',
              case when r = nr then 'Finale du loser' else 'Loser bracket, ' || nb || 'e tour' end);
    end loop;
    if r < nr then
      nb := nb + 1;
      for i in 1 .. n / 2 loop
        insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom)
        values (p_id, tre[r], i, fd, 'loser', case when r + 1 = nr then 'Demi-finale du loser' else 'Loser bracket, ' || nb || 'e tour' end);
      end loop;
    end if;
  end loop;
  insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom) values
    (p_id, cur + 1, 1, fg, 'grande', 'Grande finale'),
    (p_id, cur + 2, 1, fg, 'revanche', 'Revanche de la grande finale');
  -- liens : winner (vainqueur au tour suivant ou en grande finale côté a ; perdant au loser, croisé, côté b)
  for r in 1 .. nr loop
    n := c / (2 ^ r)::int;
    update public.tournoi_matchs m set
      suivant_id = case when r < nr then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tw[r + 1] and position = (m.position + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande') end,
      suivant_cote = case when r < nr then (m.position - 1) % 2 else 0 end,
      perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[r] and position = n - m.position + 1),
      perdant_cote = 1
     where m.tournoi_id = p_id and m.phase = 'winner' and m.tour = tw[r];
    -- le tour du loser qui reçoit : son vainqueur va au tour qui réduit (ou en grande finale, côté b)
    update public.tournoi_matchs m set
      suivant_id = case when r < nr then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tre[r] and position = (m.position + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande') end,
      suivant_cote = case when r < nr then (m.position - 1) % 2 else 1 end
     where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = td[r];
    -- le tour qui réduit : son vainqueur va au tour suivant du loser qui reçoit, côté a
    if r < nr then
      update public.tournoi_matchs m set
        suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[r + 1] and position = m.position), suivant_cote = 0
       where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = tre[r];
    end if;
  end loop;
  -- 1er tour du loser : son vainqueur va au tour qui reçoit les perdants du 1er tour du winner, côté a
  update public.tournoi_matchs m set
    suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[1] and position = m.position - c / 2), suivant_cote = 0
   where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = tw[1];
  -- une tête sans adversaire passe sans jouer ; un match sans personne reste vide (exempt, sans vainqueur) : le perdant du
  -- winner qui devait affronter son vainqueur passera sans jouer (tournoi_avancer)
  for id_m in select id from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser' and tour = tw[1] and b is null order by position loop
    update public.tournoi_matchs set exempt = true, gagnant = a, fini_le = now() where id = id_m;
    if exists (select 1 from public.tournoi_matchs where id = id_m and a is not null) then perform public.tournoi_avancer(id_m); end if;
  end loop;
end $$;
revoke all on function public.tournoi_double_creer(bigint) from public, anon, authenticated;

-- Le vainqueur d'un match passe au suivant (50-tournoi-suisse.sql), avec le loser bracket des suivants du classement
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
  -- winner bracket : le perdant descend dans le loser bracket (2 vies) ; si son adversaire devait venir d'un match du
  -- loser bracket resté vide (pas assez de joueurs, 51-tournoi-loser-tetes.sql), il passe sans jouer
  if m.phase = 'winner' then
    if m.perdant_id is not null and perdant is not null then
      if exists (select 1 from public.tournoi_matchs f where f.suivant_id = m.perdant_id and f.phase = 'loser' and f.exempt and f.gagnant is null) then
        update public.tournoi_matchs set a = perdant, b = null, exempt = true, gagnant = perdant, fini_le = now() where id = m.perdant_id;
        perform public.tournoi_avancer(m.perdant_id);
      else
        update public.tournoi_matchs set a = case when m.perdant_cote = 0 then perdant else a end,
                                         b = case when m.perdant_cote = 1 then perdant else b end where id = m.perdant_id;
      end if;
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

-- Le combat a eu lieu (50-tournoi-suisse.sql) : la fin des rondes suisses annonce tous ceux du tableau final
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
          join public.joueurs j on j.id = c.joueur where c.rang <= case when t.coupe = 2 then 2 else t.coupe * 2 end;   -- winner et loser bracket
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
