-- 15-images-github.sql — Forest Card
-- Liste des images à recopier chaque nuit sur GitHub (pour économiser le quota Supabase).
-- Ne donne QUE des noms de fichiers, et seulement ceux des cartes ACTIVES (pas de spoiler des cartes pas encore sorties),
-- plus les images des boosters et des dos de cartes. Aucune autre donnée n'est lisible.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.chemins_images()
returns setof text language sql stable security definer set search_path = public as $$
  select v.image_path from public.variantes_carte v join public.cartes c on c.id = v.carte_id where c.actif and v.image_path is not null
  union
  select v.image_combat from public.variantes_carte v join public.cartes c on c.id = v.carte_id where c.actif and v.image_combat is not null
  union
  select tb.image_path from public.types_boosters tb where tb.image_path is not null
  union
  select d.image from public.dos_cartes d where d.image is not null
$$;

grant execute on function public.chemins_images() to anon, authenticated;
