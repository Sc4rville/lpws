# kusaila.md — ce que kabylesystem a ajouté au projet

> Journal de MES contributions à LPWS, pour savoir d'un coup d'œil ce qui vient de moi.
> Le reste du dépôt (vision, machine, feuille de route) est documenté ailleurs :
> [readme](readme.md) · [feuille de route](docs/feuille-de-route.md) · [session](session.md).
> Une entrée = une date, ce qui a été fait, **pourquoi**, et **comment le vérifier soi-même**.

---

## 2026-09-18 · L'identité des ancres (`48f7c32`)

**Le problème.** Une ancre `data-lpws` était un RANG, pas un nom : `e231` voulait dire
« le 231ᵉ élément dans l'ordre du document », pas « le titre du héros ». Le client ajoute une
bannière, tout se décale d'un cran, et une variante écrite la veille écrit dans le mauvais
élément — sans erreur, sans bruit. Mesuré sur Jira : **293 ancres sur 471 désignaient un
autre contenu** après une seule insertion.

**Ce que j'ai ajouté.**

| Fichier | Rôle |
|---|---|
| [`engine/clone/1_acquire/fingerprint.ts`](engine/clone/1_acquire/fingerprint.ts) | relève à la capture ce que chaque élément EST : rôle stable (un h2 devenu h3 reste un titre), texte normalisé, classes débarrassées des hachages de build, chemin des parents, section, rang → `anchors.json` |
| [`engine/clone/1_acquire/relink.ts`](engine/clone/1_acquire/relink.ts) | re-lie deux captures. Les correspondances franches forment une ossature filtrée par sa plus longue sous-suite croissante (l'ordre du document ne s'inverse pas), puis cet ordre contraint le voisinage |
| [`engine/clone/1_acquire/relink-check.ts`](engine/clone/1_acquire/relink-check.ts) | la preuve rejouable : rejoue la mutation exacte sur une vraie baseline et juge contre la vérité terrain |
| `engine/apply/spec.ts` → `attendu` | le témoin d'identité de la cible dans la spec |
| `engine/apply/apply.ts` | **refuse en échec franc** si l'ancre ne désigne plus la même chose |

**La mesure.**

| Page | Ancres | Retrouvées | Déplacées | **Faux** | Ambiguës | Perdues |
|---|---|---|---|---|---|---|
| Jira | 471 | 411 (87,3 %) | 402 | **0** | 60 | 0 |
| HubSpot | 973 | 973 (100 %) | 956 | **0** | 0 | 0 |

Les ambiguës ne sont pas devinées : elles sont **refusées à l'édition**. Une image sans texte
au milieu de ses jumelles reste indécidable, et c'est le bon comportement.

**Vérifier soi-même.**
```bash
npm run relink:check -- clients/corpus/jira/baseline    # la preuve, mutation connue
npm run relink -- <baseline-avant> <baseline-apres>     # rapport de re-liage réel
```

**Non-régression** : corpus repassé, Jira fidèle (0,08 % / 0,44 %), HubSpot fidèle (0,05 % / 0,17 %).

---

## 2026-09-18 · La famille `deploy` (`8195fe7`)

**Le problème.** La machine savait produire une variante irréprochable que personne ne
pouvait mettre en ligne. J'ai ouvert la famille 4 **par son bout utile** : pas l'hébergement,
la **mesure**. Le media buyer envoie du trafic PAYANT vers cette URL ; s'il perd
l'attribution, il perd son reporting client, et ça ne se rattrape pas rétroactivement.

**Ce que j'ai ajouté** ([`engine/deploy/`](engine/deploy/readme.md)) :

| Fichier | Rôle |
|---|---|
| `config.ts` | le contrat de livraison : canonical, CTA vers le vrai tunnel, pixels, Consent Mode |
| `prepare.ts` | le seul endroit où l'on remet du JavaScript, et seulement le nôtre : relais des identifiants de clic, pixels, `noindex` + `canonical`, CTA recâblés |
| `check.ts` | **le juge**, qui tourne AVANT la mise en ligne |
| `run.ts` | orchestration + CLI |

**Ce que le juge refuse** : un CTA qui perd l'identifiant de clic · un `noindex` ou un
`canonical` absent · un Consent Mode attendu mais jamais poussé · un pixel configuré que la
page ne demande jamais. Échec = dossier produit mais **marqué non publiable**.

**Pourquoi ces choix.**
- `gclid`, `gbraid`, `wbraid`, `msclkid`, `fbclid`, `utm_*` relayés **vers les domaines du
  client uniquement** : on ne colle pas l'identifiant de clic du buyer sur un lien tiers.
- Consent Mode v2 en refus par défaut, **avant** les pixels : en Europe, charger sans
  consentement est illégal *et* Google jette les hits de toute façon.
