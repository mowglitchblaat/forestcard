-- 25-stat-boosters-ouverts.sql — Forest Card
-- La stat « Boosters ouverts » du profil restait à 0 : rien ne la faisait monter.
-- Désormais, chaque ouverture notée dans historique_boosters (script 23) ajoute +1 à stats_joueurs.boosters_ouverts.
-- Si la note échoue, l'ouverture du booster marche quand même.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque. Nécessite le script 23.

create or replace function public.stat_booster_ouvert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.joueur_id is null then return null; end if;
  begin
    update public.stats_joueurs set boosters_ouverts = coalesce(boosters_ouverts, 0) + 1, maj = now() where joueur_id = new.joueur_id;
    if not found then
      insert into public.stats_joueurs (joueur_id, boosters_ouverts) values (new.joueur_id, 1);
    end if;
  exception when others then
    raise warning 'stat boosters_ouverts : %', sqlerrm;   -- jamais bloquant
  end;
  return null;
end $$;

drop trigger if exists stat_boosters_ouverts on public.historique_boosters;
create trigger stat_boosters_ouverts after insert on public.historique_boosters
  for each row execute function public.stat_booster_ouvert();

-- Rattrapage : les boosters déjà notés depuis le script 23 sont comptés (seulement si la stat est encore à 0)
update public.stats_joueurs s set boosters_ouverts = h.n, maj = now()
from (select joueur_id, count(*) n from public.historique_boosters where joueur_id is not null group by joueur_id) h
where s.joueur_id = h.joueur_id and coalesce(s.boosters_ouverts, 0) = 0;

-- Vérification : boosters notés depuis le script 23, par joueur (joueur vide = ouverture non rattachée à un joueur)
select coalesce(j.pseudo, '(joueur non retrouvé : ' || coalesce(h.pseudo, '?') || ')') as joueur, count(*) as boosters_notes
from public.historique_boosters h left join public.joueurs j on j.id = h.joueur_id
group by 1 order by 2 desc;
