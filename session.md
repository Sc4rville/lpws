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

## Fait le 2026-09-28 (ui)
- Interface « décider d'abord » : fourchette + jalons sur chaque résultat, trois chiffres
  d'accueil, palette ⌘K, Annuler au lieu de confirmer, une adresse par écran, panneau
  compact sur mobile, curseur de trafic qui s'applique vraiment à un test en ligne.
  Détail dans design.md (composants, navigation).

## Fait le 2026-09-28 (refonte visuelle)
- Couleurs en OKLCH + `light-dark()`, thème sombre et apparence Auto/Clair/Sombre, accueil en
  bento, View Transitions entre écrans, ressort `linear()`. Détail dans design.md.

## Fait le 2026-09-28 (business model)
- Recherche business model : `docs/business-model-rapport.md` (concurrents et prix, unité « client
  actif / mois », grille Atelier · Solo · Agence · Régime, modules reliés aux tâches, décisions `3.5`).

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

## Décidé le 2026-09-18 (Yann) — plan dans [scarville.md](scarville.md)
Trois voies de livraison, trois noms : **Express** (tag GTM, porte d'entrée, retouches),
**Intégral** (relais DNS, régime non-Shopify, tout, sans clignotement — à construire),
**Natif** (template Shopify). Parcours : clone pour convaincre → Express → Intégral/Natif.
En cours : maquette de l'interface du media buyer (rail clients, connexion dépliable,
playground, mesure), sur les données réelles du corpus.

## Fait le 2026-09-18 → 19 (kabylesystem) — journal détaillé dans [kusaila.md](kusaila.md)

- **1.1.3 comblé** : empreinte par élément, re-liage de deux captures, `apply` refuse une ancre qui a
  changé de sens. Jira : 411/471 retrouvées, **0 lien faux**.
- **Express (tag GTM) prouvé** : un script collé une fois dans GTM, la variante sur la vraie URL du
  client. HubSpot 9/9, Atlassian 9/9, monday 3/3 ; LCP ±8 ms. Sélecteurs résolus à la construction,
  budget de masque chronométré, répartition collante par gclid, `?lpws=<nom>`, `actif:false`.
- **`deploy`** : dossier publiable jugé avant publication (gclid relayé, Consent Mode v2, noindex).
- **`measure`** : GA4 Data API → `resultats.json` → verdict à l'écran, prouvé sur une réponse enregistrée.
- **Le brain** (`engine/variant`) : signaux mécaniques + 8 jugements typés (`claude -p`, crédits du
  plan) + 34 règles exécutables → diagnostic classé → une variante par cible, validée par le schéma
  d'`apply`. HubSpot : 6 tests, 1 conseil, 3 variantes en 76 s.
- **L'interface** (refonte façon a1mobile, `ui/`) : copie → « Votre campagne » → « LPWS propose 3
  tests » → « Créer ce test » → 0-100 % → arrêt. Refuser une proposition, rapport à copier/télécharger.
- **Le parcours entier prouvé en public** sur notre page de démo **Relay**
  (`ui/demo/`, https://lpws-app.vercel.app/demo/) : balise posée, diagnostic, test créé, 100 % du
  trafic → le visiteur voit la variante, `?lpws=off` voit l'original.
- **Hébergée sur la box** : https://lpws.46.225.146.226.sslip.io (mot de passe partagé, service
  `lpws-ui`, Chromium + `claude` + Vercel installés). C'est **la seule instance qui publie** sur
  `lpws-app.vercel.app` ; en local, lancer avec `LPWS_SANS_VERCEL=1`.

