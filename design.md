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

## Copie

Le vocabulaire du buyer (scarville.md). Phrases courtes, une idée par ligne, pas de tiret
cadratin (`—` interdit : deux-points ou point). Un écran répond toujours à « et maintenant ? ».

## Motion

Subtile : 150 à 250 ms, `ease`. Une seule animation continue par écran au maximum (l'aurore).
`prefers-reduced-motion` coupe tout.
