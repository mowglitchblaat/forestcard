-- 103-vaisseau.sql — Forest Card
-- Le vaisseau attiré par l'éclair (événement du lore annoncé par la lueur violette, 96-lueur-ciel.sql).
-- Sur la carte du monde (Lore > Carte), au-dessus du lieu qui détenait l'éclair :
--   - lore_carte.vaisseau : 0 = caché, 1 = au loin (petit, haut dans la lueur), 2 = descend (il
--     grossit et s'approche du lieu), 3 = posé (au-dessus du lieu). Réglé dans Admin > Lore
--     (Carte du monde).
--   - lore_vaisseau.cle : la clé (AES-GCM, base64) de l'image du vaisseau. L'image est dans le dépôt,
--     qui est public, mais chiffrée (assets/cadres/vaisseau.bin : 12 octets d'IV puis le chiffré) :
--     les joueurs ne lisent la clé qu'une fois le vaisseau visible (vaisseau > 0) ; l'admin la lit
--     toujours. La clé est posée par une requête à part (pas dans ce fichier).
-- À lancer une fois dans Supabase (SQL Editor), après 102-coffres-sans-nombre.sql ; peut être relancé.

alter table public.lore_carte add column if not exists vaisseau smallint not null default 0
  check (vaisseau between 0 and 3);

create table if not exists public.lore_vaisseau (
  id smallint primary key default 1 check (id = 1),
  cle text not null
);

alter table public.lore_vaisseau enable row level security;
revoke all on public.lore_vaisseau from public, anon, authenticated;
grant select on public.lore_vaisseau to anon, authenticated;

drop policy if exists lore_vaisseau_lire on public.lore_vaisseau;
create policy lore_vaisseau_lire on public.lore_vaisseau for select to anon, authenticated
  using (public.is_admin() or coalesce((select c.vaisseau from public.lore_carte c where c.id = 1), 0) > 0);
