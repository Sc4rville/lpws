# design.md — l'interface du media buyer

> Source de vérité du rendu de `ui/index.html`. Le code doit coller à ce fichier ; toute
> retouche de direction se note ici d'abord.

## La direction, en une phrase

**Cocooning et net** : la même famille que a1mobile (référence choisie par kabylesystem le
2026-09-18) : fond clair légèrement flouté comme une pièce baignée de lumière, surfaces
blanches posées dessus, titres grotesques serrés et lourds, monospace pour la navigation et
les adresses, pilules noires, une illustration tramée (halftone) bichrome bleue pour les
moments d'accueil. Une seule idée décorative : la trame d'impression. Rien d'autre.

## Références

- **a1mobile** (projet précédent de kabylesystem) : hero bleu tramé, nav en mono, titres
  serrés, pilules, section « Your AI does it all » sur fond flouté, footer sombre au wordmark
  géant. On en garde : la lumière floutée, la mono en navigation, les pilules, le titre lourd
  et serré, la trame bichrome.
- **Growcode** (capture jointe) : paysage tramé vert dans un grand rectangle arrondi, titre
  en deux lignes. On en garde : l'illustration dans un cadre arrondi pleine largeur.
- **Statsig Pulse / Eppo** (2026-09-28) : un résultat se lit comme une fourchette autour de
  zéro, verte si elle est toute au-dessus, rouge si elle est toute en dessous, grise sinon ;
  et un test avance par jalons cochés plutôt que par un pourcentage abstrait. On en garde :
  la fourchette et les trois jalons.
- **Linear** (2026-09-28) : clavier d'abord (palette ⌘K), annuler plutôt que confirmer. On
  en garde : la palette et l'annulation dans le toast.

## Typographie (Google Fonts, gratuit)

| Rôle | Famille | Réglage |
|---|---|---|
| Titres et corps | **Archivo** (variable) | titres 700, `letter-spacing:-.03em`, `line-height:1.05` · corps 400, 15 px |
| Navigation, adresses, chiffres | **Red Hat Mono** | 13 px, casse normale, jamais en capitales espacées |

Bannies ici comme partout chez kabylesystem : Inter, Geist, Roboto, JetBrains Mono, IBM Plex,
Instrument Serif et toute sérif éditoriale. Aucune étiquette en petites capitales grises.

## Couleurs

| Var | Hex | Usage |
|---|---|---|
| `--bg` | `#ECECEA` | fond de page, sous le flou |
| `--paper` | `#FFFFFF` (à 80 % + flou) | panneaux, cartes principales |
| `--paper-2` | `#F5F5F3` | cartes secondaires, survols |
| `--ink` | `#111214` | texte |
| `--ink-2` | `#45474C` | texte secondaire |
| `--muted` | `#7A7C82` | méta |
| `--pill` | `#141517` | pilules primaires, état actif |
| `--blue` | `#1E6FD2` | l'unique accent : Express, focus, trame de l'illustration |
| `--ok` / `--warn` / `--bad` | `#1C9457` / `#C7791A` / `#D2413A` | états, jamais décoratifs |

Les valeurs vivent en OKLCH avec `light-dark()` : une seule variable par rôle, le clair et le
sombre côte à côte. Le sombre (2026-09-28) est une nuit bleu ardoise (`oklch(15.5% .012 265)`),
les panneaux restent du verre, la pilule s'inverse en blanc, les états s'éclaircissent pour
garder le contraste. Apparence **Auto** (celle du système) par défaut, **Clair** ou **Sombre**
au bouton du rail ou dans la palette ; le choix est gardé (`lpws-theme`).

Pas de jaune, pas de crème, pas de rose. Le dégradé n'existe que dans la lumière du fond.

## Surfaces, espace, rayons

- Fond : image floue `ui/assets/backdrop-soft.webp` fixée, plus un grain très léger.
- Panneaux : blanc à 80 % avec `backdrop-filter: blur(24px)`, ombre douce
  `0 1px 2px rgba(0,0,0,.04), 0 12px 40px -12px rgba(20,21,23,.14)`. Pas de bordure épaisse.
- Rayons : panneaux 28 px, cartes 22 px, pilules 999 px.
- Padding : 36 px dans le principal, 24 px dans une carte. Les colonnes respirent.

## Composants

- **Pilule** (`.btn`) : blanche à ombre douce ou noire (`.pri`). Survol : montée d'1 px,
  ombre qui s'étend, 200 ms. Le bouton principal (`.go`) est une pilule noire calme avec un
  reflet qui glisse au survol : plus d'anneau qui tourne en permanence.
- **Carte d'un test en ligne** (`.live`) : aurore très douce bleu + menthe, animée lentement.
- **Illustration tramée** (`ui/assets/hero-halftone.webp`) : accueil et « Nouvelle page »,
  dans un cadre arrondi pleine largeur, texte blanc par-dessus.
- **Fourchette** (`.fx`) : l'intervalle à 95 % de la hausse, un trait gris, un repère noir
  pour l'original (zéro), une bande et un point. Vert, rouge ou gris selon ce que la bande
  couvre. Une phrase dessous la dit en mots. Version `mini` dans le tableau des résultats.
- **Jalons** (`.jal`) : assez de conversions, assez de visiteurs, écart net. Trois ronds
  qui se cochent en vert : le verdict est mûr quand les trois le sont.
- **Trois chiffres d'accueil** (`.kpis`) : en ligne, conversions en plus, à décider. Sur
  l'accueil, ils forment un bento avec l'illustration (`.bento`) : colonne à droite en large,
  rangée de trois dessous quand le principal se resserre (container query).
- **Palette** (`.kx`) : ⌘K / Ctrl K ou `/`, depuis n'importe quel écran. Groupes en mono
  (l'écran courant d'abord, puis clients, tests, connexion), la ligne choisie en pilule noire.
- **Toast avec Annuler** : lancer, arrêter, déployer, remettre l'original se rattrapent
  pendant 7 s (bouton ou ⌘Z). Pas de boîte « êtes-vous sûr ? ».
- **Nom au survol du rail** (`data-tip`) : pilule noire en mono, pas d'infobulle navigateur.

## Navigation

Chaque écran a son adresse (`#/atlassian/test/message-match`, `#/hubspot/resultats`,
`#/nouvelle-page`) : précédent / suivant marchent, un lien se partage, le titre de l'onglet
dit où l'on est. Après un changement d'écran, le focus va au titre. Sur mobile, le panneau se
réduit à une rangée de pilules défilante et le rail reste collé en haut.

## Copie

Le vocabulaire du buyer ([scarville.md](../docs/journal/scarville.md)). Phrases courtes, une idée par ligne, pas de tiret
cadratin (`—` interdit : deux-points ou point). Un écran répond toujours à « et maintenant ? ».

## Motion

Subtile : 150 à 250 ms pour les survols, un ressort doux (`--spring`, `linear()`) pour ce
qui arrive. Un changement d'écran passe par une View Transition : la pilule active glisse
d'une ligne à l'autre, le contenu arrive en cascade, flou puis net. Changer de thème découvre
le nouveau en cercle depuis le bouton. Une seule animation continue par écran au maximum
(l'aurore). `prefers-reduced-motion` coupe tout.
