-- 53-abandon-tournoi.sql (a executer une fois dans Supabase, apres 52)
create table if not exists public.tournoi_abandons (
 tournoi_id bigint not null, joueur_id uuid not null,
 abandonne_le timestamptz not null default now(),
 primary key(tournoi_id,joueur_id),
 foreign key(tournoi_id,joueur_id) references public.tournoi_inscrits(tournoi_id,joueur_id) on delete cascade
);
alter table public.tournoi_abandons enable row level security;
revoke all on public.tournoi_abandons from public,anon,authenticated;

create or replace function public.tournoi_est_abandonne(p_id bigint)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.tournoi_abandons where tournoi_id=p_id and joueur_id=auth.uid());
$$;
revoke all on function public.tournoi_est_abandonne(bigint) from public,anon;
grant execute on function public.tournoi_est_abandonne(bigint) to authenticated;

create or replace function public.tournoi_appliquer_abandons(p_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare m public.tournoi_matchs; elu uuid; n int:=0; aa boolean; ab boolean;
begin
 loop
  select x.* into m from public.tournoi_matchs x
    where x.tournoi_id=p_id and x.gagnant is null and x.fini_le is null
      and x.a is not null and x.b is not null
      and exists(select 1 from public.tournoi_abandons z where z.tournoi_id=p_id and z.joueur_id in (x.a,x.b))
    order by x.tour,x.position limit 1 for update of x;
  exit when m.id is null;
  select exists(select 1 from public.tournoi_abandons where tournoi_id=p_id and joueur_id=m.a),
         exists(select 1 from public.tournoi_abandons where tournoi_id=p_id and joueur_id=m.b) into aa,ab;
  elu:=case when aa and not ab then m.b else m.a end;
  update public.tournoi_matchs set gagnant=elu,fini_le=now(),exempt=true where id=m.id;
  perform public.tournoi_avancer(m.id);
  n:=n+1;
  if n>2000 then raise exception 'Trop de forfaits a resoudre'; end if;
 end loop;
end $$;
revoke all on function public.tournoi_appliquer_abandons(bigint) from public,anon,authenticated;

create or replace function public.tournoi_quitter_j(p_joueur uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.tournois;
begin
 if p_joueur is null then raise exception 'Joueur inconnu'; end if;
 select * into t from public.tournois where statut in ('inscriptions','en_cours') for update;
 if t.id is null then raise exception 'Aucun tournoi ouvert'; end if;
 if not exists(select 1 from public.tournoi_inscrits where tournoi_id=t.id and joueur_id=p_joueur)
   then raise exception 'Tu n''es pas inscrit au tournoi « % »',t.nom; end if;
 if t.statut='inscriptions' then
   delete from public.tournoi_inscrits where tournoi_id=t.id and joueur_id=p_joueur;
   return jsonb_build_object('tournoi',t.nom,'pseudo',(select pseudo from public.joueurs where id=p_joueur),
     'abandon',false,'inscrits',(select count(*) from public.tournoi_inscrits where tournoi_id=t.id));
 end if;
 insert into public.tournoi_abandons(tournoi_id,joueur_id) values(t.id,p_joueur) on conflict do nothing;
 if not found then raise exception 'Tu as deja abandonne ce tournoi'; end if;
 perform public.tournoi_appliquer_abandons(t.id);
 return jsonb_build_object('tournoi',t.nom,'pseudo',(select pseudo from public.joueurs where id=p_joueur),
   'abandon',true,'inscrits',(select count(*) from public.tournoi_inscrits where tournoi_id=t.id));
end $$;

create or replace function public.tournoi_prochain(p_id bigint)
returns public.tournoi_matchs language plpgsql volatile security definer set search_path=public as $$
declare m public.tournoi_matchs;
begin
 perform public.tournoi_appliquer_abandons(p_id);
 select * into m from public.tournoi_matchs where tournoi_id=p_id and gagnant is null
   and a is not null and b is not null order by tour,petite desc,position limit 1;
 return m;
end $$;
revoke all on function public.tournoi_prochain(bigint) from public,anon,authenticated;
grant execute on function public.tournoi_prochain(bigint) to service_role;
