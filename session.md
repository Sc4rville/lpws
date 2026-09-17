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
  - une variante PDP valide produite (réassurance sous le bouton d'achat, FAQ native,
    cross-sell retitré), diff relu ; tous les verbes testés au niveau section ET bloc ;
  - validation contre les `{% schema %}` du thème : spec invalide refusée 6/6, rien écrit ;
  - Theme Check (outil officiel) : 0 erreur sur nos templates, MAIS contrôle volontairement cassé →
    il ne détecte que 1 erreur sur 4 (type de section inconnu ; pas les blocs ni réglages
    inexistants). Notre validation est plus stricte que la sienne : elle est nécessaire.

  **Correspondance verbe → template JSON** (le code du spike est dans le scratchpad, donc
  éphémère : ce tableau suffit à le refaire) :
  | verbe | opération |
  |---|---|
  | `set` | `sections.<id>.settings.<clé>`, ou `.blocks.<bloc>.settings.<clé>` |
  | `remove` | retirer de `order` / `block_order` + supprimer l'entrée · refus si type `main-*` |
  | `move` · `swap` | réordonner `order` / `block_order` |
  | `duplicate` | copier l'entrée sous une nouvelle clé alphanumérique |
  | `add` | **nouveau** : entrée `{type, settings, blocks, block_order}` — le type doit avoir un `presets` dans son schéma, sinon l'éditeur de thème ne l'autorise pas. Rend toute la bibliothèque `sections/` du client disponible : c'est la fin de la limite de `duplicate` |

  Limites : 25 sections par template, 50 blocs par section, 1 000 templates par thème.
  Nommage : `product.<suffixe>.json` s'ouvre avec `?view=<suffixe>`.

## Fait le 2026-09-17 (soir)
- **Verbe `compose`** : créer une section absente de la page à partir du design system
  récolté (`design.ts` → rôles = chaînes de classes du client). Deux sections créées sur
  Jira. Honnêtement : typo, échelle des titres et grille exactes, mais les **wrappers** ne
  se récoltent pas (fond de bande sombre resté blanc, gouttière, bouton étiré). `duplicate`
  reste la voie recommandée dès qu'un gabarit existe ; la voie du pixel parfait serait de
  cloner la coquille d'une section exemplaire — documentée, non faite.
- Corrigé : les positions du journal étaient mesurées avant chargement des images, donc
  fausses de milliers de pixels (le « clique pour t'y rendre » du cockpit tombait à côté).
- **[docs/brain.html](brain.html)** : carte locale du marketing brain, en langage humain —
  le chemin en 5 temps, les 3 niches, les questions d'entrée, 30 règles (ce qu'on voit → ce
  qu'on conclut → ce qu'on décide, avec priorité et niveau de preuve), les refus, les
  garde-fous, et un annuaire de 28 sources avec leurs biais. Filtre par niche + recherche ;
  chaque `i` ouvre le détail technique. C'est la préfiguration de la KB : quand elle sera un
  fichier de données validé par schéma, la page le lira au lieu de le contenir.

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
