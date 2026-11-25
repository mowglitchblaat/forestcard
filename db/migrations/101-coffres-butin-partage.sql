-- 101-coffres-butin-partage.sql — Forest Card
-- La salle du trésor des coffres-forts (97, 98, 100). Chaque coffre de l'événement cache un trésor, montré aux
-- joueurs : des lots (gold, fragments de tout type, boosters, foreuses, Perce-Abîme, cartes de la rareté du coffre),
-- chacun avec son prix en points et son stock. À l'ouverture, ceux qui l'ont percé y entrent : chaque foreuse posée
-- dans ce coffre vaut 1 point (une Perce-Abîme, sa puissance). Ils ramassent les lots qu'ils veulent jusqu'à leurs
-- points ; le stock est commun, premier arrivé, premier servi. Une carte est tirée au hasard au moment où on la
-- prend. La salle ferme avec l'événement (3 jours après sa fin) : les points pas dépensés sont perdus.
-- Le trésor se règle dans l'admin tant que le coffre est fermé. Par défaut (_coffre_tresor_defaut, posé à la
-- création du coffre) il est à la mesure de sa défense, à ±15 % au hasard : il ne trahit pas la défense secrète.
-- Les nouvelles cartes annoncées à l'ouverture (nb_cartes, rarete) ne changent pas.
-- À lancer une fois dans Supabase (SQL Editor), après 100-inventaire.sql ; peut être relancé.

-- Les lots du trésor : n de l'objet pour prix points ; stock : lots restants (sur total).
create table if not exists public.coffres_tresor (
  id bigint generated always as identity primary key,
  coffre_id bigint not null references public.coffres(id) on delete cascade,
  objet text not null check (objet in ('gold', 'fragments', 'fragments_epique', 'fragments_legendaire',
    'fragments_ggez', 'booster', 'foreuse', 'perce_abime', 'carte')),
  n integer not null check (n > 0),
  prix integer not null check (prix > 0),
  stock integer not null check (stock >= 0),
  total integer not null check (total >= 0)
);
create index if not exists coffres_tresor_coffre_idx on public.coffres_tresor (coffre_id);

-- Ce que chaque perceur a pris : points dépensés et lots ramassés (cartes comprises).
create table if not exists public.coffres_parts (
  coffre_id bigint not null references public.coffres(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  depense integer not null default 0,
  prises jsonb not null default '[]'::jsonb,
  primary key (coffre_id, joueur_id)
);
alter table public.coffres_tresor enable row level security;
alter table public.coffres_parts enable row level security;
revoke all on public.coffres_tresor, public.coffres_parts from public, anon, authenticated;

-- Le trésor par défaut d'un coffre : sa couleur et ses foreuses requises (à ±15 % au hasard). Une colonne par
-- lot : n, prix, part du stock (stock = défense × part, arrondi au-dessus).
create or replace function public._coffre_tresor_defaut(p_coffre bigint)
returns void language plpgsql security definer set search_path = public as $$
declare c public.coffres; r numeric;
begin
  select * into c from public.coffres where id = p_coffre;
  if c.id is null or exists (select 1 from public.coffres_tresor where coffre_id = c.id) then return; end if;
  r := greatest(c.requis * (0.85 + random() * 0.3), 1);
  insert into public.coffres_tresor (coffre_id, objet, n, prix, stock, total)
  select c.id, objet, n, prix, ceil(r * part)::integer, ceil(r * part)::integer
  from (values
    ('bleu', 'gold', 2000, 1, 0.8), ('bleu', 'fragments', 50, 1, 0.5), ('bleu', 'fragments_epique', 8, 1, 0.3),
    ('bleu', 'fragments_legendaire', 3, 1, 0.1), ('bleu', 'fragments_ggez', 1, 3, 0.05), ('bleu', 'booster', 2, 1, 0.3),
    ('bleu', 'foreuse', 3, 2, 0.2), ('bleu', 'perce_abime', 1, 6, 0.05), ('bleu', 'carte', 1, 8, 0.4),
    ('violet', 'gold', 2000, 1, 0.8), ('violet', 'fragments', 60, 1, 0.4), ('violet', 'fragments_epique', 20, 1, 0.4),
    ('violet', 'fragments_legendaire', 6, 1, 0.3), ('violet', 'fragments_ggez', 2, 3, 0.08), ('violet', 'booster', 3, 1, 0.2),
    ('violet', 'foreuse', 4, 2, 0.2), ('violet', 'perce_abime', 1, 5, 0.08), ('violet', 'carte', 1, 20, 0.15),
    ('or', 'gold', 2500, 1, 0.8), ('or', 'fragments', 80, 1, 0.3), ('or', 'fragments_epique', 25, 1, 0.4),
    ('or', 'fragments_legendaire', 12, 1, 0.4), ('or', 'fragments_ggez', 4, 2, 0.15), ('or', 'booster', 4, 1, 0.2),
    ('or', 'foreuse', 5, 2, 0.15), ('or', 'perce_abime', 1, 5, 0.1), ('or', 'carte', 1, 45, 0.06)
  ) v(teinte, objet, n, prix, part)
  where v.teinte = c.teinte;
end $$;
revoke all on function public._coffre_tresor_defaut(bigint) from public, anon, authenticated;

-- Posé à la création d'un coffre, et sur les coffres encore fermés (l'événement en cours compris).
create or replace function public._coffre_tresor_pose()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._coffre_tresor_defaut(new.id);
  return new;
