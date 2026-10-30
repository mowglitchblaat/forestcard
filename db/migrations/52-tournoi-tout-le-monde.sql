-- 52-tournoi-tout-le-monde.sql : format suisse, tout le monde continue après les rondes suisses
--
--   Avant (51-tournoi-loser-tetes.sql) : les 4 ou 8 premiers dans le winner bracket, autant dans le loser bracket, les
--   autres éliminés.
--   Maintenant : les W premiers du classement suisse commencent dans le winner bracket (2 vies), les L suivants dans le
--   loser bracket (1 vie). Par défaut, tout le monde continue : W = 60 % des inscrits (arrondi, au moins 2), L = tous les
--   autres (10 inscrits : 6 et 4). Admin > Tournois règle W et L pour un tournoi (tournoi_places), tant que les
--   inscriptions sont ouvertes ; un L plus petit que les autres élimine les derniers du classement.
--   Le tableau prend n'importe quel nombre : le winner bracket a la taille de la puissance de 2 au-dessus de W (les
--   meilleurs sont exemptés du 1er tour) ; les têtes du loser bracket attendent les perdants du 1er tour du winner, ou se
--   départagent d'abord entre elles s'il y en a plus que de places (exemptions aux meilleures). Un match dont un côté ne
--   recevra plus personne se joue tout seul : le joueur présent passe (tournoi_resoudre).
--   Deux joueurs en tout : une seule finale, comme avant.
--
-- À coller une fois dans l'éditeur SQL de Supabase, après 51-tournoi-loser-tetes.sql ; peut être relancé sans risque.

alter table public.tournois add column if not exists places_winner int;   -- choix de l'admin (vide : 60 % des inscrits)
alter table public.tournois add column if not exists places_loser int;    -- choix de l'admin (vide : tous les autres)
alter table public.tournois add column if not exists coupe_loser int;     -- au lancement : têtes du loser bracket
comment on column public.tournois.coupe is 'format suisse : joueurs qui commencent dans le winner bracket (calculé au lancement)';

-- Têtes du loser bracket d'un tournoi ; avant 52 (colonne vide) : autant que de qualifiés, sauf avec une coupe à 2
create or replace function public.tournoi_coupe_loser(t public.tournois)
returns int language sql immutable as $$
  select coalesce(t.coupe_loser, case when t.coupe is null or t.coupe <= 2 then 0 else t.coupe end);
$$;

-- Au lancement : combien commencent dans le winner bracket (W) et dans le loser bracket (L), sur n inscrits
create or replace function public.tournoi_coupes(p_id bigint, n int)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; w int; l int;
begin
  select * into t from public.tournois where id = p_id;
  w := least(n, greatest(2, coalesce(t.places_winner, round(n * 0.6)::int)));
  if t.places_winner is null and w >= n and n > 2 then w := n - 1; end if;
  l := greatest(0, least(n - w, coalesce(t.places_loser, n - w)));
  update public.tournois set coupe = w, coupe_loser = l where id = p_id;
end $$;
revoke all on function public.tournoi_coupes(bigint, int) from public, anon, authenticated;

