-- 65-images-inutilisees-generique.sql — Forest Card
-- Admin > Réglages, « Images inutilisées » : une image n'est plus déclarée inutilisée d'après une liste de tables
-- tenue à la main (une table oubliée = des images utilisées effacées), mais quand AUCUNE colonne de texte, de
-- JSON ou de tableau de la base ne la cite (cartes, boosters, dos, propositions, échanges, tournois, trophées,
-- annonces et puzzles, lore et calques, événements, dessins… et toute table future).
-- Couvre le stockage public « cartes » et celui des propositions de joueurs (« propositions ») : une proposition
-- supprimée y laissait ses images. Les stockages privés (puzzles, lore-secret) ne sont jamais touchés.
-- Sécurité inchangée : une image envoyée il y a moins d'une heure n'est jamais proposée.
-- À lancer une fois dans Supabase (SQL Editor), après 64-lore-carte-calques.sql ; peut être relancé.

drop function if exists public.admin_images_inutilisees();

create function public.admin_images_inutilisees()
returns table(chemin text, octets bigint, bucket text)
language plpgsql volatile security definer set search_path = public, storage as $$
declare r record; refs text := '';
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  -- toutes les valeurs de texte, de JSON et de tableau de la base, en une seule requête
  for r in select c.table_name, c.column_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
             and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY') loop
    refs := refs || case when refs = '' then '' else ' union all ' end
         || format('select %I::text as v from public.%I where %I is not null', r.column_name, r.table_name, r.column_name);
  end loop;
  return query execute format($q$
    with refs as (%s)
    select o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.bucket_id::text
    from storage.objects o
    where o.bucket_id in ('cartes', 'propositions')
      and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from refs where refs.v = o.name or position(o.name in refs.v) > 0)
    order by 2 desc
  $q$, case when refs = '' then 'select null::text as v' else refs end);
end $$;
revoke all on function public.admin_images_inutilisees() from public, anon;
grant execute on function public.admin_images_inutilisees() to authenticated;
