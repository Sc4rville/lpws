# Session — lpws

> Journal COURT et toujours courant, mis à jour en fin de chaque session de travail.
> L'historique détaillé = `git log` (les messages de commit sont riches exprès). Pas d'accumulation ici.

## Où on en est
Deux familles vivantes. `clone` : 3 baselines du corpus FIDÈLES (Asana 0,0 %/0,01 % ·
HubSpot 0,05 %/0,17 % · Jira 0,15 %/0,63 %, seuil 3 %). `apply` : une hypothèse + des
éditions ancrées produisent une variante rendue et prouvée — testé de bout en bout sur Jira
avec 3 variantes. Le **brain** (diagnostic) n'existe pas encore : les specs sont écrites à
la main.

## Fait récemment (2026-09-16/17)
- `2_styles` + `3_assets` : clones self-contained. `1_acquire` durci (gel de page, posterize
  des vidéos, deux sérialisations desktop/mobile, CSS-in-JS re-matérialisé). Juge en http
  local (CORS des fonts en `file://`) + drapeau scroll-jack. Détail : `git log`.
- Famille `apply` : contrat zod (`spec.ts` — pas d'hypothèse/métrique/risque/diagnostic,
  pas de variante), mécanique ancrée sur les DEUX états, delta visuel vs baseline.
- 3 variantes Jira testées (contexte publicitaire inventé, à remplacer par `context.json`) :
  `offer-clarity` 0,01 % (chirurgical), `proof-fit` 0,02 % desktop / 8,4 % mobile,
  `message-match` 13,8 % desktop — **le ratio global mesure la cascade, pas le changement**
  (titre passé de 2 à 3 lignes → tout décalé de 66 px).
- Décidé après lecture du rapport de recherche : le brain = moteur de **diagnostic** (KB de
  règles avec grades de preuve), PAS une boucle d'apprentissage. Pas de base de LP scrapées
  (biais du survivant) ; en revanche un **dataset d'évaluation annoté** est nécessaire —
  sans lui, la confiance affichée est du théâtre.

## Test de liberté mécanique (2026-09-17)
`apply` a maintenant CINQ verbes : set · remove · move · duplicate · swap. Testé par une
restructuration complète de Jira (`lp-payante`, 12 éditions) : nav et footer retirés, preuve
remontée sous le héros, deux sections hors-sujet supprimées, bloc CTA dupliqué à mi-page et
retexté, deux sections échangées, CTA harmonisés. Design system conservé au pixel — on ne
génère jamais de markup, `duplicate` réutilise un bloc du client.

Ça a nécessité de corriger `mark.ts` à la racine : les 9 sections de Jira sont des `div`
anonymes, le marquage par balise ne leur donnait AUCUNE poignée. Deux niveaux d'ancres
désormais — `e<n>` contenu (par balise) et `s<n>` sections (**par géométrie**).

## À faire (dans l'ordre)
1. **Juge v2 par section** ancré `data-lpws` — nécessaire des DEUX côtés maintenant :
   fidélité du clone ET delta de variante (la cascade fausse les deux).
2. `4_structure` (page.json) — le brain est aveugle sans lui ; typage à élargir au mix
   corrigé (PDP, advertorial, quiz funnel, listicle).
3. Schémas `context.json` (offre/ICP/sales motion/source) et KB (les 80 règles de la v1
   suffisent à valider la plomberie).
4. Premier `/diagnose` jugé à l'œil, puis skill `variant` qui produit les specs.

## Blocages / parking
- **Recherche v2 à lancer** : `brief-deep-research-lws-v2.md` est prêt (mix corrigé
  ecom/SaaS self-serve). Livrable clé = KB rééquilibrée 80-120 règles ; il manque toute la
  famille e-commerce et la continuité créa→hero en paid social.
- Corpus 100 % SaaS/enterprise : ajouter PDP Shopify, advertorial, quiz funnel.
- Salesforce (anti-bot Akamai) : fallback quand un vrai client en aura besoin.
- Monday/scroll-jack : détecté et rapporté, clone inexploitable en l'état.
- **Gel trop brutal** : `freezePage` peut figer une animation en plein vol (héros Jira
  capturé mi-transition, un bloc noir en travers). Le clone est fidèle au live gelé, donc le
  juge dit vert — mais on ne livrerait pas ça à un client. Attendre la fin des animations,
  ou détecter l'état intermédiaire.
- `apply` ne peut pas créer un bloc absent de la page (`duplicate` réutilise l'existant).
  Une bibliothèque de blocs serait la réponse — ou le moment où l'on redevient un builder.
- Jev (TypeSafe, sorti le 15/09) : décisions typées calibrées, pas de vision, précision
  mid-tier. Pas adopté — mais concevoir l'extraction de signaux en questions typées
  indépendantes pour garder l'option ouverte.
