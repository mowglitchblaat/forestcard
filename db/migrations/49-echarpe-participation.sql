-- 49-echarpe-participation.sql : une écharpe de participation pour chaque joueur du tournoi
--
-- À la fin d'un tournoi, chaque inscrit (podium compris) reçoit une écharpe, rangée dans l'armoire de son profil
-- comme les trophées (table trophees, place 0). Son image se met dans Admin > Tournois (tournois.echarpe) ;
-- sans image, le site dessine une écharpe.
-- À coller une fois dans l'éditeur SQL de Supabase, après 48-tournoi-json-delete.sql.

alter table public.tournois add column if not exists echarpe text;   -- image de l'écharpe de participation, facultative

-- place 0 : l'écharpe de participation (1 à 3 : les trophées)
alter table public.trophees drop constraint if exists trophees_place_check;
alter table public.trophees add constraint trophees_place_check check (place in (0, 1, 2, 3));

-- L'image d'une place (0 : écharpe, 1 à 3 : trophées), depuis Admin > Tournois
create or replace function public.tournoi_trophee(p_id bigint, p_place int, p_image text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(trim(coalesce(p_image, '')), '');
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if p_place not between 0 and 3 then raise exception 'Place de 0 (écharpe) à 3'; end if;
  if p_place = 0 then update public.tournois set echarpe = v where id = p_id;
  elsif p_place = 1 then update public.tournois set trophee = v where id = p_id;
  elsif p_place = 2 then update public.tournois set trophee_2 = v where id = p_id;
  else update public.tournois set trophee_3 = v where id = p_id;
  end if;
end $$;

-- Les images d'un tournoi : trophées des places 1 à 3, puis l'écharpe
create or replace function public.tournoi_trophees(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return (select jsonb_build_array(t.trophee, t.trophee_2, t.trophee_3, t.echarpe) from public.tournois t where t.id = p_id);
end $$;

-- Fin du tournoi : comme dans 47-trophees-par-place.sql, puis une écharpe pour chaque inscrit
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
  insert into public.trophees (joueur_id, tournoi_id, place, nom, division, image)
  select i.joueur_id, t.id, 0, t.nom, t.division, t.echarpe from public.tournoi_inscrits i where i.tournoi_id = t.id;
end $$;

-- L'armoire d'un joueur : les trophées (1re, 2e, 3e place), puis les écharpes, du plus récent au plus ancien
create or replace function public.trophees_joueur(p_joueur uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', tr.id, 'tournoi', tr.tournoi_id, 'place', tr.place, 'nom', tr.nom,
           'division', tr.division, 'ceinture', public.titre_nom(tr.division), 'image', tr.image, 'le', tr.attribue_le)
           order by tr.place = 0, tr.place, tr.attribue_le desc), '[]')
  from public.trophees tr
  where tr.joueur_id = p_joueur and (tr.tournoi_id is null or not public.tournoi_fin_cachee(tr.tournoi_id));
$$;
