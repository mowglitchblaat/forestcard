-- 85-boosters-de-bienvenue.sql — Forest Card
-- Boosters de bienvenue : un joueur qui se connecte pour la premiere fois (creation de son compte, declencheur
-- trg_creer_joueur sur auth.users) recoit un booster de chaque type en vente dans la boutique a ce moment-la
-- (types_boosters.actif), dans son stock, avec un message de bienvenue (la fenetre « cadeau » du site).
-- Les joueurs deja inscrits ne recoivent rien. Un echec ici n'empeche jamais l'inscription.
-- A lancer une fois dans Supabase (SQL Editor), apres 84-parrainage.sql ; peut etre relance.

create or replace function public.creer_joueur()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tid text; v_pseudo text; n integer;
begin
  v_tid := coalesce(new.raw_user_meta_data->>'provider_id', new.raw_user_meta_data->>'sub', new.id::text);
  v_pseudo := coalesce(new.raw_user_meta_data->>'preferred_username',
                       new.raw_user_meta_data->>'name',
                       new.raw_user_meta_data->>'full_name', 'joueur');
  insert into public.joueurs (id, twitch_id, pseudo) values (new.id, v_tid, v_pseudo)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    begin
      insert into public.stock_boosters (joueur_id, type_id, quantite)
      select new.id, t.id, 1 from public.types_boosters t where t.actif
      on conflict (joueur_id, type_id) do update set quantite = public.stock_boosters.quantite + 1;
      get diagnostics n = row_count;
      if n > 0 then
        insert into public.cadeaux_messages (joueur_id, message)
        values (new.id, 'Bienvenue dans Forest Card ! Tu reçois ' || n || ' booster' || case when n > 1 then 's' else '' end
          || ' : un de chaque édition de la boutique. Ouvre-les dans la Boutique !');
      end if;
    exception when others then
      raise warning 'creer_joueur (boosters de bienvenue) : %', sqlerrm;
    end;
  end if;
  return new;
end $$;
