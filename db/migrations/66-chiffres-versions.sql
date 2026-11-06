-- 66-chiffres-versions.sql — Forest Card
-- Les chiffres ATQ / PV en direct pendant le combat (combat.html) ont un style par version de carte :
--   standard : rouge et bleu, comme sur les cartes composées ;
--   or       : or métallique, sur les médaillons des versions « FULLEG » (le chiffre imprimé est recouvert) ;
--   violet   : violet métallique, sur les médaillons des versions « FULLEP » (idem) ;
--   seazer   : blanc et net dans les losanges des versions « Seazer édition » (image de combat sans chiffres).
-- variantes_carte.chiffres choisit le style ; vide, il se déduit du nom de la version (style_chiffres).
-- chiffres_cartes(p_ids) : le style de chaque version des cartes d'un combat, lisible avec la clé publique
-- (comme zones_cartes, 31-zones-combat.sql). Admin > Cartes règle le style version par version.
-- À lancer une fois dans Supabase (SQL Editor), après 65-images-inutilisees-generique.sql ; peut être relancé.

alter table public.variantes_carte add column if not exists chiffres text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'variantes_carte_chiffres_check') then
    alter table public.variantes_carte add constraint variantes_carte_chiffres_check
      check (chiffres is null or chiffres in ('standard', 'or', 'violet', 'seazer'));
  end if;
end $$;

create or replace function public.style_chiffres(p_nom text, p_chiffres text)
returns text language sql immutable as $$
  select coalesce(p_chiffres, case
    when p_nom ilike 'FULLEG%' then 'or'
    when p_nom ilike 'FULLEP%' then 'violet'
    when p_nom ilike '%seazer%' then 'seazer'
    else 'standard' end);
$$;

create or replace function public.chiffres_cartes(p_ids bigint[])
returns table(carte_id bigint, image_path text, image_combat text, style text)
language sql stable security definer set search_path = public as $$
  select v.carte_id::bigint, v.image_path, v.image_combat, public.style_chiffres(v.nom, v.chiffres)
  from public.variantes_carte v where v.carte_id = any(p_ids);
$$;
revoke all on function public.chiffres_cartes(bigint[]) from public;
grant execute on function public.chiffres_cartes(bigint[]) to anon, authenticated;
