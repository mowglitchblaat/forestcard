# L'edge function est livrée en un seul fichier

`swift-responder` est déployée en collant un seul fichier dans le dashboard Supabase, sans CLI. Le build (`apps/edge`) produit donc un fichier `.ts` autonome, avec le moteur et la projection inlinés, à coller tel quel. C'est le même geste qu'avant la réécriture, mais le fichier est généré au lieu d'être recopié à la main.

## Conséquences

Tout ce que l'edge prend dans ce repo (moteur, projection) est inliné au build : le fichier collé ne référence aucun package du workspace. Il ne contient aucun secret, tout passe par `Deno.env`.