- `noindex` systématique : une variante ne doit jamais concurrencer en référencement la page
  qu'elle teste.
- Les CTA pointent vers le **vrai tunnel** du client : le clone n'a pas de formulaire vivant,
  donc pas de formulaire simulé qui perdrait des leads en silence.

**Vérifier soi-même.**
```bash
npm run deploy -- <dossier-variante> <config.json>
```
Vérifié de bout en bout sur une variante HubSpot : 2/2 CTA recâblés, 2/2 portent le clic,
`noindex` et consent présents. Et le garde-fou du commit précédent a été éprouvé pour de vrai :
un témoin `attendu` faux fait sortir `apply` en échec franc en nommant l'attendu et le trouvé.

**Limites assumées, écrites dans le readme** : rien n'est encore hébergé · le juge vérifie que
la page DEMANDE ses pixels, pas qu'un compte réponde · les pixels remis sont ceux de la
config, pas ceux détectés sur la page d'origine.

---

## 2026-09-18 · La voie tag (GTM) — livrer sans DNS ni hébergement

**Le problème.** La voie hébergée oblige le media buyer à aller chercher un enregistrement DNS
chez son client. Inacceptable comme entrée : on ne répond pas « configure un CNAME » à
quelqu'un qu'on veut convaincre. Le tag s'applique sur **la vraie page, à la vraie URL**, et le
buyer le pose depuis un Google Tag Manager auquel il a déjà accès.

**Ce que j'ai ajouté** ([`engine/deploy/tag/`](engine/deploy/tag/readme.md)) : `selector.ts`
(résolution à la construction), `loader.ts` (le script collé une fois), `build.ts` (loader +
config servie), `check.ts` (le juge, sur le site LIVE), `lcp.ts` (le verdict de vitesse).

**Le résultat, mesuré sur 18 chargements par site.**

| | HubSpot | Jira |
|---|---|---|
| fiabilité | **9/9** | **9/9** |
| config envoyée au visiteur | 0,4 Ko | 0,7 Ko |
| écart de LCP avec/sans | −8 ms | +8 ms |

**Les deux décisions qui ont tout débloqué.**
1. **Le rapprochement déménage à la construction.** La première version envoyait 97 à 188 Ko
   d'empreintes au visiteur, qui refaisait tout le calcul (~700 ms par essai). Maintenant on
   ouvre la vraie page une fois, on résout, on en tire un sélecteur CSS court, et le visiteur
   ne reçoit que lui. Charge utile divisée par ~250.
2. **Le budget de masque est chronométré, pas constant.** Sur un site rendu en JavaScript la
   cible n'existe pas quand le visiteur arrive : masquer en l'attendant ne retarde rien, la
   page n'avait rien à montrer. La marge est proportionnelle (×1,8) pour absorber la variance
   du site, et c'est elle qui fait passer de 8/9 à 9/9.

**Ce que j'ai appris en me trompant, et c'est le plus utile** : sur les sept corrections, quatre
étaient dans **mon juge**, pas dans le tag. Il lisait à 3 000 ms alors que le tag a jusqu'à
4 825 ms pour poser · il tronquait les textes à 80 caractères · il jugeait sur un tir unique
alors qu'un site vivant n'est pas déterministe · et il comparait deux mesures bruitées pour en
tirer un verdict de vitesse. J'ai annoncé « valide », puis « refusé », puis « valide » sur la
même page. **Un instrument de mesure qu'on ne vérifie pas ment avec autorité.**

**Vérifier soi-même.**
```bash
npm run tag -- <baseline> <spec.json>        # loader + config
npm run tag:check -- <baseline> <spec.json>  # le juge, sur le site LIVE, 3 chargements
npm run lcp -- <baseline> <spec.json>        # LCP avec et sans le tag
```

**Limite assumée** : sous CSP stricte, la config distante n'arrive pas. Le tag fonctionne (mode
figé) mais le pilotage à distance et le bouton stop demandent de recoller le loader.

---

## 2026-09-18 (nuit) · Le parcours du buyer, rejoué pour de vrai

**La méthode.** Le serveur de Yann (`npm run ui:serve`) piloté par l'API avec `curl`, et
l'interface parcourue dans un Chromium sans fenêtre (Playwright) : coller l'URL, créer un test,
lancer, arrêter, vérifier, écran par écran, avec capture et lecture des erreurs de console.
Aucun défaut ci-dessous n'était visible sans faire le parcours pour de vrai.

**Ce qui marche** : la création d'un test sur HubSpot de bout en bout en 44 s (variante,
cible retrouvée sur la vraie page, balise et config produites), l'arrêt, la vérification de
la balise sur la vraie page, et une interface propre à 1440 px comme à 390 px, sans erreur de
console une fois corrigée. Le guide Express est clair.

**Six défauts corrigés** (`dcb535a`) :