end $$;
drop trigger if exists coffres_tresor_pose on public.coffres;
create trigger coffres_tresor_pose after insert on public.coffres
  for each row execute function public._coffre_tresor_pose();
select public._coffre_tresor_defaut(id) from public.coffres where ouvert_le is null;

-- Ramasser un lot du trésor d'un coffre ouvert, avec ses points (ses foreuses posées dans ce coffre).
create or replace function public.coffres_ramasser(p_lot bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.coffres_tresor; c public.coffres; ev public.coffres_evenements; moi uuid := auth.uid();
        points integer; deja integer; var integer; prise jsonb; b record;
        rarete text;
begin
  if moi is null then raise exception 'NON_CONNECTE'; end if;
  select * into l from public.coffres_tresor where id = p_lot for update;
  if l.id is null then raise exception 'LOT_INCONNU'; end if;
  select * into c from public.coffres where id = l.coffre_id;
  select * into ev from public.coffres_evenements where id = c.evenement_id;
  if c.ouvert_le is null then raise exception 'COFFRE_FERME'; end if;
  if now() > ev.fin + interval '3 days' then raise exception 'SALLE_FERMEE'; end if;
  if l.stock < 1 then raise exception 'LOT_EPUISE'; end if;
  select coalesce(sum(poids), 0) into points from public.coffres_trous where coffre_id = c.id and joueur_id = moi;
  if points < 1 then raise exception 'PAS_PERCE'; end if;
  insert into public.coffres_parts (coffre_id, joueur_id) values (c.id, moi) on conflict do nothing;
  select p.depense into deja from public.coffres_parts p where p.coffre_id = c.id and p.joueur_id = moi for update;
  if points - deja < l.prix then raise exception 'POINTS_INSUFFISANTS'; end if;
  update public.coffres_tresor set stock = stock - 1 where id = l.id;
  prise := jsonb_build_object('objet', l.objet, 'n', l.n);
  case l.objet
    when 'gold' then update public.joueurs set monnaie = coalesce(monnaie, 0) + l.n where id = moi;
    when 'fragments' then update public.joueurs set fragments = coalesce(fragments, 0) + l.n where id = moi;
    when 'fragments_epique' then
      update public.joueurs set fragments_epique = coalesce(fragments_epique, 0) + l.n where id = moi;
    when 'fragments_legendaire' then
      update public.joueurs set fragments_legendaire = coalesce(fragments_legendaire, 0) + l.n where id = moi;
    when 'fragments_ggez' then update public.joueurs set fragments_ggez = coalesce(fragments_ggez, 0) + l.n where id = moi;
    when 'booster' then
      select t.id, t.nom, t.image_path into b from public.types_boosters t where t.actif order by random() limit 1;
      if b.id is not null then
        insert into public.stock_boosters (joueur_id, type_id, quantite) values (moi, b.id, l.n)
        on conflict (joueur_id, type_id) do update set quantite = public.stock_boosters.quantite + excluded.quantite;
        prise := prise || jsonb_build_object('nom', b.nom, 'image', b.image_path);
      end if;
    when 'foreuse', 'perce_abime' then perform public._inventaire_ajouter(moi, l.objet, l.n);
    when 'carte' then
      rarete := case c.teinte when 'bleu' then 'Rare' when 'violet' then 'Epique' else 'Légendaire' end;
      var := public._carte_au_hasard(rarete);
      if var is null then raise exception 'PAS_DE_CARTE'; end if;
      insert into public.collection_joueur (joueur_id, variante_id, quantite) values (moi, var, l.n)
      on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + excluded.quantite;
      prise := prise || (select jsonb_build_object('variante_id', v.id, 'nom', ca.nom, 'version', v.nom,
          'image', v.image_path, 'rarete', ra.nom, 'couleur', ra.couleur)
        from public.variantes_carte v join public.cartes ca on ca.id = v.carte_id
        left join public.raretes ra on ra.id = ca.rarete_id where v.id = var);
    else null;
  end case;
  update public.coffres_parts set depense = depense + l.prix, prises = prises || prise
  where coffre_id = c.id and joueur_id = moi;
  return jsonb_build_object('prise', prise, 'reste', points - deja - l.prix, 'stock', l.stock - 1);
end $$;
grant execute on function public.coffres_ramasser(bigint) to authenticated;

-- L'état du jeu : en plus, le trésor de chaque coffre et, pour le joueur, ses points, ses dépenses et ses prises.
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
    'salle_fin', ev.fin + interval '3 days',
    'monnaie', (select monnaie from public.joueurs where id = moi),
    'stock', public._inventaire_quantite(moi, 'foreuse'),
    'stock_giga', public._inventaire_quantite(moi, 'perce_abime'),
    'coffres', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'rang', c.rang, 'nom', c.nom, 'teinte', c.teinte, 'ouvert_le', c.ouvert_le, -- requis : secret
        'trous', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle,
            'moi', t.joueur_id = moi, 'poids', t.poids) order by t.id) from public.coffres_trous t where t.coffre_id = c.id),
            '[]'::jsonb),
        'tresor', case when c.ouvert_le is null then null
                  else jsonb_build_object('nb', c.nb_cartes, 'rarete', c.rarete) end,
        'cartes', '[]'::jsonb,
        'tresor_lots', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'objet', l.objet, 'n', l.n,
            'prix', l.prix, 'stock', l.stock, 'total', l.total) order by l.id), '[]'::jsonb)
          from public.coffres_tresor l where l.coffre_id = c.id),
        'mes_points', (select coalesce(sum(t.poids), 0) from public.coffres_trous t where t.coffre_id = c.id and t.joueur_id = moi),
        'mes_depenses', coalesce((select p.depense from public.coffres_parts p where p.coffre_id = c.id and p.joueur_id = moi), 0),
        'mes_prises', coalesce((select p.prises from public.coffres_parts p where p.coffre_id = c.id and p.joueur_id = moi), '[]'::jsonb)
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

