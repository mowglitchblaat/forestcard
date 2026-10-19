-- 12-propositions.sql — Forest Card
-- Propositions de cartes par les joueurs : splash art + nom + type + rareté + collection (ou idée de nouvelle collection).
-- Onglet « 🎨 Propositions » pour les joueurs, sous-onglet « Propositions » dans l'admin.
-- Limite : 3 propositions en attente par joueur. Images : 8 Mo maximum.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create table if not exists public.propositions (
  id               bigserial primary key,
  joueur_id        uuid not null,
  pseudo           text,
  image_path       text not null,
  nom              text not null check (char_length(nom) between 1 and 60),
  type             text not null check (type in ('combattant','magie','piege')),
  rarete_id        bigint,
  collection_id    bigint,
  collection_idee  text check (collection_idee is null or char_length(collection_idee) <= 80),
  idee             text check (idee is null or char_length(idee) <= 600),
  statut           text not null default 'attente' check (statut in ('attente','acceptee','refusee')),
  note_admin       text,
  cree_le          timestamptz not null default now()
);
create index if not exists propositions_cree_le_idx on public.propositions (cree_le desc);
-- Carte assemblée (dessin + cadre de la rareté), en plus du dessin seul
alter table public.propositions add column if not exists image_carte text;
-- Stats proposées par le joueur (facultatives, combattants uniquement)
alter table public.propositions add column if not exists atq int check (atq is null or atq between 0 and 999);
alter table public.propositions add column if not exists pv int check (pv is null or pv between 1 and 9999);

alter table public.propositions enable row level security;
-- Lecture : chacun voit ses propositions, l'admin voit tout
drop policy if exists "propositions lecture" on public.propositions;
create policy "propositions lecture" on public.propositions for select to authenticated
  using (joueur_id = auth.uid() or public.is_admin());
-- Modification : admin uniquement (statut, note)
drop policy if exists "propositions maj admin" on public.propositions;
create policy "propositions maj admin" on public.propositions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Suppression : l'admin, ou le joueur pour ses propositions encore en attente
drop policy if exists "propositions suppression" on public.propositions;
create policy "propositions suppression" on public.propositions for delete to authenticated
  using (public.is_admin() or (joueur_id = auth.uid() and statut = 'attente'));
grant select, update, delete on public.propositions to authenticated;

-- Envoi d'une proposition (passe par cette fonction pour appliquer la limite de 3 en attente)
drop function if exists public.proposer_carte(text, text, text, bigint, bigint, text, text);
drop function if exists public.proposer_carte(text, text, text, bigint, bigint, text, text, text);
create or replace function public.proposer_carte(p_image text, p_nom text, p_type text, p_rarete bigint,
  p_collection bigint, p_collection_idee text, p_idee text, p_image_carte text default null,
  p_atq int default null, p_pv int default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare n int; ps text; nid bigint;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour proposer une carte'; end if;
  if p_image is null or p_image not like auth.uid()::text || '/%' then raise exception 'Image invalide'; end if;
  if p_image_carte is not null and p_image_carte not like auth.uid()::text || '/%' then raise exception 'Image invalide'; end if;
  select count(*) into n from public.propositions where joueur_id = auth.uid() and statut = 'attente';
  if n >= 3 then raise exception 'Tu as déjà 3 propositions en attente : attends que l''admin les regarde'; end if;
  if p_collection is null and coalesce(trim(p_collection_idee), '') = '' then raise exception 'Choisis une collection ou écris ton idée de collection'; end if;
  select j.pseudo into ps from public.joueurs j where j.id = auth.uid();
  insert into public.propositions (joueur_id, pseudo, image_path, image_carte, atq, pv, nom, type, rarete_id, collection_id, collection_idee, idee)
  values (auth.uid(), ps, p_image, p_image_carte, case when p_type = 'combattant' then p_atq end, case when p_type = 'combattant' then p_pv end, trim(p_nom), p_type, p_rarete, p_collection,
          case when p_collection is null then nullif(trim(p_collection_idee), '') end, nullif(trim(p_idee), ''))
  returning id into nid;
  return nid;
end $$;
grant execute on function public.proposer_carte(text, text, text, bigint, bigint, text, text, text, int, int) to authenticated;

-- Stockage des images : dossier propre à chaque joueur (propositions/<id du joueur>/fichier)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('propositions', 'propositions', true, 8388608, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "propositions envoi image" on storage.objects;
create policy "propositions envoi image" on storage.objects for insert to authenticated
  with check (bucket_id = 'propositions' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "propositions lecture image" on storage.objects;
create policy "propositions lecture image" on storage.objects for select
  using (bucket_id = 'propositions');
drop policy if exists "propositions suppression image" on storage.objects;
create policy "propositions suppression image" on storage.objects for delete to authenticated
  using (bucket_id = 'propositions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