| # | Défaut | Pourquoi ça compte pour le buyer |
|---|---|---|
| 1 | La page d'un client **plantait** dès qu'un test était en ligne (`verdict()` lisait des résultats Google Ads qu'un test réel n'a pas) | il ne pouvait plus ouvrir son client |
| 2 | On pouvait **lancer un test sans balise** sur la page : « En ligne · 50 % », personne ne voyait la variante | il croyait tester |
| 3 | Un client, plusieurs pages : publier la config d'une page **écrasait** les variantes de l'autre ; et une config construite par un outil sans test derrière était servie (une variante Jira partait à 100 %) | test perdu en silence |
| 4 | `ui/dist` sert la démo ET la balise : déployer l'un **efface** l'autre en ligne. `lpws.vercel.app/t/corpus.js` répond **404** aujourd'hui | il collerait une balise morte, sans message |
| 5 | Le tableau de bord disait « Copie à relancer » sur une copie à 99,9 % dès qu'aucun test n'était prêt | il relance une copie pour rien |
| 6 | Deux promesses que la machine ne tient pas : « on la refait avec un réglage adapté », et une ligne DNS Intégral vers `edge.lpws.io` qui ne répond pas | il transmet au client une instruction morte |

**Et un septième, trouvé en élargissant le corpus** : `monday.com/work-management` répond
**301 vers `monday.com/`**. La capture enregistrait l'adresse tapée, le loader comparait
l'adresse où le visiteur atterrit, concluait « pas cette page » et servait l'original à tout
le monde : 0 chargement sur 3, cible pourtant résolue à 100 %. **L'adresse qui compte est
celle où la page atterrit** : la capture et la balise enregistrent désormais celle-là, et
l'adresse demandée est gardée à part. Résultat sur monday.com : **3/3, aperçu compris**
(`0b8f5b3`). Trois sites de référence pour Express : HubSpot 9/9, Jira 9/9, monday 3/3.

**Et la sonde qui vaut plus que le correctif** : cette redirection **perd les paramètres
d'URL**. Pour le client, un clic Google Ads vers l'adresse tapée perd son `gclid` en route,
donc son attribution, avant même le test. La construction le détecte et le dit au buyer :
« mettez l'adresse d'arrivée en URL finale de vos annonces ». Un diagnostic gratuit qui
rend service dès le premier jour.

**Ce que le serveur fait maintenant qu'il ne faisait pas** : il sonde la vraie page au moment
de lancer et refuse (409) si la balise ne répond pas · il fusionne les configs de toutes les
pages d'un client, `tests.json` faisant seul foi · il vérifie une fois par minute que la
balise publiée répond, sinon l'interface dit « Balise pas encore publiée » · il reconstruit
la démo avant de pousser si elle manque dans `ui/dist`.

**Vérifier soi-même.**
```bash
LPWS_SANS_VERCEL=1 npm run ui:serve      # sur un poste sans le projet Vercel lié
curl -X POST localhost:4700/api/clients/corpus/hubspot/tests/<id> -d '{"etat":"live"}'   # → 409 sans balise
```

**Pour Yann, à faire de son poste** : redéployer `ui/dist` complet (démo + `t/` + `v/`) pour
que `lpws.vercel.app/t/<client>.js` réponde ; puis le vrai test qui manque à tout le monde,
**coller la balise dans un conteneur GTM réel** et vérifier depuis l'interface.

---

## 2026-09-18 (nuit) · La refonte visuelle de l'interface, façon a1mobile

**La demande.** kabylesystem veut pour les media buyers le même monde que son application
a1mobile : clair, cocooning, net. La direction est figée dans [`design.md`](design.md).

**Ce qui a changé, sans toucher à la logique de Yann** (les gabarits et l'API sont intacts,
seule la couche visuelle et quelques textes bougent) :
- **Typographie** : Archivo (titres serrés et lourds, corps) + Red Hat Mono (navigation,
  adresses, chiffres). Fini les petites capitales grises espacées, partout.
- **Lumière** : un fond photographique flouté (`ui/assets/backdrop-soft.webp`, 4 Ko), un
  grain d'impression très léger, des panneaux en verre blanc à 80 %.
- **L'illustration tramée** (`ui/assets/hero-halftone.webp`, GPT-Image, recolorée en
  bichromie bleu/blanc cassé : le papier crème d'origine est banni chez kabylesystem) : deux
  chemins qui se séparent, un drapeau. Sur l'accueil et sur « Nouvelle page », dans un cadre
  arrondi pleine largeur, texte blanc par-dessus.
- **Pilules** blanches à ombre douce ou noires ; le bouton principal ne tourne plus en
  permanence, il a un reflet au survol. Tout ce qui se clique réagit au survol.