## Fait le 2026-09-19 (soir) — Contrôler, les cinq points (détail dans [kusaila.md](kusaila.md))
- **Corpus, un seul navigateur partout** (Chromium complet ; le headless shell est reconnu par
  Akamai ET rend le texte autrement que le juge) : HubSpot 0,05 % / 0,16 % · Jira 0,07 % / 0,17 % ·
  Salesforce 1,2 % / 0,04 % (clonable, 403 avant) · Asana 2,1 % / 0,2 % (bloquait 18 min avant) ·
  monday 4,7 % / 0,9 % (était 24 % / 30 % ; ce n'était pas un scroll-jack).
- Capture : SRI retiré des feuilles localisées · imbrications non re-parsables neutralisées ·
  shadow DOM recopié en `<template shadowrootmode>` · animations menées à terme avant la photo ·
  dimensions intrinsèques des vidéos figées · délai de 20 s par ressource.
- Re-liage : **471/471 sur Jira, 0 faux, 0 ambiguë** (départage par distance à la diagonale).
- Brain : capteurs vitesse (LCP réel), mesure (tags présents), paiement ; 3 règles de plus évaluables.
- Juge de la balise : coupe la balise déjà en ligne, teste le candidat seul.
- **Les quatre restes réglés et prouvés** : Asana (corps `google-analytics.com/batch` sans fin, garde
  chronométrée), monday **0,20 % / 0,91 %** (affiche de vidéo redessinée à la taille de la trame),
  re-liage capture ↔ page vivante Jira 471/471 et HubSpot 973/973, **ancres dans le shadow DOM**
  (Salesforce : 1 608 ancres dans l'ombre, lien de l'en-tête édité et jugé 3/3 sur le site).

## Fait le 2026-09-20 — racines fermées, iframes, login, jugement mesuré (détail dans [kusaila.md](kusaila.md))
- Page-laboratoire `ui/demo/lab/` : racine fantôme fermée (ouverte à la capture, refusée par la balise en le
  disant), iframe étranger (photographié), 0,00 %. Pages sous login : `--auth` / `--cookie`.
- **Jugement mesuré** contre 6 pages annotées à la main (`engine/variant/annotations/`) : 69 % → 73 %
  après avoir précisé trois définitions et donné le texte sans menus. `npm run brain:eval`.

## La feuille de route
[docs/feuille-de-route.md](docs/feuille-de-route.md) — l'arbre complet en quatre blocs
(contrôler · créer · distribuer · nourrir), avec l'état de chaque micro-tâche. C'est la
référence ; la liste courte ci-dessous n'en garde que le haut.

## À faire (dans l'ordre)
0. **Le media buyer relit `engine/variant/annotations/`** (48 réponses justifiées) et corrige ce qu'il
   conteste, puis `npm run brain:eval` ; puis il lit les 3 propositions Relay dans l'interface.
1. **Yann** : un vrai conteneur GTM (Express n'a jamais tourné via GTM, seulement par script direct),
   une vraie propriété GA4 pour confirmer `customUser:lpws_variante` et `keyEvents`, et trancher la
   langue de l'interface (FR aujourd'hui).
2. **Nourrir** (bloc 4) : enregistrer chaque test, savoir quand on a le droit de conclure (4.2, à
   remonter), apprendre des refus de propositions (déjà stockés).
3. Brain : mesurer le jugement contre des pages annotées (2.7), les règles en fichier de données.
4. **Intégral** (relais DNS) : spike sur une vraie page WordPress/Webflow, seulement si un client le demande.
5. **Shopify** : compte Partner + boutique de dev (Yann), puis backend `?view=`.
6. Comptes et droits sur l'interface (un mot de passe partagé aujourd'hui).

## Leçon gravée le 2026-09-18
**Un instrument de mesure qu'on ne vérifie pas ment avec autorité.** Sur les sept corrections
qu'il a fallu pour amener le tag à 9/9, **quatre étaient dans le juge**, pas dans le tag. Vérifier
le juge avant d'accuser le code.

## Blocages / parking
- `lpws.vercel.app` (le projet de Yann) sert une démo sans `t/` ni `v/` : à redéployer complet depuis `ui/dist`,
  ou basculer sur `lpws-app.vercel.app` (le projet qui publie aujourd'hui).
- Header/footer Shopify = groupes de sections du layout ; avis = blocs `@app` ; écriture de thème par app publique = exemption.
- Recherche v2 à lancer : `docs/recherche-v2-brief.md`. Corpus sans page e-commerce.
- Racine fantôme fermée : visible et éditable dans le clone, mais la balise Express ne peut pas y écrire (Intégral le pourrait).

## Fait le 2026-09-28 — socle partagé (architecture, sans changement de comportement)
- `engine/shared/` porte désormais un seul exemplaire de ce qui était copié famille par famille :
  `cli` (args), `json` (lecture validée zod, caches), `modele` (claude -p + contrat, 2 essais),
  `mime`, `http` (fichiers statiques anti-traversée), `campagne` (disposition d'une campagne sur
  disque + type `Test`), `navigateur` (shim `__name`, hors ligne, origine synthétique).
- Tout le moteur, le cockpit et `ui/server.ts` y sont branchés ; `deploy/tag/runtime.ts` (mort,
  remplacé par `loader.ts`) retiré ; `npm run typecheck` couvre aussi `ui/` ; `esbuild` déclaré.
- Vérifié identique avant/après : clone démo 0 %/0 %, variant.json, `/api/etat`, relink 68/68,
  measure --exemple, tag:check (même refus sur la démo statique).
- Reste : découper `ui/server.ts` (jobs · état · pipeline de test · tag · routes) sur ce socle.

