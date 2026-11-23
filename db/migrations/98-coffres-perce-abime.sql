-- 98-coffres-perce-abime.sql — Forest Card
-- Coffres-forts (97-coffres-forts.sql) : la Perce-Abîme, une foreuse légendaire (5000 gold par défaut, prix_giga)
-- qui compte pour 7 foreuses (puissance_giga) et laisse un énorme trou. Chaque trou a un poids (1, ou 7 pour une
-- Perce-Abîme) : un coffre s'ouvre quand la somme des poids atteint son nombre de foreuses (toujours secret).
-- À lancer une fois dans Supabase (SQL Editor), après 97-coffres-forts.sql ; peut être relancé.

alter table public.coffres_evenements add column if not exists prix_giga integer not null default 5000;
alter table public.coffres_evenements add column if not exists puissance_giga integer not null default 7;
alter table public.coffres_stock add column if not exists giga integer not null default 0 check (giga >= 0);
alter table public.coffres_trous add column if not exists poids integer not null default 1;

drop function if exists public.coffres_acheter(integer);
drop function if exists public.coffres_percer(bigint, integer);

-- Acheter des foreuses, ou des Perce-Abîme (p_giga).
create or replace function public.coffres_acheter(p_n integer, p_giga boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev public.coffres_evenements; j public.joueurs; total integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into ev from public._coffres_courant();
  if ev.id is null then raise exception 'AUCUN_EVENEMENT'; end if;
  if ev.fin <= now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if p_n is null or p_n < 1 or p_n > 100 then raise exception 'QUANTITE'; end if;
  total := p_n * case when p_giga then ev.prix_giga else ev.prix end;
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.monnaie, 0) < total then raise exception 'GOLD_INSUFFISANT'; end if;
  update public.joueurs set monnaie = monnaie - total where id = j.id;
  insert into public.coffres_stock (evenement_id, joueur_id, foreuses, achetees, giga)
  values (ev.id, j.id, case when p_giga then 0 else p_n end, case when p_giga then 0 else p_n end,
          case when p_giga then p_n else 0 end)
  on conflict (evenement_id, joueur_id) do update
    set foreuses = coffres_stock.foreuses + excluded.foreuses, achetees = coffres_stock.achetees + excluded.achetees,
        giga = coffres_stock.giga + excluded.giga;
  return jsonb_build_object('monnaie', j.monnaie - total);
end $$;
grant execute on function public.coffres_acheter(integer, boolean) to authenticated;

-- Poser des foreuses, ou des Perce-Abîme (p_giga : un trou de poids puissance_giga, plus près du centre).
-- Refus : NON_CONNECTE, COFFRE_INCONNU, EVENEMENT_TERMINE, COFFRE_OUVERT, PAS_DE_FOREUSE, PAS_DE_GIGA.
create or replace function public.coffres_percer(p_coffre bigint, p_n integer default 1, p_giga boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.coffres; ev public.coffres_evenements; stock integer; poses integer; n integer; i integer;
        w integer; r real; a real; trous jsonb := '[]'::jsonb; t record; ouvert boolean := false;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.coffres where id = p_coffre for update;
  if c.id is null then raise exception 'COFFRE_INCONNU'; end if;
  select * into ev from public.coffres_evenements where id = c.evenement_id;
  if ev.fin <= now() or ev.debut > now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if c.ouvert_le is not null then raise exception 'COFFRE_OUVERT'; end if;
  select case when p_giga then s.giga else s.foreuses end into stock
  from public.coffres_stock s where s.evenement_id = ev.id and s.joueur_id = auth.uid() for update;
  if coalesce(stock, 0) < 1 then
    raise exception '%', case when p_giga then 'PAS_DE_GIGA' else 'PAS_DE_FOREUSE' end;
  end if;
  w := case when p_giga then greatest(ev.puissance_giga, 1) else 1 end;
  select coalesce(sum(tr.poids), 0) into poses from public.coffres_trous tr where tr.coffre_id = c.id;
  n := least(greatest(coalesce(p_n, 1), 1), stock, ceil((c.requis - poses)::numeric / w)::integer);
  for i in 1..n loop
    r := case when p_giga then 0.24 + random() * 0.1 else 0.2 + random() * 0.2 end;
    a := random() * 2 * pi();
    insert into public.coffres_trous (coffre_id, joueur_id, x, y, angle, poids)
    values (c.id, auth.uid(), 0.5 + r * cos(a), 0.5 + r * sin(a), degrees(a), w)
    returning id, x, y, angle into t;
    trous := trous || jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle, 'moi', true, 'poids', w);
  end loop;
  update public.coffres_stock s
  set foreuses = s.foreuses - case when p_giga then 0 else n end, giga = s.giga - case when p_giga then n else 0 end
  where s.evenement_id = ev.id and s.joueur_id = auth.uid();
  if poses + n * w >= c.requis then
    update public.coffres set ouvert_le = now() where id = c.id;
    ouvert := true;
  end if;
  return jsonb_build_object('trous', trous, 'ouvert', ouvert);
