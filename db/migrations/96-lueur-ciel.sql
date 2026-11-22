-- 96-lueur-ciel.sql — Forest Card
-- Une lueur violette dans le ciel de la carte du monde (Lore > Carte), pour annoncer un événement à venir.
--   - lore_carte.lueur : 0 = éteinte, 1 (à peine visible) à 10 (ciel embrasé). Réglée dans Admin > Lore
--     (Carte du monde), lue par tous avec la carte. Montée petit à petit au fil des jours.
-- La lueur tombe du ciel, depuis le haut de la carte, au-dessus du lieu qui détient l'éclair (sinon au
-- centre), avec des rayons doux à partir du niveau 2.
-- À lancer une fois dans Supabase (SQL Editor), après 95-live-auto.sql ; peut être relancé.

alter table public.lore_carte add column if not exists lueur smallint not null default 0
  check (lueur between 0 and 10);

-- Au niveau 3, la première fois seulement : une annonce mystérieuse est publiée toute seule (onglet Annonces).
alter table public.lore_carte add column if not exists lueur_annonce boolean not null default false;

create or replace function public.lueur_annonce()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lueur >= 3 and coalesce(old.lueur, 0) < 3 and not new.lueur_annonce then
    insert into public.annonces (type, titre, texte)
      values ('annonce', 'Mais qu''est-ce ? Que se passe-t-il ?', '');   -- rien de plus : ça reste mystérieux
    new.lueur_annonce := true;
  end if;
  return new;
end $$;
revoke all on function public.lueur_annonce() from public, anon, authenticated;
drop trigger if exists lueur_annonce on public.lore_carte;
create trigger lueur_annonce before update on public.lore_carte for each row execute function public.lueur_annonce();
