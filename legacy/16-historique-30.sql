-- 16-historique-30.sql — Forest Card
-- Historique limité aux 30 derniers combats de chaque joueur (pour que la base ne grossisse pas : limite gratuite 500 Mo).
-- À chaque nouveau combat, les combats plus anciens que les 30 derniers des DEUX joueurs sont effacés.
-- Un combat reste tant qu'il fait partie des 30 derniers d'au moins un des deux joueurs.
-- Les combats du jour ne sont jamais effacés (ils servent à la limite « même adversaire par jour »).
-- Les statistiques (victoires, séries, records, classement) ne sont PAS touchées : elles sont comptées à part.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque. Fait aussi le ménage tout de suite.

create index if not exists historique_combats_a_idx on public.historique_combats (joueur_a, cree_le desc);
create index if not exists historique_combats_b_idx on public.historique_combats (joueur_b, cree_le desc);

-- Ménage pour une liste de joueurs (null = tous)
-- Un combat est effacé si, pour CHACUN de ses deux joueurs, il y a déjà au moins 30 combats plus récents.
create or replace function public.nettoyer_historique(p_joueurs uuid[] default null, p_garder int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare n int; minuit timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
begin
  delete from public.historique_combats h
  where h.cree_le < minuit   -- jamais les combats du jour
    and (p_joueurs is null or h.joueur_a = any(p_joueurs) or h.joueur_b = any(p_joueurs))
    and (h.joueur_a is null or (select count(*) from public.historique_combats x
         where (x.joueur_a = h.joueur_a or x.joueur_b = h.joueur_a) and (x.cree_le, x.id) > (h.cree_le, h.id)) >= p_garder)
    and (h.joueur_b is null or (select count(*) from public.historique_combats x
         where (x.joueur_a = h.joueur_b or x.joueur_b = h.joueur_b) and (x.cree_le, x.id) > (h.cree_le, h.id)) >= p_garder);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.nettoyer_historique(uuid[], int) from public, anon, authenticated;

-- Après chaque combat enregistré : ménage pour les deux joueurs
create or replace function public.historique_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.nettoyer_historique(array_remove(array[new.joueur_a, new.joueur_b], null));
  return null;
end $$;
drop trigger if exists historique_30 on public.historique_combats;
create trigger historique_30 after insert on public.historique_combats
  for each row execute function public.historique_apres_combat();

-- Ménage immédiat de l'historique existant
select public.nettoyer_historique(null) as combats_effaces;
