# Famille APPLY — une hypothèse → une variante visible et prouvée

Deuxième famille : exécuter **fidèlement** un plan d'édition sur une baseline clonée.
Le jugement (quoi changer et pourquoi) a lieu ailleurs ; ici, tout est déterministe.

```bash
npm run apply -- <dossier-baseline> <spec.json>
npm run aller-retour -- <dossier-baseline>   # zéro édition → pixel identique, sinon la mécanique fait du bruit
npm run rejouer -- <dossier-baseline> <spec.json> [--depuis <captures/date>]   # traduit les ancres d'une spec écrite sur une capture archivée
```

Le delta se lit **section par section** ([`delta.ts`](delta.ts)) : chaque section de la variante est
recalée sur la baseline, et une section changée qui ne contient aucune édition est un
**débordement**. `variant.json` porte `sections.<vue>.{changees, touchees, debordements}` et
`propre` (aucun débordement ; `null` sans baseline pour le dire).

## Contrat

| | |
|---|---|
| **Entrée** | une `baseline/` fidèle (famille `clone`) + une **VariantSpec** validée ([`spec.ts`](spec.ts)) |
| **Sortie** | `clients/<client>/<campagne>/variants/<nom>/` — `variant.html(.mobile)`, captures, `delta.png(.mobile)`, `variant.json` |

## Ce qu'une variante est, et n'est pas

Une variante n'est **pas** « une nouvelle page ». C'est **une hypothèse** et les quelques
éditions ancrées qui la testent. Le schéma zod force cette discipline : pas d'hypothèse,
pas de métrique attendue, pas de risque, pas de diagnostic d'origine → la spec est refusée.
Si une variante change cinq choses et qu'elle gagne, on n'a rien appris.

Aujourd'hui les specs sont écrites à la main (le moteur de diagnostic n'existe pas encore).
Demain c'est le skill `variant` qui les produit — et la même validation s'applique, c'est la
règle maison : toute sortie de skill passe un schéma avant d'être écrite.

## Étapes

| Fichier | Rôle |
|---|---|
| [`spec.ts`](spec.ts) | **Le contrat** : hypothèse, métrique, risque, diagnostic traçable, éditions ancrées |
| [`apply.ts`](apply.ts) | **La mécanique** : les cinq verbes, sur les DEUX états (desktop + mobile) |
| [`run.ts`](run.ts) | Orchestration : appliquer, rendre, produire le delta visuel |

## Les cinq verbes

| Verbe | Ce qu'il fait | Exemple de règle servie |
|---|---|---|
| `set` | remplace texte / href / src / placeholder | aligner le hero sur la promesse de l'annonce |
| `remove` | retire l'élément | retirer la navigation d'une LP payante |
| `move` | replace avant/après une autre ancre | remonter la preuve au-dessus du pli |
| `duplicate` | **clone** un bloc existant et le repose | ajouter un second moment de conversion |
| `swap` | échange deux blocs de place | inverser l'ordre de l'argumentaire |
| `compose` | **crée** une section absente de la page, avec les classes du client | ajouter un bloc d'objections quand la page n'en a aucun |

**`duplicate` est notre « ajouter une section ».** On ne génère jamais de markup : on
réutilise un bloc du client et on le remplit. Le design system est donc conservé au pixel
par construction, et la règle « jamais de HTML libre » tient sans exception. Les ancres de
la copie reçoivent un suffixe (`e384` → `e384-b`), donc les éditions suivantes de la même
spec peuvent viser la copie — les éditions s'appliquent dans l'ordre de la spec.

## `duplicate` ou `compose` : lequel choisir

**`duplicate` d'abord, toujours.** Il recopie un bloc du client : le rendu est identique au
pixel, par construction. C'est le bon verbe dès qu'un gabarit comparable existe quelque part
sur la page — et c'est presque toujours le cas.

**`compose` seulement quand rien n'existe.** Il fabrique la section à partir des rôles
récoltés par [`design.ts`](design.ts) : titre de section, accroche, grille, carte, bouton,
bande sombre. Chaque rôle est la chaîne de classes d'un exemplaire trouvé sur la page, donc
**aucune règle CSS n'est écrite**.

Ce que `compose` réussit, mesuré sur Jira : la typographie, l'échelle des titres, la grille
(les colonnes s'alignent au pixel sur celles du client) et les couleurs de texte.

Ce qu'il ne garantit PAS, et c'est important : les **wrappers**. Le fond d'une bande sombre,
la gouttière gauche et la largeur d'un bouton ne vivent pas dans la classe du rôle mais dans
des conteneurs intermédiaires qu'on ne sait pas deviner. Résultat observé : titre collé au
bord gauche, bande sombre restée blanche, bouton étiré sur toute la largeur. La voie vers le
pixel parfait serait de **cloner la coquille d'une section exemplaire** puis de la remplir,
au lieu de la reconstruire — non fait.

Deux niveaux d'ancres, posés à la capture ([`mark.ts`](../clone/1_acquire/mark.ts)) :
`e<n>` pour le contenu (par balise) et `s<n>` pour les bandes de haut niveau (**par
géométrie** — sur un site React moderne les sections sont des `div` anonymes, un marquage
par balise ne leur donnerait aucune poignée).

## Le delta : lire le bon signe

Le `delta.png` montre ce qui a bougé — et surtout que **rien d'autre n'a bougé**. Attention
au sens : chez le juge du clone, un ratio faible signifie *fidélité* ; ici il signifie
*chirurgie*. Une variante censée tester un libellé de bouton qui repeint 14 % de la page
n'est pas un test propre.

**Mais un ratio élevé n'est pas toujours une faute.** Un titre plus long passe de deux à
trois lignes, décale tout ce qui suit de 66 px, et le delta explose alors qu'une seule
phrase a changé (mesuré sur Jira). Le ratio global mesure la **cascade**, pas le changement.
Le delta par section ancré `data-lpws` (juge v2) réglera les deux côtés à la fois.

## Choix de conception

- **Ancre introuvable = échec franc.** Jamais d'édition silencieusement ignorée : une
  variante à moitié appliquée serait jugée comme si elle était complète.
- **Les deux états sont édités.** `capture.html` et `capture.mobile.html` partagent les
  mêmes ancres par construction (marquage avant sérialisation) — c'est exactement à ça que
  sert cette décision de `1_acquire`.
- **`textContent`, pas d'injection HTML.** Aucune balise ne peut entrer par une édition :
  la règle « jamais de réécriture libre » tient au niveau de la mécanique, pas de la
  bonne volonté du producteur de la spec.
- **Les assets restent dans `baseline/`.** Une variante ne duplique pas 5 Mo d'images pour
  un headline ; le rendu sert la variante d'abord, la baseline en repli.
- **Rendu en http local**, même raison que le juge : en `file://` l'origine est `null` et
  Chromium refuse les fonts locales par CORS.

## Limites connues

- Le delta global cascade (voir plus haut) — juge v2 par section à construire. Sur une
  restructuration, le ratio dépasse 50 % et ne veut plus rien dire : seule la preuve à
  l'œil compte.
- `compose` crée une section absente de la page, mais sans garantie sur les wrappers (fond,
  gouttière, largeur de bouton) — voir plus haut. Pour un rendu pixel-parfait, `duplicate`.
- Pas de changement de style (couleurs, espacements, typo) : on manipule la structure et le
  contenu, jamais le CSS du client.
- Rien n'est déployé : `variant.html` est un fichier local. La famille `deploy` viendra.
