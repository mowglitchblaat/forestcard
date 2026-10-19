-- 10-equilibrage.sql — Forest Card
-- Journal d'équilibrage : chaque modification de carte faite dans l'admin y est enregistrée
-- automatiquement (valeur avant → après). Affiché dans l'onglet « Patch notes → Équilibrage » du site.
-- À lancer une seule fois dans Supabase (SQL Editor). Peut être relancé sans risque.

create table if not exists public.equilibrage (
  id          bigserial primary key,
  carte_id    bigint,
  carte_nom   text not null,
  carte_type  text,
  changements jsonb not null default '[]'::jsonb,
  cree_le     timestamptz not null default now()
);

create index if not exists equilibrage_cree_le_idx on public.equilibrage (cree_le desc);

alter table public.equilibrage enable row level security;

-- Tout le monde peut lire les patch notes
drop policy if exists "equilibrage lecture" on public.equilibrage;
create policy "equilibrage lecture" on public.equilibrage
  for select using (true);

-- Seul l'admin peut ajouter ou retirer des lignes
drop policy if exists "equilibrage ajout admin" on public.equilibrage;
create policy "equilibrage ajout admin" on public.equilibrage
  for insert to authenticated with check (public.is_admin());

drop policy if exists "equilibrage suppression admin" on public.equilibrage;
create policy "equilibrage suppression admin" on public.equilibrage
  for delete to authenticated using (public.is_admin());

grant select on public.equilibrage to anon, authenticated;
grant insert, delete on public.equilibrage to authenticated;
grant usage, select on sequence public.equilibrage_id_seq to authenticated;