-- Admin > Tournois : places du winner et du loser bracket (vide : par défaut), tant que les inscriptions sont ouvertes
create or replace function public.tournoi_places(p_id bigint, p_winner int, p_loser int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if p_winner is not null and p_winner < 2 then raise exception 'Il faut au moins 2 joueurs dans le winner bracket'; end if;
  if p_loser is not null and p_loser < 0 then raise exception 'Le loser bracket ne peut pas avoir moins de 0 joueur'; end if;
  update public.tournois set places_winner = p_winner, places_loser = p_loser where id = p_id and statut = 'inscriptions';
  if not found then raise exception 'Les places ne changent plus une fois le tournoi lancé'; end if;
end $$;
revoke all on function public.tournoi_places(bigint, int, int) from public, anon;
grant execute on function public.tournoi_places(bigint, int, int) to authenticated;

-- Tirage et début du tournoi (50-tournoi-suisse.sql), avec les places des deux brackets calculées au lancement
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
      rondes = case when n <= 2 then 1 when n = 3 then 2 when n <= 8 then 3 when n <= 16 then 4 when n <= 32 then 5 else 6 end
     where id = p_id;
    perform public.tournoi_coupes(p_id, n);   -- combien commencent dans le winner bracket, combien dans le loser bracket
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

-- Un match du tableau final dont un côté ne recevra plus personne (aucun match encore à jouer ne l'alimente) se joue
-- tout seul : le joueur présent passe sans jouer, et un match sans personne reste vide (exempt, sans vainqueur)
create or replace function public.tournoi_resoudre(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.tournoi_matchs; mort_a boolean; mort_b boolean; fait boolean;
begin
  loop
    fait := false;
    for m in select * from public.tournoi_matchs where tournoi_id = p_id and phase in ('winner', 'loser', 'grande')
               and gagnant is null and fini_le is null order by tour, position loop
      mort_a := m.a is null and not exists (select 1 from public.tournoi_matchs f where f.tournoi_id = p_id and f.fini_le is null
                  and ((f.suivant_id = m.id and f.suivant_cote = 0) or (f.perdant_id = m.id and f.perdant_cote = 0)));
      mort_b := m.b is null and not exists (select 1 from public.tournoi_matchs f where f.tournoi_id = p_id and f.fini_le is null
                  and ((f.suivant_id = m.id and f.suivant_cote = 1) or (f.perdant_id = m.id and f.perdant_cote = 1)));
      if (mort_a or mort_b) and (mort_a or m.a is not null) and (mort_b or m.b is not null) then
        update public.tournoi_matchs set a = coalesce(m.a, m.b), b = null, exempt = true, gagnant = coalesce(m.a, m.b), fini_le = now()
         where id = m.id;
        if coalesce(m.a, m.b) is not null then perform public.tournoi_avancer(m.id); end if;
        fait := true;
        exit;
      end if;
    end loop;
    exit when not fait;
  end loop;
end $$;
revoke all on function public.tournoi_resoudre(bigint) from public, anon, authenticated;

-- Après la dernière ronde : le winner bracket des W premiers, le loser bracket des L suivants, la grande finale et sa revanche
create or replace function public.tournoi_double_creer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; s uuid[]; n int; w int; l int; tb int := 1; rw int := 0; moitie int; ps int; p int := 0;
        fd int; fl int; fg int; cur int; tw int[] := '{}'; td int[] := '{}'; tre int[] := '{}'; tp int[] := '{}';
        ow int[]; op int[]; places int[]; r int; q int; i int; k int; nb int := 0; nom text;
begin
  select * into t from public.tournois where id = p_id;
  perform public.tournoi_tm_remplir(p_id);
  s := array(select joueur from public.tournoi_suisse_classement(p_id) order by rang);
  n := cardinality(s);
  if t.coupe_loser is null then perform public.tournoi_coupes(p_id, n); select * into t from public.tournois where id = p_id; end if;
  w := least(t.coupe, n); l := least(t.coupe_loser, n - w);
  fd := greatest(1, public.reglage_num('tournoi_format_double', 3)::int);
  fl := greatest(1, public.reglage_num('tournoi_format_finale_loser', 5)::int);
  fg := greatest(1, public.reglage_num('tournoi_format_grande', 5)::int);
  if w <= 2 and l = 0 then   -- deux joueurs : une seule finale
    insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
    values (p_id, t.rondes + 1, 1, fg, 'grande', 'Finale', s[1], s[2]);
    return;
  end if;
  while tb < w loop tb := tb * 2; rw := rw + 1; end loop;   -- taille du winner bracket, ses tours
  moitie := tb / 2;
  ps := moitie; while ps < l loop ps := ps * 2; p := p + 1; end loop;   -- tours où les têtes du loser se départagent
  ow := public.tournoi_ordre(tb); op := public.tournoi_ordre(ps);
  -- les tours : 1er tour du winner (et du loser, s'il se départage), les autres tours de départage, puis pour chaque tour r
  -- du winner, le tour du loser qui reçoit ses perdants, le tour suivant du winner et le tour du loser qui réduit de moitié
  cur := t.rondes + 1; tw := tw || cur; tp := tp || cur;
  for q in 2 .. p loop cur := cur + 1; tp := tp || cur; end loop;
  for r in 1 .. rw loop
    cur := cur + 1; td := td || cur;
    if r < rw then cur := cur + 1; tw := tw || cur; cur := cur + 1; tre := tre || cur; end if;
  end loop;
  -- winner bracket
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
  -- loser bracket : les tours où ses têtes se départagent (s'il y en a plus que de perdants du 1er tour du winner)
  for q in 1 .. p loop
    nb := nb + 1; k := ps >> q;
    for i in 1 .. k loop
      insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom, a, b)
      values (p_id, tp[q], case when q = 1 then moitie + i else i end, fd, 'loser', 'Loser bracket, ' || nb || case when nb = 1 then 'er' else 'e' end || ' tour',
              case when q = 1 and op[2 * i - 1] <= l then s[w + op[2 * i - 1]] end, case when q = 1 and op[2 * i] <= l then s[w + op[2 * i]] end);
    end loop;
  end loop;
  -- puis les tours qui reçoivent les perdants du winner, et ceux qui réduisent
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
  -- pas de départage : les têtes du loser attendent directement les perdants du 1er tour du winner ; les meilleures
  -- d'abord en face d'un match du winner sans perdant (une tête de série exemptée), où elles passent sans jouer
  if p = 0 and l > 0 then
    places := array(select x from generate_series(1, moitie) x
                     order by (ow[2 * (moitie - x + 1)] <= w) , x);   -- d'abord les places sans perdant à recevoir
    for i in 1 .. l loop
      update public.tournoi_matchs set a = s[w + i] where tournoi_id = p_id and tour = td[1] and position = places[i];
    end loop;
  end if;
  insert into public.tournoi_matchs (tournoi_id, tour, position, format, phase, nom) values
    (p_id, cur + 1, 1, fg, 'grande', 'Grande finale'),
    (p_id, cur + 2, 1, fg, 'revanche', 'Revanche de la grande finale');
  -- liens : winner (vainqueur au tour suivant ou en grande finale côté a ; perdant au loser, croisé, côté b)
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
  -- départage du loser : le vainqueur au tour suivant, puis au tour qui reçoit les perdants du 1er tour du winner, côté a
  for q in 1 .. p loop
    update public.tournoi_matchs m set
      suivant_id = case when q < p then (select id from public.tournoi_matchs where tournoi_id = p_id and tour = tp[q + 1] and position = (m.position - case when q = 1 then moitie else 0 end + 1) / 2)
                        else (select id from public.tournoi_matchs where tournoi_id = p_id and tour = td[1] and position = m.position - case when q = 1 then moitie else 0 end) end,
      suivant_cote = case when q < p then (m.position - case when q = 1 then moitie else 0 end - 1) % 2 else 0 end
     where m.tournoi_id = p_id and m.phase = 'loser' and m.tour = tp[q] and (q > 1 or m.position > moitie);
  end loop;
  perform public.tournoi_resoudre(p_id);   -- les exemptions
end $$;
revoke all on function public.tournoi_double_creer(bigint) from public, anon, authenticated;

-- L'ordre classique d'un tableau de taille p (puissance de 2) : la tête de série 1 contre la dernière, etc.
create or replace function public.tournoi_ordre(p int)
returns int[] language plpgsql immutable as $$
declare ord int[] := array[1, 2]; nxt int[]; l int; x int;
begin
  if p <= 1 then return array[1]; end if;
  while cardinality(ord) < p loop
    nxt := '{}'; l := cardinality(ord);
    foreach x in array ord loop nxt := nxt || x || (2 * l + 1 - x); end loop;
    ord := nxt;
  end loop;
  return ord;
end $$;


-- Le vainqueur d'un match passe au suivant (51-tournoi-loser-tetes.sql), puis les matchs qui se jouent tout seuls
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
    if m.gagnant = m.a or not exists (select 1 from public.tournoi_matchs where tournoi_id = m.tournoi_id and phase = 'loser') then
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
  -- winner bracket : le perdant descend dans le loser bracket (2 vies) ; puis un match dont un côté ne recevra plus
  -- personne se joue tout seul (tournoi_resoudre)
  if m.phase = 'winner' then
    if m.perdant_id is not null and perdant is not null then
      update public.tournoi_matchs set a = case when m.perdant_cote = 0 then perdant else a end,
                                       b = case when m.perdant_cote = 1 then perdant else b end where id = m.perdant_id;
    end if;
    perform public.tournoi_resoudre(m.tournoi_id);
    return;
  end if;
  if m.phase = 'loser' then perform public.tournoi_resoudre(m.tournoi_id); return; end if;
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

-- Le combat a eu lieu (51-tournoi-loser-tetes.sql) : têtes du loser bracket et revanche selon les places du tournoi
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
          join public.joueurs j on j.id = c.joueur where c.rang <= t.coupe + public.tournoi_coupe_loser(t);   -- winner et loser bracket
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
    'revanche', fini and m.phase = 'grande' and m.gagnant = m.b and exists (select 1 from public.tournoi_matchs where tournoi_id = t.id and phase = 'loser'),
    'bilans', bilans, 'ronde_finie', ronde_finie, 'qualifies', qualifies,
    'gagnant', (select pseudo from public.joueurs where id = m.gagnant),
    'perdant', case when fini then (select pseudo from public.joueurs where id = perdant) end,
    'tournoi_fini', t.statut = 'termine', 'champion', (select pseudo from public.joueurs where id = t.gagnant),
    'suite', t.statut = 'en_cours' and t.auto and prochain.id is not null,
    'prochain', case when prochain.id is null then null else jsonb_build_object('nom_tour', coalesce(prochain.nom, public.tournoi_match_nom(prochain.tour, nt, prochain.petite)),
       'a', (select pseudo from public.joueurs where id = prochain.a), 'b', (select pseudo from public.joueurs where id = prochain.b)) end,
    'tableau', case when t.statut = 'termine' or ronde_finie then public.tournoi_json(t.id, false) end);
end $$;

-- Fin du tournoi (50-tournoi-suisse.sql) : sans loser bracket, les places 3 et 4 viennent du classement suisse
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
    if not exists (select 1 from public.tournoi_matchs where tournoi_id = p_id and phase = 'loser') then
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

-- Le tableau d'un tournoi (50-tournoi-suisse.sql), avec les têtes du loser bracket et le podium (armoire : détail d'un trophée)
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
    'format', t.format, 'rondes', t.rondes, 'coupe', t.coupe, 'coupe_loser', public.tournoi_coupe_loser(t), 'places_winner', t.places_winner, 'places_loser', t.places_loser,
    'places', (select coalesce(jsonb_agg(jsonb_build_object('place', tr.place, 'pseudo', j.pseudo) order by tr.place), '[]')
               from public.trophees tr left join public.joueurs j on j.id = tr.joueur_id where tr.tournoi_id = t.id and tr.place between 1 and 3),
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
