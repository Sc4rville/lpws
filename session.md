# Session — lpws

> Journal COURT et toujours courant, mis à jour en fin de chaque session de travail.
> L'historique détaillé = `git log` (les messages de commit sont riches exprès). Pas d'accumulation ici.

## Où on en est
**Direction prise le 2026-09-17 : le clone est l'ATELIER, pas la page livrée.** Il sert à voir,
diagnostiquer, construire et montrer une variante sans aucun accès — le moment de vente. Un clone
statique ne peut pas être livré en production : pas de JS (ni panier ni formulaire), pas de
pixels, prix figés, live fragile. La **livraison** se fera par un backend adapté à la
plateforme ; le **contrat** (hypothèse + diagnostic + éditions en verbes) reste le même.

- **Shopify** (le gros de l'e-com) : une variante = un template JSON alternatif ouvert par
  `?view=<suffixe>`. Tout reste natif (panier, checkout, pixels, apps). Validé hors ligne sur Dawn.
- **SaaS** : LP hébergée sur sous-domaine (modèle Unbounce) OU tag GTM. Non tranché — dépend des
  stacks des clients (Webflow / Framer / WordPress / Next.js ?).

## Fait récemment (2026-09-17)
- `apply` : cinq verbes (set · remove · move · swap · duplicate), ancres de section `s<n>` posées
  par géométrie, journal avant/après de chaque changement. Variantes Jira + HubSpot rendues dans
  leur design system, sans une ligne de CSS écrite.
- Cockpit : marques au lieu des slugs, journal lisible et cliquable, delta rouge retiré.
- `1_acquire` refuse une page >= 400 ou une page d'erreur déguisée (asana.com/uses/sales était
  une 404 clonée « fidèle à 0,00 % »). Descente vers les sections corrigée (HubSpot 4 → 17).
- **Spike Shopify hors ligne** (scratchpad, `engine/` non touché) sur le thème Dawn :
  - nos verbes se traduisent 1:1 en opérations de template (réglages, `order`, `block_order`),
    au niveau section ET bloc, + un verbe `add` : n'importe quelle section du thème → le dossier
    `sections/` est la bibliothèque de blocs du client (fin de la limite de `duplicate`) ;
  - une variante PDP valide produite (réassurance sous le bouton, FAQ native, cross-sell retitré) ;
  - validation contre les `{% schema %}` : spec invalide refusée 6/6, rien écrit ;
  - Theme Check (outil officiel) : 0 erreur sur nos templates, MAIS contrôle volontairement cassé →
    il ne détecte que 1 erreur sur 4 (type de section inconnu ; pas les blocs ni réglages
    inexistants). Notre validation est plus stricte que la sienne : elle est nécessaire.

## À faire (dans l'ordre)
1. **Yann : compte Shopify Partner + boutique de dev** — seul moyen de valider le rendu, `?view=`,
   et le mode d'accès (collaborateur ou app custom). Rien d'autre ne peut trancher ça.
2. Sur la boutique : pousser la variante Dawn, la rendre, vérifier que Shopify accepte/rejette ce
   que notre validateur accepte/rejette. Si OK → backend Shopify dans `engine/apply`.
3. Trancher la livraison SaaS selon les stacks réelles des clients.
4. Le brain : `4_structure` (sur Shopify, le template JSON EST déjà le page.json), `context.json`,
   KB, premier `/diagnose`.
5. **Arrêté** : rendre le clone « production-ready » (réinjection JS/pixels) — pas avant d'avoir
   choisi la livraison SaaS.

## Blocages / parking
- **Clone Asana (uses/project-management) interrompu** pendant la récupération des fichiers, sans
  message d'erreur, cause inconnue. Non-régression Jira non revérifiée après les correctifs d'hier.
- Header/footer Shopify = groupes de sections rendus par le layout : les retirer demande un layout
  alternatif (clé `layout` du template). Et sur une PDP, retirer le header retire l'icône panier —
  la règle « retirer la nav » (pensée B2B) ne s'applique pas telle quelle à l'e-com.
- Sur Shopify, les avis viennent d'apps (blocs `@app`) : on ne peut pas en créer, seulement placer.
- Écriture de thème par une app publique = exemption Shopify requise (depuis l'API 2023-04).
- Recherche v2 à lancer : `docs/recherche-v2-brief.md` (livrable clé : KB e-com + créa→hero).
- Corpus sans aucune page e-commerce : ajouter une PDP Shopify réelle.
- Gel trop brutal (animation figée en plein vol) · Salesforce anti-bot · Monday scroll-jack.
- Jev (TypeSafe) : non adopté ; garder l'extraction de signaux en questions typées indépendantes.
