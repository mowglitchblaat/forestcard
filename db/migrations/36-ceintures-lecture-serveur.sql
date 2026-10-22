-- 36-ceintures-lecture-serveur.sql — Forest Card
-- swift-responder lit la table ceintures directement (clé de service) pour afficher les ceintures de chaque
-- joueur autour de sa carte, dans tous les combats. 33-championnat.sql n'avait donné aucun droit sur cette
-- table : selon les réglages du projet, la clé de service ne pouvait pas la lire, et seule la ceinture mise en
-- jeu (qui vient du défi) s'affichait. À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.
grant select on public.ceintures to service_role;