end $$;
grant execute on function public.coffres_percer(bigint, integer, boolean) to authenticated;

-- L'état, avec les Perce-Abîme (prix, puissance, stock) et le poids de chaque trou.
create or replace function public.coffres_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ev public.coffres_evenements; moi uuid := auth.uid();
begin
  select * into ev from public._coffres_courant();
  if ev.id is null then return null; end if;
  return jsonb_build_object(
    'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
    'prix_giga', ev.prix_giga, 'puissance_giga', ev.puissance_giga,
    'termine', ev.fin <= now(),
    'monnaie', (select monnaie from public.joueurs where id = moi),
    'stock', coalesce((select foreuses from public.coffres_stock where evenement_id = ev.id and joueur_id = moi), 0),
    'stock_giga', coalesce((select giga from public.coffres_stock where evenement_id = ev.id and joueur_id = moi), 0),
    'coffres', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'rang', c.rang, 'nom', c.nom, 'teinte', c.teinte, 'ouvert_le', c.ouvert_le, -- requis : secret
        'trous', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle,
            'moi', t.joueur_id = moi, 'poids', t.poids) order by t.id) from public.coffres_trous t where t.coffre_id = c.id),
            '[]'::jsonb),
        'tresor', case when c.ouvert_le is null then null
                  else jsonb_build_object('nb', c.nb_cartes, 'rarete', c.rarete) end,
        'cartes', '[]'::jsonb
      ) order by c.rang) from public.coffres c where c.evenement_id = ev.id), '[]'::jsonb),
    'perceurs', coalesce((select jsonb_agg(x order by (x->>'foreuses')::int desc) from (
        select jsonb_build_object('pseudo', j.pseudo, 'foreuses', sum(t.poids)) as x
        from public.coffres_trous t join public.coffres c on c.id = t.coffre_id join public.joueurs j on j.id = t.joueur_id
        where c.evenement_id = ev.id group by j.pseudo order by sum(t.poids) desc limit 5) s), '[]'::jsonb),
    'mes_foreuses', (select coalesce(sum(t.poids), 0) from public.coffres_trous t join public.coffres c on c.id = t.coffre_id
                     where c.evenement_id = ev.id and t.joueur_id = moi)
  );
end $$;
grant execute on function public.coffres_etat() to anon, authenticated;

create or replace function public.admin_coffres_liste()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
      'coffres', (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'teinte', c.teinte, 'requis', c.requis,
          'ouvert_le', c.ouvert_le,
          'poses', (select coalesce(sum(t.poids), 0) from public.coffres_trous t where t.coffre_id = c.id),
          'nb_cartes', c.nb_cartes, 'rarete', c.rarete)
        order by c.rang) from public.coffres c where c.evenement_id = ev.id)
    ) order by ev.debut desc) from public.coffres_evenements ev), '[]'::jsonb);
end $$;
grant execute on function public.admin_coffres_liste() to authenticated;
