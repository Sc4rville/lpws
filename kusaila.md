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

## Ce que j'ai signalé sans le coder

- **Le calcul de l'échantillon est en bloc 4** (4.2) alors que c'est lui qui dit si un client
  peut conclure un test, donc si le produit se vend. Devrait remonter.
- **Le split de trafic propre** n'est nulle part en 3.1 : deux Final URLs sur deux annonces
  donne un test biaisé, Google réoptimisant la diffusion. Il faut une seule Final URL et une
  répartition à l'edge, collante par `gclid`.
- **Un clone publié sur une URL publique** engage la marque du site cloné : la section
  juridique (3.6) l'interdit hors client mandaté. Je n'ai donc jamais publié le clone HubSpot,
  tout a été jugé hors ligne.
