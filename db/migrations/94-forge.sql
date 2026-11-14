-- 94-forge.sql — Forest Card
-- L'atelier, partie 2 : la forge de la premiere Forgeronne. Le joueur choisit une carte et la forge avec ses fragments
-- de rarete (ceux de TAC-001) : une Epique coute forge_prix_epique fragments epiques (600), une Legendaire
-- forge_prix_legendaire fragments legendaires (1200), une GGEZ forge_prix_ggez fragments GGEZ (1600). Une version
-- alternative rare (FULLEP, FULLEG) coute forge_mult_alternative fois plus (x2).
-- Forgeables : les cartes actives d'une collection active (une collection secrete n'en a pas), hors Fondateurs, de
-- rarete Epique, Legendaire ou GGEZ, dans leur version Standard ou alternative rare (pas les editions speciales).
-- A lancer une fois dans Supabase (SQL Editor), apres 93-atelier-trois-rouleaux.sql ; peut etre relance.

insert into public.reglages_jeu (cle, valeur) values
  ('forge_prix_epique', '600'), ('forge_prix_legendaire', '1200'), ('forge_prix_ggez', '1600'),
  ('forge_mult_alternative', '2')
on conflict (cle) do nothing;

create table if not exists public.forge_journal (
  id bigint generated always as identity primary key,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  variante_id integer not null,
  palier text not null,
  prix integer not null,
  cree_le timestamptz not null default now()
);
alter table public.forge_journal enable row level security;

-- Les versions forgeables, avec leur palier et leur prix.
create or replace function public._forge_offre()
returns table (variante_id integer, carte_id integer, nom text, variante text, image text, type text,
               palier text, couleur text, alternative boolean, prix integer)
language sql stable security definer set search_path = public as $$
  select v.id, c.id, btrim(c.nom), v.nom, v.image_path, c.type,
         case c.rarete_id when 4 then 'epique' when 3 then 'legendaire' else 'ggez' end,
         r.couleur, upper(btrim(v.nom)) in ('FULLEP', 'FULLEG'),
         public.parrainage_reglage('forge_prix_' || case c.rarete_id when 4 then 'epique' when 3 then 'legendaire' else 'ggez' end,
           case c.rarete_id when 4 then 600 when 3 then 1200 else 1600 end)
         * case when upper(btrim(v.nom)) in ('FULLEP', 'FULLEG') then public.parrainage_reglage('forge_mult_alternative', 2) else 1 end
  from public.cartes c
  join public.collections co on co.id = c.collection_id and co.active and co.nom <> 'Fondateurs'
  join public.raretes r on r.id = c.rarete_id
  join public.variantes_carte v on v.carte_id = c.id
  where c.actif and c.rarete_id in (3, 4, 5) and v.image_path is not null
    and upper(btrim(v.nom)) in ('STANDARD', 'FULLEP', 'FULLEG');
$$;
revoke all on function public._forge_offre() from public, anon, authenticated;

create or replace function public.forge_catalogue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where id = auth.uid();
  return jsonb_build_object(
    'soldes', jsonb_build_object('epique', coalesce(j.fragments_epique, 0), 'legendaire', coalesce(j.fragments_legendaire, 0),
      'ggez', coalesce(j.fragments_ggez, 0)),
    'forgeronne', (select v.image_path from public.cartes c join public.variantes_carte v on v.carte_id = c.id
                   where lower(btrim(c.nom)) = 'la première forgeronne' and v.image_path is not null order by v.id limit 1),
    'cartes', coalesce((select jsonb_agg(jsonb_build_object('variante_id', o.variante_id, 'carte_id', o.carte_id, 'nom', o.nom,
        'variante', o.variante, 'image', o.image, 'type', o.type, 'palier', o.palier, 'couleur', o.couleur,
        'alternative', o.alternative, 'prix', o.prix,
        'possede', coalesce((select cj.quantite from public.collection_joueur cj
                             where cj.joueur_id = auth.uid() and cj.variante_id = o.variante_id), 0))
      order by case o.palier when 'ggez' then 0 when 'legendaire' then 1 else 2 end, o.nom, o.alternative)
      from public._forge_offre() o), '[]'::jsonb));
end $$;
grant execute on function public.forge_catalogue() to authenticated;

-- Forger une version : son prix est pris dans les fragments de son palier, elle entre dans la collection.
-- Refus : NON_CONNECTE, NON_FORGEABLE, FRAGMENTS_INSUFFISANTS.
create or replace function public.forge_forger(p_variante integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; j public.joueurs; solde integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into o from public._forge_offre() f where f.variante_id = p_variante;
  if not found then raise exception 'NON_FORGEABLE'; end if;
  select * into j from public.joueurs where id = auth.uid() for update;
  solde := case o.palier when 'epique' then j.fragments_epique when 'legendaire' then j.fragments_legendaire else j.fragments_ggez end;
  if coalesce(solde, 0) < o.prix then raise exception 'FRAGMENTS_INSUFFISANTS'; end if;
  update public.joueurs set
    fragments_epique = fragments_epique - case when o.palier = 'epique' then o.prix else 0 end,
    fragments_legendaire = fragments_legendaire - case when o.palier = 'legendaire' then o.prix else 0 end,
    fragments_ggez = fragments_ggez - case when o.palier = 'ggez' then o.prix else 0 end
  where id = auth.uid();
  insert into public.collection_joueur (joueur_id, variante_id, quantite) values (auth.uid(), p_variante, 1)
  on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
  insert into public.forge_journal (joueur_id, variante_id, palier, prix) values (auth.uid(), p_variante, o.palier, o.prix);
  return jsonb_build_object('variante_id', o.variante_id, 'nom', o.nom, 'variante', o.variante, 'image', o.image,
    'couleur', o.couleur, 'palier', o.palier, 'prix', o.prix);
end $$;
grant execute on function public.forge_forger(integer) to authenticated;
