-- 29-composition-cartes.sql — Forest Card
-- Composeur de carte de l'admin : l'admin envoie le dessin seul, le site pose le cadre, l'écriteau
-- (ultime et passifs) et les chiffres, et crée l'image normale et l'image de combat.
-- Pour pouvoir refaire ces images quand la carte change (stats, ultime, passifs, rareté), la version
-- de la carte garde son dessin et les réglages de composition (placement, police, style…).
--
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

alter table public.variantes_carte add column if not exists dessin_path text;
alter table public.variantes_carte add column if not exists compo jsonb;

comment on column public.variantes_carte.dessin_path is 'Dessin seul (bucket cartes, dossier dessins/) : l''image est recomposée à partir de lui.';
comment on column public.variantes_carte.compo is 'Réglages du composeur de l''admin : placement du dessin (z, x, y), police, style, taille, position, marge, ultime à la DA, textes de l''écriteau.';
