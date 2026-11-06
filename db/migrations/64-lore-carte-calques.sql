-- 64-lore-carte-calques.sql — Forest Card
-- Lore > Carte : la carte interactive.
--   - La carte de base (lore_carte, la carte vierge) est recouverte d'un brouillard, sauf autour des lieux
--     révélés.
--   - Un lieu a un ou plusieurs calques : des images transparentes de la taille de la carte, posées dessus
--     (l'arbre, le cerf…). Le brouillard se lève autour de leur silhouette, et cliquer dessus ouvre le menu
--     du lieu (sa collection, les boosters de sa collection, son chapitre du lore).
--   - Tant qu'un lieu n'est pas révélé, ni lui ni ses calques ne sont envoyés aux joueurs, et ses calques
--     sont rangés dans un stockage privé (bucket lore-secret, lu par l'admin seulement : le stockage public
--     se liste). En le révélant, l'admin les passe dans le stockage public (son navigateur les déplace).
--   - Un lieu peut renvoyer à un chapitre de l'histoire (chapitre_id).
-- Les lieux déjà existants restent visibles (révélés). Les images publiques du lore sont copiées sur GitHub
-- comme celles des cartes (chemins_images), pour ménager le quota de Supabase.
-- À lancer une fois dans Supabase (SQL Editor), après 63-puzzle-pieces-secretes.sql ; peut être relancé.

insert into storage.buckets (id, name, public) values ('lore-secret', 'lore-secret', false) on conflict (id) do nothing;
drop policy if exists "lore secret admin lecture" on storage.objects;
drop policy if exists "lore secret admin ajout" on storage.objects;
drop policy if exists "lore secret admin suppression" on storage.objects;
create policy "lore secret admin lecture" on storage.objects for select to authenticated using (bucket_id = 'lore-secret' and public.is_admin());
create policy "lore secret admin ajout" on storage.objects for insert to authenticated with check (bucket_id = 'lore-secret' and public.is_admin());
create policy "lore secret admin suppression" on storage.objects for delete to authenticated using (bucket_id = 'lore-secret' and public.is_admin());

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lore_lieux' and column_name = 'revele') then
    alter table public.lore_lieux add column revele boolean not null default true;   -- les lieux d'avant restent visibles
    alter table public.lore_lieux alter column revele set default false;            -- un nouveau lieu naît caché
  end if;
end $$;
alter table public.lore_lieux add column if not exists chapitre_id bigint references public.lore_chapitres(id) on delete set null;

create table if not exists public.lore_calques (
  id bigserial primary key,
  lieu_id bigint not null references public.lore_lieux(id) on delete cascade,
  image_path text not null,
  prive boolean not null default true,     -- true : dans le bucket lore-secret ; false : dans le bucket public cartes
  ordre integer not null default 0
);
create index if not exists lore_calques_lieu_idx on public.lore_calques (lieu_id);
alter table public.lore_calques enable row level security;
revoke all on public.lore_calques from public, anon, authenticated;
grant select on public.lore_calques to anon, authenticated;
grant insert, update, delete on public.lore_calques to authenticated;
grant usage on sequence public.lore_calques_id_seq to authenticated;
drop policy if exists lore_calques_lire on public.lore_calques;
create policy lore_calques_lire on public.lore_calques for select to anon, authenticated
  using (public.is_admin() or (not prive and exists (select 1 from public.lore_lieux l where l.id = lieu_id and l.revele)));
drop policy if exists lore_calques_admin on public.lore_calques;
create policy lore_calques_admin on public.lore_calques for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Un lieu caché n'est pas envoyé aux joueurs
drop policy if exists lore_lieux_lire on public.lore_lieux;
create policy lore_lieux_lire on public.lore_lieux for select to anon, authenticated
  using (revele or public.is_admin());

-- Images copiées sur GitHub : en plus de celles des cartes, celles du lore qui sont publiques
create or replace function public.chemins_images()
returns setof text language sql stable security definer set search_path = public as $$
  select v.image_path from public.variantes_carte v join public.cartes c on c.id = v.carte_id where c.actif and v.image_path is not null
  union
  select v.image_combat from public.variantes_carte v join public.cartes c on c.id = v.carte_id where c.actif and v.image_combat is not null
  union
  select tb.image_path from public.types_boosters tb where tb.image_path is not null
  union
  select d.image from public.dos_cartes d where d.image is not null
  union
  select image_path from public.lore_carte where image_path is not null
  union
  select image_path from public.lore_chapitres where image_path is not null
  union
  select image_path from public.lore_lieux where revele and image_path is not null
  union
  select k.image_path from public.lore_calques k join public.lore_lieux l on l.id = k.lieu_id where l.revele and not k.prive
$$;
