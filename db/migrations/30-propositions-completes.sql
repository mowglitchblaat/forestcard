-- 30-propositions-completes.sql — Forest Card
-- Propositions complètes : le joueur crée sa carte entièrement (ultime, passifs, effet de magie,
-- condition et effet de piège, choisis dans les listes du jeu) avec le composeur de cartes ; la
-- proposition garde ses effets et ses réglages de composition, pour que l'admin puisse en faire une
-- vraie carte en un clic (Admin → Propositions → « Créer la carte »).
--
-- À lancer une fois dans Supabase (SQL Editor), après 12-propositions.sql ; peut être relancé sans risque.

alter table public.propositions add column if not exists ultime jsonb;
alter table public.propositions add column if not exists passif jsonb;
alter table public.propositions add column if not exists effet jsonb;
alter table public.propositions add column if not exists compo jsonb;
-- la carte créée depuis la proposition (quand l'admin l'a faite)
alter table public.propositions add column if not exists carte_id bigint;

drop function if exists public.proposer_carte(text, text, text, bigint, bigint, text, text, text, int, int);
create or replace function public.proposer_carte(p_image text, p_nom text, p_type text, p_rarete bigint,
  p_collection bigint, p_collection_idee text, p_idee text, p_image_carte text default null,
  p_atq int default null, p_pv int default null,
  p_ultime jsonb default null, p_passif jsonb default null, p_effet jsonb default null, p_compo jsonb default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare n int; ps text; nid bigint;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour proposer une carte'; end if;
  if p_image is null or p_image not like auth.uid()::text || '/%' then raise exception 'Image invalide'; end if;
  if p_image_carte is not null and p_image_carte not like auth.uid()::text || '/%' then raise exception 'Image invalide'; end if;
  select count(*) into n from public.propositions where joueur_id = auth.uid() and statut = 'attente';
  if n >= 3 then raise exception 'Tu as déjà 3 propositions en attente : attends que l''admin les regarde'; end if;
  if p_collection is null and coalesce(trim(p_collection_idee), '') = '' then raise exception 'Choisis une collection ou écris ton idée de collection'; end if;
  if octet_length(coalesce(p_ultime::text, '') || coalesce(p_passif::text, '') || coalesce(p_effet::text, '') || coalesce(p_compo::text, '')) > 20000 then
    raise exception 'Carte trop chargée'; end if;
  select j.pseudo into ps from public.joueurs j where j.id = auth.uid();
  insert into public.propositions (joueur_id, pseudo, image_path, image_carte, atq, pv, nom, type, rarete_id, collection_id, collection_idee, idee,
                                   ultime, passif, effet, compo)
  values (auth.uid(), ps, p_image, p_image_carte, case when p_type = 'combattant' then p_atq end, case when p_type = 'combattant' then p_pv end, trim(p_nom), p_type, p_rarete, p_collection,
          case when p_collection is null then nullif(trim(p_collection_idee), '') end, nullif(trim(p_idee), ''),
          case when p_type = 'combattant' then p_ultime end, case when p_type = 'combattant' then p_passif end,
          case when p_type <> 'combattant' then p_effet end, p_compo)
  returning id into nid;
  return nid;
end $$;
grant execute on function public.proposer_carte(text, text, text, bigint, bigint, text, text, text, int, int, jsonb, jsonb, jsonb, jsonb) to authenticated;