- **Copie** : plus un seul tiret cadratin (41 dans l'interface, 12 dans le serveur, tous
  remplacés), deux paragraphes raccourcis.

**Vérifié** : six écrans, en 1440 px et en 390 px, zéro erreur de console, zéro débordement
horizontal. Les captures ont servi à corriger trois choses avant de livrer : le texte du hero
tombait sur le ciel clair (dégradé ajouté à gauche), les lignes clients se cassaient sur
mobile, le curseur de trafic débordait.

**À trancher avec Yann, pas décidé ici** : la langue de l'interface. Tout est en français
(le vocabulaire du buyer, écrit par Yann) alors que la cible du 2 novembre est YC et que la
règle de kabylesystem est « interface en anglais ». C'est un choix produit, pas un détail.

---

## 2026-09-19 · Le brain (étape « Créer ») et la lecture des résultats (étape « Mesurer »)

**Les deux trous qui restaient** : la machine savait copier, modifier et livrer une page, mais
c'est le buyer qui décidait quoi tester en tapant lui-même le nouveau titre, et personne ne
relisait jamais si la variante gagnait.

### `engine/measure` : GA4 → conversions par version → le verdict (`5908b14`)
La balise pose la version vue en **propriété utilisateur** GA4 (`lpws_variante`) ; `npm run
measure` interroge l'API GA4 Data avec un compte de service (JWT signé, pas de bibliothèque
Google), écrit `resultats.json` par campagne, et l'écran du test affiche le verdict dans les
mots du buyer (« avantage variante +35 %, certitude 84 %, encore ~8 jours »). Prouvé sur une
réponse GA4 enregistrée ; **jamais sur une vraie propriété**.

### `engine/variant` : le brain (`c517955`)
Trois décisions prises avec kabylesystem : diagnostiquer **et** proposer trois variantes (pas
d'analyse d'image en v1) · demander les neuf questions du brain mais deux seulement
obligatoires (ce que promet l'annonce, comment se conclut la vente) · séparer sans jamais les
mélanger les **tests** qu'on sait exécuter des **conseils** à transmettre au client · une
variante par cible (titre, bouton, structure).

| Temps | Nature | Ce que ça fait |
|---|---|---|
| `signaux.ts` | script | compte sur la page rendue aux deux tailles : hero, boutons et pli, nav, formulaire, preuves, prix, garantie |
| `jugement.ts` | modèle, sur le plan | 8 questions typées indépendantes, validées par schéma, jamais d'explication demandée |
| `regles.ts` | données | les 30 règles de `brain.html` + 4 de recherche payante, exécutables : vrai / faux / **non évaluable** |
| `diagnostic.ts` | script | jointure et classement (impact × preuve × pertinence ÷ risque, stratégiques devant) |
| `variantes.ts` | modèle, sur le plan | écrit dans un cadre fermé, sortie au contrat de `apply/spec.ts` |

**Mesuré sur HubSpot** (annonce fictive « Grow Traffic & Convert More Leads ») : signaux 3,9 s,
jugement 33 s, **6 tests possibles, 1 conseil, 9 non évaluables**, 3 variantes en 76 s, toutes
valides et appliquées. Premier constat : la promesse de l'annonce n'est pas dans le titre.

**Dans l'interface** : après la copie, l'écran « Votre campagne » (2 champs obligatoires, le
reste optionnel) lance l'analyse ; le tableau de bord montre « LPWS propose 3 tests » avec
la raison et la source, « Créer ce test » enchaîne sur le pipeline existant ; et « À
transmettre au client » avec « Copier le rapport ».

**Ma critique des 30 règles, gardée** : bonnes comme texte (chaque règle porte son
contre-exemple), inutilisables telles quelles par une machine (prose, pas de signal typé),
12 sur 30 seulement testables avec nos verbes, 20 qui exigent des entrées jamais demandées,
priorité déclarée et pas calculée, biais B2B. Tout ça est ce que `regles.ts` corrige.

**Limites** : pas de créa, 9 règles sans capteur, un jugement jamais mesuré contre des pages
annotées à la main (feuille de route 2.7), des règles en TypeScript et pas en fichier de
données pur.

---

## Ce que j'ai signalé sans le coder

- **Le calcul de l'échantillon est en bloc 4** (4.2) alors que c'est lui qui dit si un client
  peut conclure un test, donc si le produit se vend. Devrait remonter.
- **Le split de trafic propre** n'est nulle part en 3.1 : deux Final URLs sur deux annonces
  donne un test biaisé, Google réoptimisant la diffusion. Il faut une seule Final URL et une
  répartition à l'edge, collante par `gclid`.
- **Un clone publié sur une URL publique** engage la marque du site cloné : la section
  juridique (3.6) l'interdit hors client mandaté. Je n'ai donc jamais publié le clone HubSpot,
  tout a été jugé hors ligne.
