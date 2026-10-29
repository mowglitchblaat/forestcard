-- 47-trophees-par-place.sql : une image de trophée par place (or, argent, bronze)
--
-- Avant : une seule image par tournoi (tournois.trophee), donnée aux trois premiers.
-- Maintenant : tournois.trophee reste l'image de la 1re place, trophee_2 et trophee_3 celles de la 2e et de la 3e.
-- Une place sans image prend celle de la 1re place ; sans aucune image, le site dessine une coupe or, argent ou bronze.
-- À coller une fois dans l'éditeur SQL de Supabase, après 46-tournois.sql.

alter table public.tournois add column if not exists trophee_2 text;   -- image du trophée de la 2e place, facultative
alter table public.tournois add column if not exists trophee_3 text;   -- image du trophée de la 3e place, facultative

-- L'image du trophée d'une place (1, 2 ou 3), depuis Admin > Tournois
create or replace function public.tournoi_trophee(p_id bigint, p_place int, p_image text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(trim(coalesce(p_image, '')), '');
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if p_place not between 1 and 3 then raise exception 'Place de 1 à 3'; end if;
  if p_place = 1 then update public.tournois set trophee = v where id = p_id;
  elsif p_place = 2 then update public.tournois set trophee_2 = v where id = p_id;
  else update public.tournois set trophee_3 = v where id = p_id;
  end if;
end $$;
revoke all on function public.tournoi_trophee(bigint, int, text) from public, anon;
grant execute on function public.tournoi_trophee(bigint, int, text) to authenticated;

-- Les trois images d'un tournoi, pour l'aperçu de l'admin
create or replace function public.tournoi_trophees(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return (select jsonb_build_array(t.trophee, t.trophee_2, t.trophee_3) from public.tournois t where t.id = p_id);
end $$;
revoke all on function public.tournoi_trophees(bigint) from public, anon;
grant execute on function public.tournoi_trophees(bigint) to authenticated;

-- Fin du tournoi : comme dans 46-tournois.sql, avec l'image de chaque place
create or replace function public.tournoi_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournois; f public.tournoi_matchs; pf public.tournoi_matchs; nt int; pl uuid[]; img text[];
begin
  select * into t from public.tournois where id = p_id for update;
  if t.statut <> 'en_cours' then return; end if;
  select max(tour) into nt from public.tournoi_matchs where tournoi_id = p_id;
  select * into f from public.tournoi_matchs where tournoi_id = p_id and tour = nt and not petite;
  select * into pf from public.tournoi_matchs where tournoi_id = p_id and petite;
  pl := array[f.gagnant, case when f.gagnant = f.a then f.b else f.a end,
              pf.gagnant, case when pf.exempt or pf.gagnant is null then null when pf.gagnant = pf.a then pf.b else pf.a end];
  img := array[t.trophee, coalesce(t.trophee_2, t.trophee), coalesce(t.trophee_3, t.trophee)];
  update public.tournois set statut = 'termine', fini_le = now(), gagnant = f.gagnant where id = p_id;
  for i in 1 .. 4 loop
    if pl[i] is not null then
      if i <= 3 then
        insert into public.trophees (joueur_id, tournoi_id, place, nom, division, image) values (pl[i], t.id, i, t.nom, t.division, img[i]);
      end if;
      perform public.tournoi_recompenser(t.id, pl[i], i);
    end if;
  end loop;
end $$;
