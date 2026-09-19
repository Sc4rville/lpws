# Famille VARIANT — le brain : page + contexte → diagnostic → trois variantes

Troisième famille, celle qui **décide quoi tester**. Jusqu'ici la machine savait copier,
modifier, livrer et mesurer une page ; c'est le buyer qui tapait le nouveau titre. Ici, la
page est lue, l'annonce comparée, les règles évaluées, et trois variantes sortent prêtes pour
`apply`, au même contrat qu'une variante écrite à la main.

```bash
npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]
```

## Contrat

| | |
|---|---|
| **Entrée** | `baseline/` (famille clone) + `context.json` : au minimum `{ annonce: { titre, description?, motsCles? }, vente }` ([`contexte.ts`](contexte.ts)) |
| **Sortie** | `signaux.json` · `jugement.json` · `diagnostic.json` · `specs/<nom>.json` ×3 |

## Les quatre temps, et pourquoi ils sont séparés

| Fichier | Nature | Rôle |
|---|---|---|
| [`signaux.ts`](signaux.ts) | **script** | ce qu'on COMPTE sur la page rendue aux deux tailles : titre et sous-titre du hero, boutons et leur position, navigation, formulaire, preuves, prix, garantie, lisibilité |
| [`jugement.ts`](jugement.ts) | **modèle** | ce qu'on ne peut pas compter : 8 **questions typées indépendantes** (vrai/faux, choix), chacune avec une confiance, validées par schéma. Le modèle constate, il n'explique jamais |
| [`diagnostic.ts`](diagnostic.ts) | **script** | la jointure : chaque règle évaluée une fois → déclenchée, calme, ou **non évaluable** (un signal manquait, jamais une supposition). Classement calculé : impact × preuve × pertinence ÷ risque, les règles stratégiques devant |
| [`variantes.ts`](variantes.ts) | **modèle** | l'écriture, dans un cadre fermé : n'affirmer que ce que la page affirme déjà, une hypothèse par variante, une ancre existante ou rien. Sortie validée par `apply/spec.ts` |

Les deux temps « modèle » tournent sur les crédits du plan (`claude -p`), pas sur l'API.

## La base de connaissances ([`regles.ts`](regles.ts))

Les 30 règles de [docs/brain.html](../../docs/brain.html), plus 4 propres à la recherche
payante (mot-clé dans le titre, bouton visible sans défiler sur mobile, bouton générique,
trop de boutons), portées en **données exécutables**. Chaque règle :
- nomme les signaux qu'elle consomme (`quand`), et répond vrai / faux / **null** ;
- dit si elle produit un **TEST** (nos verbes savent le faire), un **CONSEIL** (à transmettre
  au client : avis, achat invité, formulaire, mesure) ou une règle de **MÉTHODE** ;
- porte trois notes (impact, preuve, risque) au lieu d'un mot.

Deux listes en sortie, jamais mélangées. C'est le choix pris avec kabylesystem le 2026-09-19 :
les conseils valent de l'argent pour le buyer (il les revend), mais on ne promet jamais un
test qu'on ne sait pas exécuter.

## Mesuré sur HubSpot (`/products/marketing`, annonce fictive « Grow Traffic & Convert More Leads »)

Signaux en 3,9 s, jugement en 33 s, diagnostic : **6 tests possibles, 1 conseil, 9 non
évaluables** (formulaire de paiement, vitesse, mesure : des signaux qu'on ne capte pas
encore). Premier constat, stratégique : *la promesse de l'annonce n'apparaît pas dans le
titre* (80/100). Deuxième : *le titre nomme une catégorie, « Marketing Software », au lieu
d'un résultat*.

## Limites, dites

- **Pas de créa** : la règle « le visuel de la pub n'a aucun rapport avec le haut de page »
  demande de voir une image. Non construite (décision v1).
- **9 règles non évaluables** faute de capteur : checkout, badges de paiement, vitesse
  (le LCP existe dans `deploy/tag/lcp.ts`, pas encore branché), consentement.
- **Le jugement n'est pas mesuré** : il n'existe pas encore de jeu de pages annotées à la main
  pour dire si les 8 réponses sont justes (feuille de route 2.7). La confiance affichée est
  celle du modèle, pas la nôtre.
- **Les règles sont des fonctions TypeScript**, pas un fichier de données pur : c'est
  lisible et testable, pas encore éditable par quelqu'un qui ne code pas.