-- Le trésor d'un coffre (admin), tant qu'il est fermé : la liste de ses lots {objet, n, prix, stock}.
create or replace function public.admin_coffres_tresor(p_coffre bigint, p_lots jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  if exists (select 1 from public.coffres where id = p_coffre and ouvert_le is not null) then
    raise exception 'COFFRE_OUVERT';
  end if;
  delete from public.coffres_tresor where coffre_id = p_coffre;
  insert into public.coffres_tresor (coffre_id, objet, n, prix, stock, total)
  select p_coffre, l->>'objet', greatest((l->>'n')::integer, 1), greatest((l->>'prix')::integer, 1),
         greatest((l->>'stock')::integer, 0), greatest((l->>'stock')::integer, 0)
  from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb)) l;
end $$;
grant execute on function public.admin_coffres_tresor(bigint, jsonb) to authenticated;

-- Tous les événements, avec le butin de chaque coffre (admin).
create or replace function public.admin_coffres_liste()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
      'coffres', (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'teinte', c.teinte, 'requis', c.requis,
          'ouvert_le', c.ouvert_le,
          'poses', (select coalesce(sum(t.poids), 0) from public.coffres_trous t where t.coffre_id = c.id),
          'nb_cartes', c.nb_cartes, 'rarete', c.rarete,
          'lots', (select coalesce(jsonb_agg(jsonb_build_object('objet', l.objet, 'n', l.n, 'prix', l.prix,
              'stock', l.stock, 'total', l.total) order by l.id), '[]'::jsonb)
            from public.coffres_tresor l where l.coffre_id = c.id))
        order by c.rang) from public.coffres c where c.evenement_id = ev.id)
    ) order by ev.debut desc) from public.coffres_evenements ev), '[]'::jsonb);
end $$;
grant execute on function public.admin_coffres_liste() to authenticated;
