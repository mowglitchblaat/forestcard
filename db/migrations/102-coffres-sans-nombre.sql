-- 102-coffres-sans-nombre.sql — Forest Card
-- Les coffres-forts n'annoncent plus de nombre de nouvelles cartes : à leur ouverture, « de nouvelles cartes
-- rares (épiques, légendaires) à venir ». Les nombres (40, 12, 5) avaient été posés par défaut sans que
-- l'auteur les ait donnés. nb_cartes reste pour un nombre que l'admin donnerait ; null : pas de nombre.
-- Les coffres de l'événement en cours perdent le leur.
-- À lancer une fois dans Supabase (SQL Editor), après 101-coffres-butin-partage.sql ; peut être relancé.

create or replace function public.admin_coffres_creer(p_titre text, p_fin timestamp with time zone, p_prix integer,
  p_bleu integer default 20, p_violet integer default 55, p_or integer default 100)
returns bigint language plpgsql security definer set search_path = public as $$
declare ev bigint;
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  insert into public.coffres_evenements (titre, fin, prix)
  values (coalesce(nullif(btrim(p_titre), ''), 'Les coffres-forts'), coalesce(p_fin, now() + interval '7 days'),
          coalesce(p_prix, 1000))
  returning id into ev;
  insert into public.coffres (evenement_id, rang, nom, teinte, requis, nb_cartes, rarete) values
    (ev, 1, 'Coffre bleu', 'bleu', greatest(coalesce(p_bleu, 20), 1), null, 'rares'),
    (ev, 2, 'Coffre violet', 'violet', greatest(coalesce(p_violet, 55), 1), null, 'épiques'),
    (ev, 3, 'Coffre légendaire', 'or', greatest(coalesce(p_or, 100), 1), null, 'légendaires');
  return ev;
end $$;

update public.coffres set nb_cartes = null where ouvert_le is null;
