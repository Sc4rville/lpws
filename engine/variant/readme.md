# Famille VARIANT — le brain : page + contexte → diagnostic → trois variantes

Troisième famille, celle qui **décide quoi tester**. Jusqu'ici la machine savait copier,
modifier, livrer et mesurer une page ; c'est le buyer qui tapait le nouveau titre. Ici, la
page est lue, l'annonce comparée, les règles évaluées, et trois variantes sortent prêtes pour
`apply`, au même contrat qu'une variante écrite à la main.

```bash
npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]
npm run brain -- clients/<client>/<campagne> --decliner <proposition> [--consigne "plus court"] [--n 3]
```

**Décliner** : une proposition → jusqu'à trois autres versions du même constat, avec la consigne
du buyer s'il en donne une. Le modèle voit tout ce qui a déjà été écrit pour ce constat ; un texte
déjà proposé est refusé comme les autres écarts aux garde-fous. Les déclinaisons s'ajoutent aux
propositions juste après leur source (`declineDe`, `consigne`), sans écraser aucune spec ; dans
l'interface, c'est le bouton « Décliner » de chaque proposition.

## Contrat

| | |
|---|---|
| **Entrée** | `baseline/` (famille clone) + `context.json` : au minimum `{ annonce: { titre, description?, motsCles? }, vente }` ; en paid social, `trafic` et `crea: { accroche, visuel? }` : l'accroche de la créa est ce que le visiteur cherche en arrivant ([`contexte.ts`](contexte.ts)) |
| **Sortie** | `signaux.json` · `jugement.json` · `diagnostic.json` · `propositions.json` · `specs/<nom>.json` ×3 |

### Ce que l'interface peut lire

**Un constat cite la page** ([`citation.ts`](citation.ts)). `signal` est écrit à partir des
signaux, avec le texte exact et l'ancre data-lpws des éléments en cause : « Le bouton « Submit »
(e67, à 2951 px) ne dit pas ce que le visiteur obtient en cliquant. » La phrase générale de la
règle (« Un bouton dit Envoyer, En savoir plus… ») reste dans `principe`, jamais présentée comme
ce qu'on a vu. Une règle sans citation arrête le chargement.

| Champ | Où | Sens |
|---|---|---|
| `signal` | constat, proposition | ce qu'on a vu sur CETTE page, texte exact + ancre |
| `principe` | constat, proposition | la règle en général (`regles.json`) |
| `elements[]` | constat, proposition | `{ role, texte, anchor? }` : titre, sous-titre, bouton, champ, section… cités |
| `rang` | constat | 1 = le premier à regarder dans sa liste (tests, conseils, méthode) : stratégiques devant, puis score décroissant. Le `score` n'est qu'un ingrédient, ne pas l'afficher comme priorité |
| `rang` | proposition | l'ordre de lecture des propositions de l'analyse (1 = la première) |
| `rangPiste` / `pistes` | proposition | le rang de sa piste parmi les tests du diagnostic, sur combien |
| `changements`, `ancres[]`, `multiElements` | proposition | nombre d'éditions, ancres distinctes touchées ; multi = au moins deux ancres |
| `retenue` | proposition | pourquoi cette piste (« meilleure piste de titre, multi-éléments ») |
| `horsNiche[]` | diagnostic | règles déclenchées hors des niches qu'elles déclarent (une règle d'achat sur un SaaS) : ni test ni conseil |
| `ecriture` | diagnostic | `{ objectif, produites, pistes, tentees, appels, multiElements, manque? }` : `manque` dit en clair pourquoi il y a moins de trois propositions |

## Les quatre temps, et pourquoi ils sont séparés

| Fichier | Nature | Rôle |
|---|---|---|
| [`signaux.ts`](signaux.ts) | **script** | ce qu'on COMPTE sur la page rendue aux deux tailles : titre et sous-titre du hero, boutons et leur position, navigation, formulaire, preuves, prix, garantie, lisibilité |
| [`jugement.ts`](jugement.ts) | **modèle** | ce qu'on ne peut pas compter : 8 **questions typées indépendantes** (vrai/faux, choix), chacune avec une confiance, validées par schéma. Le modèle constate, il n'explique jamais |
| [`diagnostic.ts`](diagnostic.ts) | **script** | la jointure : chaque règle évaluée une fois → déclenchée, calme, ou **non évaluable** (un signal manquait, jamais une supposition). Une règle hors de ses niches n'est jamais un constat (`horsNiche`). Classement calculé : impact × preuve ÷ risque, les règles stratégiques devant, numéroté (`rang`) |
| [`variantes.ts`](variantes.ts) | **modèle** | l'écriture, dans un cadre fermé : n'affirmer que ce que la page affirme déjà, une hypothèse par variante, une ancre existante ou rien. Sortie validée par `apply/spec.ts`. **Trois propositions** : ce qui tombe aux garde-fous est redemandé (3 appels au plus : pistes pas encore tentées, puis autre version des pistes retenues) ; **au moins une multi-éléments** (titre + bouton principal + bouton du formulaire sur la même promesse, jusqu'à 6 éditions), demandée à la mieux classée des pistes de texte et, si aucune ne passe, redemandée une fois à part. Moins de trois : `ecriture.manque` dit pourquoi |
| [`garde.ts`](garde.ts) | script | les garde-fous d'écriture, vérifiés et non demandés : chiffre absent de la page et de l'annonce, superlatif, « ! », texte inchangé, libellé de bouton trop long, verbe ou ancre hors de la règle. Refus gardés dans `variantes-refusees.json` |

Les deux temps « modèle » tournent sur les crédits du plan (`claude -p`), pas sur l'API.

## La base de connaissances ([`regles.json`](regles.json) + [`regles.ts`](regles.ts))

Les 30 règles de [docs/brain.html](../../docs/brain.html), plus 4 propres à la recherche
payante (mot-clé dans le titre, bouton visible sans défiler sur mobile, bouton générique,
trop de boutons), et 7 pour la page produit et l'essai (livraison, retours, paiement
fractionné, guide des tailles, prix barré sans référence 30 jours, bouton d'achat sous le pli
mobile, « sans carte » caché). Tout ce qui se lit (prose, notes, sources, consigne de test)
est dans `regles.json`, vérifié au chargement par un schéma : ajouter ou corriger une règle ne
touche pas au code, sauf son déclencheur (`QUAND` dans `regles.ts`, un par id). Une faute dans
le fichier (note hors bornes, verbe inconnu, test sans consigne, id en double ou sans
déclencheur) arrête le brain en nommant la règle ; chaque source citée doit être décrite dans
`docs/brain.html`. Une règle d'achat sur une
page sans bouton d'achat est **calme**, pas non évaluable : elle ne concerne pas la page.
Les règles sont testées sur des signaux construits à la main (`regles.test.ts`) ; la page
produit de démonstration est `ui/demo/boutique/`. Chaque règle :
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
