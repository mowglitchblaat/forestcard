-- 22-deck-10-cartes.sql — Forest Card
-- Le deck de combat doit faire EXACTEMENT 10 cartes (3 combattants, 3 magies, 3 pièges + 1 libre).
-- Avant : 9 ou 10 cartes acceptées. Le site bloque déjà, ce script bloque aussi côté Supabase.
--
-- Comment : la fonction actuelle enregistrer_deck est gardée telle quelle sous le nom enregistrer_deck_base
-- (elle continue de vérifier la composition et la possession des cartes), et une nouvelle enregistrer_deck
-- vérifie d'abord qu'il y a 10 cartes différentes, puis appelle l'ancienne.
-- Le script peut être relancé sans risque.

do $$
declare
  arg text; res text;
begin
  -- 1) mettre l'ancienne fonction de côté (une seule fois)
  if not exists (select 1 from pg_proc where proname = 'enregistrer_deck_base' and pronamespace = 'public'::regnamespace) then
    select pg_get_function_identity_arguments(oid) into arg
      from pg_proc where proname = 'enregistrer_deck' and pronamespace = 'public'::regnamespace limit 1;
    if arg is null then raise exception 'Fonction enregistrer_deck introuvable'; end if;
    execute format('alter function public.enregistrer_deck(%s) rename to enregistrer_deck_base', arg);
  end if;

  -- 2) nouvelle enregistrer_deck, même paramètre et même résultat que l'ancienne
  select pg_get_function_identity_arguments(oid), pg_get_function_result(oid) into arg, res
    from pg_proc where proname = 'enregistrer_deck_base' and pronamespace = 'public'::regnamespace limit 1;
  execute format($f$
    create or replace function public.enregistrer_deck(%1$s) returns %2$s
    language plpgsql security definer set search_path = public as $b$
    begin
      if p_cartes is null or (select count(distinct x) from unnest(p_cartes) x) <> 10 then
        raise exception 'DECK_TAILLE_INVALIDE';
      end if;
      %3$s public.enregistrer_deck_base(p_cartes);
    end $b$;$f$, arg, res, case when res = 'void' then 'perform' else 'return' end);
  execute format('grant execute on function public.enregistrer_deck(%s) to authenticated', arg);
  -- l'ancienne ne peut plus être appelée directement depuis le site (sinon 9 cartes passeraient encore)
  execute format('revoke execute on function public.enregistrer_deck_base(%s) from public, anon, authenticated', arg);
end $$;
