-- 54-abandon-tournoi-correctifs.sql (a executer une fois dans Supabase, apres 53)
-- Corrige l'abandon d'un tournoi commence (53-abandon-tournoi.sql, deja applique). Ne touche a aucun resultat existant.
--
-- Ce qui change par rapport a 53 :
-- * un forfait n'est plus marque « exempt » : il a sa propre colonne `tournoi_matchs.forfait` (le joueur qui a abandonne).
--   « exempt » reste reserve aux exemptions (pas d'adversaire), qui comptent autrement au classement suisse et a l'affichage ;
-- * winner bracket : le joueur qui abandonne ne descend pas dans le loser bracket (sa place y reste vide, son futur
--   adversaire passe) ; grande finale perdue par forfait : pas de revanche ;
-- * rondes suisses : un joueur qui a abandonne n'est plus apparie ni exempte (aucune victoire gratuite), et il ne se
--   qualifie pas pour le tableau final ; une ronde sans match a jouer enchaine toute seule (le tournoi ne bloque pas) ;
-- * fin du tournoi : un joueur qui a abandonne ne recoit ni trophee de place ni recompense (les joueurs classes apres
--   lui montent d'une place) ; l'echarpe de participation reste donnee a tous les inscrits (ses resultats d'avant comptent) ;
-- * verrous : la conclusion d'un combat prend le tournoi puis le match, dans le meme ordre que l'abandon (plus d'interblocage),
--   et un combat calcule pendant qu'un abandon passe n'est pas compte (« match gagne par forfait ») ;
-- * on ne peut abandonner que si l'on est encore en lice (un joueur deja elimine recoit un message clair) ;
-- * le tableau (tournoi_json) expose les abandons, les forfaits et les joueurs encore en lice, pour le site et l'admin.

alter table public.tournoi_matchs add column if not exists forfait uuid;

-- Le joueur a-t-il abandonne ce tournoi ?
create or replace function public.tournoi_abandonne(p_id bigint, p_joueur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_joueur is not null and exists (select 1 from public.tournoi_abandons where tournoi_id = p_id and joueur_id = p_joueur);
$$;
revoke all on function public.tournoi_abandonne(bigint, uuid) from public, anon, authenticated;

-- Le joueur peut-il encore jouer un match ? (rondes suisses en cours, ou un match du tableau pas encore fini a son nom)
create or replace function public.tournoi_en_lice(p_id bigint, p_joueur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournois where id = p_id and statut = 'en_cours')
     and exists (select 1 from public.tournoi_inscrits where tournoi_id = p_id and joueur_id = p_joueur)
     and not public.tournoi_abandonne(p_id, p_joueur)
     and (exists (select 1 from public.tournoi_matchs where tournoi_id = p_id and gagnant is null and p_joueur in (a, b))
          or exists (select 1 from public.tournoi_matchs where tournoi_id = p_id and phase = 'suisse' and gagnant is null));
$$;
revoke all on function public.tournoi_en_lice(bigint, uuid) from public, anon, authenticated;

-- Resout par forfait tous les matchs prets a jouer ou un joueur a abandonne ; renvoie le nombre de forfaits.
-- Deux joueurs qui ont abandonne : le cote A passe (il perdra par forfait son match suivant, et ne recevra rien a la fin).
drop function if exists public.tournoi_appliquer_abandons(bigint);
create function public.tournoi_appliquer_abandons(p_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; aa boolean; ab boolean; n int := 0;
begin
  loop
    exit when not exists (select 1 from public.tournois where id = p_id and statut = 'en_cours');
    select x.* into m from public.tournoi_matchs x
     where x.tournoi_id = p_id and x.gagnant is null and x.a is not null and x.b is not null
       and exists (select 1 from public.tournoi_abandons z where z.tournoi_id = p_id and z.joueur_id in (x.a, x.b))
     order by x.tour, x.petite desc, x.position limit 1 for update of x;
    exit when m.id is null;
    aa := public.tournoi_abandonne(p_id, m.a); ab := public.tournoi_abandonne(p_id, m.b);
    update public.tournoi_matchs
       set gagnant = case when aa and not ab then m.b else m.a end,
           forfait = case when aa and not ab then m.a else m.b end,
           fini_le = now()
     where id = m.id;
    perform public.tournoi_avancer(m.id);
    n := n + 1;
    if n > 500 then raise exception 'Trop de forfaits a resoudre dans le tournoi %', p_id; end if;
  end loop;
  return n;
end $$;
revoke all on function public.tournoi_appliquer_abandons(bigint) from public, anon, authenticated;

create or replace function public.tournoi_prochain(p_id bigint)
returns public.tournoi_matchs language plpgsql volatile security definer set search_path = public as $$
declare m public.tournoi_matchs;
begin
  perform public.tournoi_appliquer_abandons(p_id);
  select * into m from public.tournoi_matchs where tournoi_id = p_id and gagnant is null
    and a is not null and b is not null order by tour, petite desc, position limit 1;
  return m;
end $$;
revoke all on function public.tournoi_prochain(bigint) from public, anon, authenticated;
grant execute on function public.tournoi_prochain(bigint) to service_role;

-- Se retirer (inscriptions ouvertes) ou abandonner (tournoi en cours). Appele par le bot (tournoi_quitter) et le site
-- (tournoi_quitter_site) ; jamais directement par un client.
create or replace function public.tournoi_quitter_j(p_joueur uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; n int;
begin
  if p_joueur is null then raise exception 'Joueur inconnu'; end if;
  -- le verrou du tournoi passe avant celui des matchs (meme ordre que tournoi_conclure et tournoi_preparer)
  select * into t from public.tournois where statut in ('inscriptions', 'en_cours') for update;
  if t.id is null then raise exception 'Aucun tournoi ouvert'; end if;
  if not exists (select 1 from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = p_joueur) then
    raise exception 'Tu n''es pas inscrit au tournoi « % »', t.nom; end if;
  if t.statut = 'inscriptions' then
    delete from public.tournoi_inscrits where tournoi_id = t.id and joueur_id = p_joueur;
    return jsonb_build_object('tournoi', t.nom, 'pseudo', (select pseudo from public.joueurs where id = p_joueur),
      'abandon', false, 'inscrits', (select count(*) from public.tournoi_inscrits where tournoi_id = t.id));
  end if;
  if public.tournoi_abandonne(t.id, p_joueur) then raise exception 'Tu as déjà abandonné le tournoi « % »', t.nom; end if;
  if not public.tournoi_en_lice(t.id, p_joueur) then
    raise exception 'Tu es déjà éliminé du tournoi « % » : il n''y a plus rien à abandonner', t.nom; end if;
  insert into public.tournoi_abandons (tournoi_id, joueur_id) values (t.id, p_joueur);
  n := public.tournoi_appliquer_abandons(t.id);
  select * into t from public.tournois where id = t.id;
  return jsonb_build_object('tournoi', t.nom, 'pseudo', (select pseudo from public.joueurs where id = p_joueur),
    'abandon', true, 'forfaits', n,
    'gagnants', (select coalesce(jsonb_agg(j.pseudo order by m.tour, m.position), '[]') from public.tournoi_matchs m
                  join public.joueurs j on j.id = m.gagnant where m.tournoi_id = t.id and m.forfait = p_joueur),
    'inscrits', (select count(*) from public.tournoi_inscrits where tournoi_id = t.id),
    'tournoi_fini', t.statut = 'termine', 'champion', (select pseudo from public.joueurs where id = t.gagnant));
end $$;
revoke all on function public.tournoi_quitter_j(uuid) from public, anon, authenticated;

-- Fait avancer le vainqueur d'un match. Forfait : dans le winner bracket, le perdant ne descend pas dans le loser
-- bracket ; en grande finale, pas de revanche. En elimination directe, le perdant d'une demi-finale va quand meme en
-- petite finale, ou il perd aussitot par forfait (la 3e place revient a son adversaire).
create or replace function public.tournoi_avancer(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; t public.tournois; perdant uuid; autre public.tournoi_matchs;
begin
  select * into m from public.tournoi_matchs where id = p_match;
  if m.gagnant is null then return; end if;
  select * into t from public.tournois where id = m.tournoi_id;
  perdant := case when m.exempt or (m.forfait is not null and m.phase <> 'tableau') then null
                  when m.gagnant = m.a then m.b else m.a end;
  if m.phase = 'suisse' then
    if not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'suisse' and tour = m.tour and gagnant is null) then
      if m.tour < t.rondes then perform public.tournoi_suisse_ronde(t.id, m.tour + 1);
      else perform public.tournoi_double_creer(t.id); end if;
    end if;
    return;
  end if;
  if m.phase = 'grande' then
    if m.gagnant = m.a or m.forfait is not null or not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'loser') then
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
  if m.phase = 'winner' then
    if m.perdant_id is not null and perdant is not null then
        update public.tournoi_matchs set a = case when m.perdant_cote = 0 then perdant else a end,
                                         b = case when m.perdant_cote = 1 then perdant else b end where id = m.perdant_id;
    end if;
    perform public.tournoi_resoudre(m.tournoi_id);
    return;
  end if;
  if m.phase = 'loser' then perform public.tournoi_resoudre(m.tournoi_id); return; end if;
  if m.perdant_id is not null and perdant is not null then
    select * into autre from public.tournoi_matchs where perdant_id = m.perdant_id and id <> m.id;
    if autre.exempt then
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
revoke all on function public.tournoi_avancer(bigint) from public, anon, authenticated;

-- Ronde suisse : seuls les joueurs qui n'ont pas abandonne sont apparies ou exemptes.
create or replace function public.tournoi_suisse_ronde(p_id bigint, p_ronde integer)
returns void language plpgsql security definer set search_path = public as $$
declare ord uuid[]; libre uuid[]; pa uuid[] := '{}'; pb uuid[] := '{}'; x uuid; y uuid; ex uuid; k int; fs int; i int; j int;
        choisi int; nr int;
begin
  perform public.tournoi_tm_remplir(p_id);
  fs := greatest(1, public.reglage_num('tournoi_format_suisse', 1)::int);
  if p_ronde = 1 then
    ord := array(select joueur_id from public.tournoi_inscrits where tournoi_id = p_id
                  and not public.tournoi_abandonne(p_id, joueur_id) order by random());
  else
    ord := array(select joueur from public.tournoi_suisse_classement(p_id) c
                  where not public.tournoi_abandonne(p_id, c.joueur) order by rang);
  end if;
  -- nombre impair : le moins bien classe qui n'a pas encore ete exempt l'est (une victoire)
  if cardinality(ord) % 2 = 1 then
    for k in reverse cardinality(ord) .. 1 loop
      if not exists (select 1 from _tm where phase = 'suisse' and exempt and a = ord[k]) then ex := ord[k]; exit; end if;
    end loop;
    if ex is null then ex := ord[cardinality(ord)]; end if;
    ord := array_remove(ord, ex);
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, exempt, gagnant, fini_le)
    values (p_id, p_ronde, 1000, fs, 'suisse', 'Ronde ' || p_ronde, ex, true, ex, now());
  end if;
  -- du premier au dernier du classement : chacun prend le premier adversaire libre qu'il n'a pas encore rencontre
  libre := ord;
  while cardinality(libre) >= 2 loop
    x := libre[1];
    choisi := null;
    for j in 2 .. cardinality(libre) loop
      if not public.tournoi_deja_joue(x, libre[j]) then choisi := j; exit; end if;
    end loop;
    y := libre[coalesce(choisi, 2)];   -- tous deja rencontres : une revanche, que l'echange ci-dessous tente d'eviter
    pa := pa || x; pb := pb || y;
    libre := array_remove(array_remove(libre, x), y);
  end loop;
  -- une revanche restante : echange d'adversaires avec un autre match, si les deux nouveaux matchs sont inedits
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
  -- plus aucun match a jouer dans cette ronde (abandons) : la suite s'enchaine tout de suite
  if not exists (select 1 from public.tournoi_matchs where tournoi_id = p_id and phase = 'suisse' and tour = p_ronde and gagnant is null) then
    select rondes into nr from public.tournois where id = p_id;
    if p_ronde < nr then perform public.tournoi_suisse_ronde(p_id, p_ronde + 1);
    else perform public.tournoi_double_creer(p_id); end if;
  end if;
end $$;
revoke all on function public.tournoi_suisse_ronde(bigint, integer) from public, anon, authenticated;

-- Tableau final apres les rondes suisses : seuls les joueurs qui n'ont pas abandonne se qualifient.
create or replace function public.tournoi_double_creer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; s uuid[]; n int; w int; l int; tb int := 1; rw int := 0; moitie int; ps int; p int := 0;
        fd int; fl int; fg int; cur int; tw int[] := '{}'; td int[] := '{}'; tre int[] := '{}'; tp int[] := '{}';
        ow int[]; op int[]; places int[]; r int; q int; i int; k int; nb int := 0; nom text;
begin
  select * into t from public.tournois where id = p_id;
  perform public.tournoi_tm_remplir(p_id);
  s := array(select joueur from public.tournoi_suisse_classement(p_id) c where not public.tournoi_abandonne(p_id, c.joueur) order by rang);
  n := cardinality(s);
  if t.coupe_loser is null then perform public.tournoi_coupes(p_id, n); select * into t from public.tournois where id = p_id; end if;
  w := least(t.coupe, n); l := least(t.coupe_loser, n - w);
  fd := greatest(1, public.reglage_num('tournoi_format_double', 3)::int);
  fl := greatest(1, public.reglage_num('tournoi_format_finale_loser', 5)::int);
  fg := greatest(1, public.reglage_num('tournoi_format_grande', 5)::int);
  -- moins de deux joueurs encore la (abandons) : pas de tableau, le tournoi se termine
  if n < 2 then
    if n = 1 then
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, exempt, gagnant, fini_le)
      values (p_id, t.rondes + 1, 1, fg, 'grande', 'Finale', s[1], true, s[1], now());
    end if;
    perform public.tournoi_terminer(p_id);
    return;
  end if;
  if w <= 2 and l = 0 then
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, t.rondes + 1, 1, fg, 'grande', 'Finale', s[1], s[2]);
    return;
  end if;
  while tb < w loop tb := tb * 2; rw := rw + 1; end loop;
  moitie := tb / 2;
  ps := moitie; while ps < l loop ps := ps * 2; p := p + 1; end loop;
  ow := public.tournoi_ordre(tb); op := public.tournoi_ordre(ps);
  cur := t.rondes + 1; tw := tw || cur; tp := tp || cur;
  for q in 2 .. p loop cur := cur + 1; tp := tp || cur; end loop;
  for r in 1 .. rw loop
    cur := cur + 1; td := td || cur;
    if r < rw then cur := cur + 1; tw := tw || cur; cur := cur + 1; tre := tre || cur; end if;
  end loop;
  for r in 1 .. rw loop
    k := tb >> r;
    nom := case k when 1 then 'Finale du winner' when 2 then 'Demi-finale du winner' when 4 then 'Quart de finale du winner'
             else 'Winner bracket, ' || r || case when r = 1 then 'er' else 'e' end || ' tour' end;
    for i in 1 .. k loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
      values (p_id, tw[r], i, fd, 'winner', nom,
              case when r = 1 and ow[2 * i - 1] <= w then s[ow[2 * i - 1]] end, case when r = 1 and ow[2 * i] <= w then s[ow[2 * i]] end);
    end loop;
  end loop;
  for q in 1 .. p loop
    nb := nb + 1; k := ps >> q;
    for i in 1 .. k loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
      values (p_id, tp[q], case when q = 1 then moitie + i else i end, fd, 'loser', 'Loser bracket, ' || nb || case when nb = 1 then 'er' else 'e' end || ' tour',
              case when q = 1 and op[2 * i - 1] <= l then s[w + op[2 * i - 1]] end, case when q = 1 and op[2 * i] <= l then s[w + op[2 * i]] end);
    end loop;
  end loop;
  for r in 1 .. rw loop
    nb := nb + 1; k := tb >> r;
    for i in 1 .. k loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom)
      values (p_id, td[r], i, case when r = rw then fl else fd end, 'loser',
              case when r = rw then 'Finale du loser' else 'Loser bracket, ' || nb || case when nb = 1 then 'er' else 'e' end || ' tour' end);
    end loop;
    if r < rw then
      nb := nb + 1;
      for i in 1 .. k / 2 loop
        insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom)
        values (p_id, tre[r], i, fd, 'loser', case when r + 1 = rw then 'Demi-finale du loser' else 'Loser bracket, ' || nb || 'e tour' end);
      end loop;
    end if;
  end loop;
  if p = 0 and l > 0 then
    places := array(select x from generate_series(1, moitie) x
                     order by (ow[2 * (moitie - x + 1)] <= w) , x);
    for i in 1 .. l loop
      update public.tournoi_matchs set a = s[w + i] where tournoi_id = p_id and tour = td[1] and position = places[i];
    end loop;
  end if;
  insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom) values
    (p_id, cur + 1, 1, fg, 'grande', 'Grande finale'),
    (p_id, cur + 2, 1, fg, 'revanche', 'Revanche de la grande finale');
  for r in 1 .. rw loop
    k := tb >> r;
    update public.tournoi_matchs m set
      suivant_id = case when r < rw then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tw[r + 1] and position = (m.position + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande') end,
      suivant_cote = case when r < rw then (m.position - 1) % 2 else 0 end,
      perdant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[r] and position = k - m.position + 1),
      perdant_cote = 1
     where m.tournoi_id = p_id and m.phase = 'winner' and m.tour = tw[r];
    update public.tournoi_matchs m set
      suivant_id = case when r < rw then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tre[r] and position = (m.position + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande') end,
      suivant_cote = case when r < rw then (m.position - 1) % 2 else 1 end
     where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = td[r];
    if r < rw then
      update public.tournoi_matchs m set
        suivant_id = (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[r + 1] and position = m.position), suivant_cote = 0
       where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = tre[r];
    end if;
  end loop;
  for q in 1 .. p loop
    update public.tournoi_matchs m set
      suivant_id = case when q < p then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tp[q + 1] and position = (m.position - case when q = 1 then moitie else 0 end + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[1] and position = m.position - case when q = 1 then moitie else 0 end) end,
      suivant_cote = case when q < p then (m.position - case when q = 1 then moitie else 0 end - 1) % 2 else 0 end
     where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = tp[q] and (q > 1 or m.position > moitie);
  end loop;
  perform public.tournoi_resoudre(p_id);
end $$;
revoke all on function public.tournoi_double_creer(bigint) from public, anon, authenticated;

-- Compte un combat du tournoi. Verrous : le tournoi, puis le match (comme l'abandon) ; un match deja gagne par forfait
-- refuse le combat (rien n'est compte, aucun resultat contradictoire).
create or replace function public.tournoi_conclure(p_match bigint, p_gagnant uuid, p_seed text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; t public.tournois; besoin int; nt int; prochain public.tournoi_matchs; fini boolean := false;
        perdant uuid; vers text; vers_phase text; vers_perdant text; place int; bilans jsonb; qualifies jsonb;
        ronde_finie boolean := false; tid bigint;
begin
  select tournoi_id into tid from public.tournoi_matchs where id = p_match;
  if tid is null then raise exception 'Match introuvable'; end if;
  perform 1 from public.tournois where id = tid for update;
  select * into m from public.tournoi_matchs where id = p_match for update;
  if m.gagnant is not null then
    if m.forfait is not null then
      raise exception 'Match gagné par forfait (% a abandonné) : ce combat ne compte pas, lance le match suivant',
        coalesce((select pseudo from public.joueurs where id = m.forfait), '?');
    end if;
    raise exception 'Ce match est déjà terminé';
  end if;
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
    -- loser bracket : le perdant est elimine ; 3e s'il perd la finale du loser, 4e s'il perd le match d'avant
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
        -- les qualifies : les mieux classes qui n'ont pas abandonne (winner et loser bracket)
        select jsonb_agg(q.pseudo order by q.rang) into qualifies from (
          select j.pseudo, c.rang from public.tournoi_suisse_classement(m.tournoi_id) c join public.joueurs j on j.id = c.joueur
           where not public.tournoi_abandonne(m.tournoi_id, c.joueur) order by c.rang limit t.coupe + public.tournoi_coupe_loser(t)) q;
      end if;
    end if;
  end if;
  select * into t from public.tournois where id = m.tournoi_id;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = t.id;
  prochain := public.tournoi_prochain(t.id);
  select * into t from public.tournois where id = m.tournoi_id;   -- un forfait a pu terminer le tournoi
  return jsonb_build_object('nom', t.nom, 'format', t.format, 'phase', m.phase, 'match_fini', fini, 'score_a', m.score_a, 'score_b', m.score_b,
    'nuls', m.nuls, 'besoin', besoin, 'nom_tour', coalesce(m.nom, public.tournoi_match_nom(m.tour, nt, m.petite)), 'petite', m.petite,
    'finale', case when m.phase = 'tableau' then m.suivant_id is null and not m.petite else m.phase in ('grande', 'revanche') end,
    -- demi-finale : le perdant joue la petite finale, ou il est 3e sans la jouer (l'autre demi-finale etait un qualifie d'office)
    'vers_petite', fini and m.phase = 'tableau' and m.perdant_id is not null and not coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    'troisieme', fini and m.phase = 'tableau' and m.perdant_id is not null and coalesce((select exempt from public.tournoi_matchs where id = m.perdant_id), false),
    -- format suisse
    'vers', vers, 'vers_perdant', vers_perdant,
    'elimine', fini and m.phase = 'loser',
    'place_perdant', place,
    'revanche', fini and m.phase = 'grande' and m.gagnant = m.b and exists (select 1 from public.tournoi_matchs where tournoi_id = t.id and phase = 'revanche' and a is not null),
    'bilans', bilans, 'ronde_finie', ronde_finie, 'qualifies', qualifies,
    'gagnant', (select pseudo from public.joueurs where id = m.gagnant),
    'perdant', case when fini then (select pseudo from public.joueurs where id = perdant) end,
    'tournoi_fini', t.statut = 'termine', 'champion', (select pseudo from public.joueurs where id = t.gagnant),
    'suite', t.statut = 'en_cours' and t.auto and prochain.id is not null,
    'prochain', case when prochain.id is null then null else jsonb_build_object('nom_tour', coalesce(prochain.nom, public.tournoi_match_nom(prochain.tour, nt, prochain.petite)),
       'a', (select pseudo from public.joueurs where id = prochain.a), 'b', (select pseudo from public.joueurs where id = prochain.b)) end,
    'tableau', case when t.statut = 'termine' or ronde_finie then public.tournoi_json(t.id, false) end);
end $$;
revoke all on function public.tournoi_conclure(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.tournoi_conclure(bigint, uuid, text) to service_role;

-- Fin du tournoi : un joueur qui a abandonne ne recoit ni trophee de place ni recompense (les suivants montent) ;
-- l'echarpe de participation va a tous les inscrits.
create or replace function public.tournoi_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; f public.tournoi_matchs; pf public.tournoi_matchs; nt int; pl uuid[]; img text[];
        g public.tournoi_matchs; lf public.tournoi_matchs; l4 public.tournoi_matchs; s uuid[];
begin
  select * into t from public.tournois where id = p_id for update;
  if t.statut <> 'en_cours' then return; end if;
  if t.format = 'suisse' then
    -- la revanche si elle a ete jouee, sinon la grande finale
    select * into g from public.tournoi_matchs where tournoi_id = p_id and phase = 'revanche' and gagnant is not null;
    if g.id is null then select * into g from public.tournoi_matchs where tournoi_id = p_id and phase = 'grande'; end if;
    select * into lf from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser' order by tour desc limit 1;
    select * into l4 from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser' and suivant_id = lf.id;
    pl := array[g.gagnant, case when g.gagnant = g.a then g.b else g.a end,
                case when lf.gagnant = lf.a then lf.b else lf.a end, case when l4.gagnant = l4.a then l4.b else l4.a end];
    if not exists (select 1 from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser') then
      perform public.tournoi_tm_remplir(p_id);
      s := array(select joueur from public.tournoi_suisse_classement(p_id) c
                  where joueur <> all(array_remove(pl, null)) and not public.tournoi_abandonne(p_id, c.joueur) order by rang);
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
  -- abandon : aucune place pour lui, les joueurs classes apres lui montent d'une place
  pl := array(select u.x from unnest(pl) with ordinality u(x, o)
               where u.x is not null and not public.tournoi_abandonne(p_id, u.x) order by u.o);
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
revoke all on function public.tournoi_terminer(bigint) from public, anon, authenticated;

-- Garde-fou : jamais de recompense de place pour un joueur qui a abandonne
create or replace function public.tournoi_recompenser(p_tournoi bigint, p_joueur uuid, p_place integer)
returns void language plpgsql security definer set search_path = public as $$
declare r public.tournoi_recompenses;
begin
  if p_joueur is null then return; end if;
  if public.tournoi_abandonne(p_tournoi, p_joueur) then return; end if;
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
revoke all on function public.tournoi_recompenser(bigint, uuid, integer) from public, anon, authenticated;

-- Le tableau : abandons (`abandons`, `abandon` sur chaque inscrit et chaque ligne du classement), forfaits (`forfait`
-- sur chaque match) et joueurs encore en lice (`en_lice`, calcule sur le tableau tel que le voit le public).
create or replace function public.tournoi_json(p_id bigint, p_masquer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; m public.tournoi_matchs; k record; nt int; caches bigint[] := '{}'; ronde_cachee int;
begin
  select * into t from public.tournois where id = p_id;
  if t.id is null then return null; end if;
  -- copie de travail du tableau (table temporaire, effacee a la fin de la transaction)
  perform public.tournoi_tm_remplir(p_id);
  if p_masquer then
    -- du plus recent au plus ancien : chaque combat cache est retire du tableau
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
    'format', t.format, 'rondes', t.rondes, 'coupe', t.coupe, 'coupe_loser', public.tournoi_coupe_loser(t), 'places_winner', t.places_winner, 'places_loser', t.places_loser,
    'places', (select coalesce(jsonb_agg(jsonb_build_object('place', tr.place, 'pseudo', j.pseudo) order by tr.place), '[]')
               from public.trophees tr left join public.joueurs j on j.id = tr.joueur_id where tr.tournoi_id = t.id and tr.place between 1 and 3),
    'max_joueurs', coalesce(t.max_joueurs, public.reglage_num('tournoi_max_joueurs', 32)::int),
    'recompenses', public.tournoi_recompenses_json(t.id), 'trophee', t.trophee, 'auto', t.auto,
    'cree_le', t.cree_le, 'lance_le', t.lance_le, 'fini_le', t.fini_le,
    'gagnant', t.gagnant, 'pseudo_gagnant', (select pseudo from public.joueurs where id = t.gagnant),
    'tours', nt,
    'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('id', i.joueur_id, 'pseudo', j.pseudo, 'abandon', ab.joueur_id is not null) order by i.inscrit_le), '[]')
                 from public.tournoi_inscrits i left join public.joueurs j on j.id = i.joueur_id
                 left join public.tournoi_abandons ab on ab.tournoi_id = i.tournoi_id and ab.joueur_id = i.joueur_id where i.tournoi_id = t.id),
    'abandons', (select coalesce(jsonb_agg(jsonb_build_object('id', ab.joueur_id, 'pseudo', j.pseudo, 'le', ab.abandonne_le) order by ab.abandonne_le), '[]')
                 from public.tournoi_abandons ab left join public.joueurs j on j.id = ab.joueur_id where ab.tournoi_id = t.id),
    'en_lice', case when t.statut = 'en_cours' then (
        select coalesce(jsonb_agg(i.joueur_id), '[]') from public.tournoi_inscrits i
         where i.tournoi_id = t.id and not public.tournoi_abandonne(t.id, i.joueur_id)
           and (exists (select 1 from _tm x where x.gagnant is null and i.joueur_id in (x.a, x.b))
                or exists (select 1 from _tm x where x.phase = 'suisse' and x.gagnant is null))) else '[]'::jsonb end,
    'classement', case when t.format = 'suisse' and t.statut <> 'inscriptions' then (
        select coalesce(jsonb_agg(jsonb_build_object('id', c.joueur, 'pseudo', j.pseudo, 'victoires', c.victoires,
                 'defaites', c.defaites, 'buchholz', c.buchholz, 'rang', c.rang, 'abandon', public.tournoi_abandonne(t.id, c.joueur)) order by c.rang), '[]')
        from public.tournoi_suisse_classement(t.id) c left join public.joueurs j on j.id = c.joueur) end,
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'tour', x.tour, 'position', x.position, 'nom_tour', coalesce(x.nom, public.tournoi_match_nom(x.tour, nt, x.petite)),
        'petite', x.petite, 'format', x.format, 'phase', x.phase,
        'a', x.a, 'b', x.b, 'pseudo_a', ja.pseudo, 'pseudo_b', jb.pseudo, 'score_a', x.score_a, 'score_b', x.score_b,
        'nuls', x.nuls, 'exempt', x.exempt, 'forfait', x.forfait, 'gagnant', x.gagnant, 'a_l_ecran', x.id = any(caches)) order by x.tour, x.position), '[]')
      from _tm x left join public.joueurs ja on ja.id = x.a left join public.joueurs jb on jb.id = x.b));
end $$;
revoke all on function public.tournoi_json(bigint, boolean) from public, anon, authenticated;

-- Admin > Tournois : nombre d'abandons par tournoi
create or replace function public.tournois_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom, 'division', t.division, 'statut', t.statut,
            'format', t.format, 'cree_le', t.cree_le, 'fini_le', t.fini_le, 'pseudo_gagnant', j.pseudo,
            'joueurs', (select count(*) from public.tournoi_inscrits n where n.tournoi_id = t.id),
            'abandons', (select count(*) from public.tournoi_abandons a where a.tournoi_id = t.id)) order by t.cree_le desc), '[]')
          from public.tournois t left join public.joueurs j on j.id = t.gagnant);
end $$;
revoke all on function public.tournois_admin() from public, anon;
grant execute on function public.tournois_admin() to authenticated;
