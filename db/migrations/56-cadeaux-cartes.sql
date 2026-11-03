-- 56-cadeaux-cartes.sql (a executer une fois dans Supabase, apres 55)
-- Admin > Cadeaux : offrir une carte (une version precise) a un joueur ou a tous les joueurs, avec un petit mot
-- facultatif, vu a la prochaine connexion comme pour les boosters.

-- Le mot d'un cadeau peut maintenant porter une carte (en plus des boosters)
alter table public.cadeaux_messages add column if not exists variante_id int;

-- Admin : offre p_quantite exemplaires d'une version de carte (p_joueur nul : tous les joueurs).
-- Rend le nombre de joueurs qui l'ont recue.
create or replace function public.offrir_carte(p_joueur uuid, p_variante_id int, p_quantite int)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  if p_quantite is null or p_quantite < 1 or p_quantite > 100 then raise exception 'QUANTITE'; end if;
  if not exists (select 1 from public.variantes_carte where id = p_variante_id) then raise exception 'CARTE INCONNUE'; end if;
  insert into public.collection_joueur (joueur_id, variante_id, quantite)
  select j.id, p_variante_id, p_quantite from public.joueurs j where p_joueur is null or j.id = p_joueur
  on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + excluded.quantite;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.offrir_carte(uuid, int, int) from public, anon;
grant execute on function public.offrir_carte(uuid, int, int) to authenticated;

-- Admin : joint un mot au cadeau d'une carte (p_joueur nul : tous les joueurs)
create or replace function public.cadeau_message_carte(p_joueur uuid, p_message text, p_variante_id int, p_quantite int)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  if coalesce(btrim(p_message), '') = '' then return 0; end if;
  insert into public.cadeaux_messages (joueur_id, message, variante_id, quantite)
  select j.id, left(btrim(p_message), 500), p_variante_id, p_quantite from public.joueurs j where p_joueur is null or j.id = p_joueur;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cadeau_message_carte(uuid, text, int, int) from public, anon;
grant execute on function public.cadeau_message_carte(uuid, text, int, int) to authenticated;

-- Joueur : ses mots pas encore lus, avec le booster ou la carte offerts (nom, version, image)
create or replace function public.cadeaux_non_lus()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'message', m.message, 'quantite', m.quantite, 'booster', t.nom,
           'carte', c.nom, 'version', v.nom, 'carte_image', v.image_path, 'le', m.cree_le) order by m.cree_le), '[]')
  from public.cadeaux_messages m
  left join public.types_boosters t on t.id = m.type_id
  left join public.variantes_carte v on v.id = m.variante_id left join public.cartes c on c.id = v.carte_id
  where m.joueur_id = auth.uid() and m.lu_le is null;
$$;
revoke all on function public.cadeaux_non_lus() from public, anon;
grant execute on function public.cadeaux_non_lus() to authenticated;
