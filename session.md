# Session — lpws

> Journal COURT et toujours courant, réécrit en fin de session (≤ 80 lignes, `npm run menage`
> le vérifie). L'historique = `git log` ; le détail des contributions = [docs/journal/](docs/journal/) ;
> l'arbre complet = [docs/feuille-de-route.md](docs/feuille-de-route.md).

## Où on en est (2026-09-29)
- **Variantes complètes en cours** : les signaux et constats du Brain reviennent dans le cockpit ;
  les pistes mènent à l'éditeur multi-éléments (texte, CTA, navigation et sections), validé par
  les ancres et les garde-fous. Le Brain peut proposer plusieurs éditions pour une hypothèse.
- **Parcours Relay vérifié en local** : capture fidèle, analyse et signaux, refus d'une
  affirmation inventée, titre + CTA + déplacement de preuve visibles dans la variante.
  La destination d'un déplacement compte dans le delta ; une variante qui change une section
  non visée ne peut plus passer prête ni être lancée. La génération rédigée nécessite
  `claude -p`, absent et non authentifié sur cette VM ; l'échec s'affiche sans simulation.
- **Le clone est l'ATELIER, pas la page livrée** : il sert à voir, diagnostiquer, construire et
  montrer une variante sans aucun accès. La livraison passe par trois voies : **Express** (tag GTM,
  prouvé : HubSpot 9/9, Atlassian 9/9, monday 3/3), **Intégral** (relais DNS, à construire),
  **Natif** (template Shopify, contrat prêt dans [engine/deploy/readme.md](engine/deploy/readme.md)).
- **Corpus fidèle** : HubSpot, Jira, Salesforce, Asana, monday tous sous 2,1 % desktop / 0,9 % mobile ([docs/corpus.md](docs/corpus.md)).
- **Brain** (`engine/variant`) : signaux + jugements typés + 41 règles dans `regles.json` validé par schéma (dont 7 page produit/essai) → diagnostic → 3 variantes
  passées aux garde-fous (chiffre inventé, superlatif, « ! » : refus dans `variantes-refusees.json`).
  Jugement mesuré à 73 % contre 6 pages annotées (`npm run brain:eval`).
  Décliner : chaque proposition donne à la demande 3 autres versions du même test (bouton « Décliner », `--decliner`).
  « Pas celui-là » prend un motif ; les refus du client sont relus à chaque écriture (textes refusés interdits).
- **Mesure** : GA4 par fenêtre de test, un seul moteur stats (`engine/measure/stats.ts`, embarqué
  aussi dans l'UI), journal des expériences, « Peut-on conclure ? ».
- **Modules business** : audit tracking, surveillance, compte/paliers/mandats, rapport client, coûts.
  Paliers seulement avec `LPWS_FACTURATION=1`, surveillance auto avec `LPWS_SURVEILLANCE=1`.
- **Interface** (`ui/`, direction dans [ui/design.md](ui/design.md)) : parcours complet prouvé sur la
  démo Relay (https://lpws-app.vercel.app/demo/).
  Aucune « certitude » affichée : un test en ligne montre hausse, fourchette et ce qui reste avant
  l'horizon ; le calculateur passe par `STATS.planifier` comme le lancement.
- **Instances** : la box (https://lpws.46.225.146.226.sslip.io, service `lpws-ui`) est **la seule
  qui publie** sur `lpws-app.vercel.app` ; en local, `LPWS_SANS_VERCEL=1`.
- **Repo rangé le 2026-09-28** : racine = readme · CLAUDE · session ; docs en `recherche/` et
  `journal/` ; `npm run menage` (racine, noms, liens, code mort) tourne en CI.
- **Vérif locale** : GitHub Actions est bloqué (facturation du compte) ; `npm run verif` rejoue
  la CI en local (typecheck · menage · tests · interface · 2 clones de démo fidèles, hors `clients/`).

## À faire (dans l'ordre)
0. **Le media buyer relit `engine/variant/annotations/`** (48 réponses justifiées), corrige, puis
   `npm run brain:eval` ; puis il lit les 3 propositions Relay dans l'interface.
1. **Yann** : un vrai conteneur GTM (Express n'a jamais tourné via GTM, seulement par script direct),
   une vraie propriété GA4 (`customUser:lpws_variante`, `sessionKeyEventRate`), trancher la langue
   de l'interface (FR aujourd'hui).
2. **Nourrir** (bloc 4) : refus appris par client (motif + textes) ; reste l'apprentissage entre clients (4.4).
3. Brain : verser les règles de la recherche v2 dans `regles.json` (brief prêt, famille e-commerce) ; continuité créa : l'accroche est comparée, le visuel pas encore.
4. **Intégral** : spike sur une vraie page WordPress/Webflow, seulement si un client le demande.
5. **Shopify** : compte Partner + boutique de dev (Yann), puis backend `?view=`.
6. Comptes et droits sur l'interface (un mot de passe partagé aujourd'hui).

## Blocages / parking
- Non branché faute d'accès : Stripe (`STRIPE_*`), annonces Google Ads/AI Max, Shopify, Intégral.
- `lpws.vercel.app` (projet de Yann) sert une démo sans `t/` ni `v/` : redéployer depuis `ui/dist`
  ou basculer sur `lpws-app.vercel.app`.
- Recherche v2 à lancer : [docs/recherche/v2-brief.md](docs/recherche/v2-brief.md). Corpus sans page e-commerce.
- Racine fantôme fermée : éditable dans le clone, pas par la balise Express (Intégral le pourrait).
