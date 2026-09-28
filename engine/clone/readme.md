# Famille CLONE — `url` → `baseline/` fidèle et vérifiée

Première famille de l'engine : prendre la landing page actuelle d'un client et en produire
un **clone fidèle, marqué et jugé**, sur lequel les variantes pourront s'appuyer.

```bash
npm run clone -- <url> [--client acme] [--campaign printemps] [--seuil 0.03]
npm run styles -- clients/acme/printemps/baseline        # relocaliser le CSS seul
npm run assets -- clients/acme/printemps/baseline        # relocaliser les assets seuls
npm run verify -- clients/acme/printemps/baseline        # rejuger sans recapturer
npm run corpus [-- --recapturer]                          # repasser tout le corpus, tableau de verdicts
```

## Généalogie des étapes

| Étape | État | Rôle |
|---|---|---|
| [`1_acquire/`](1_acquire/) | ✅ | Rendu headless (JS exécuté, overlays démontés, scroll complet), **marquage `data-lpws`** + **empreinte de chaque ancre** ([`fingerprint.ts`](1_acquire/fingerprint.ts) → `anchors.json`), gel de la page (timers/vidéos), screenshots de référence + octets des ressources (`assets/`), sérialisation des DEUX états (desktop + mobile), vérité réseau (`resources.json`) |
| [`2_styles/`](2_styles/) | ✅ | CSS self-contained : feuilles réécrites vers `assets/` (fonts locales comprises), `<link>`/`<style>` localisés, le non-capturé absolutisé et compté |
| [`3_assets/`](3_assets/) | ✅ | Images/vidéos locales (src, srcset, posters, styles inline), le reste absolutisé, `<base>` retirée → clone autonome |
| [`4_structure/`](4_structure/) | 🔜 | `page.json` — segmentation + typage des sections, slots ancrés. **Le schéma est déjà posé** ([`schema.ts`](4_structure/schema.ts)) : c'est le contrat de tout l'aval |
| [`5_verify/`](5_verify/) | ✅ | **Le juge** : rendu http local (origine synthétique), diff visuel vs live (page entière, puis par section recalée), métriques de santé, preuves à l'œil |

[`run.ts`](run.ts) orchestre ; chaque étape reste utilisable seule.

## L'identité des ancres — ce que le numéro ne dit pas

`e231` veut dire « le 231ᵉ élément dans l'ordre du document », pas « le titre du héros ».
Un paragraphe ajouté en haut de page et le numéro désigne autre chose : sur Jira, **293
ancres sur 471 pointaient un AUTRE contenu** après une seule insertion, sans qu'`apply` s'en
aperçoive. Faux, confiant, silencieux.

La réponse tient en trois pièces :

| Pièce | Rôle |
|---|---|
| [`1_acquire/fingerprint.ts`](1_acquire/fingerprint.ts) | relève ce que chaque élément **est** (rôle, texte, classes hors hachages de build, chemin des parents, section, rang) → `anchors.json` |
| [`1_acquire/relink.ts`](1_acquire/relink.ts) | **re-lie** deux captures : ossature des correspondances franches, puis l'ordre du document contraint le reste. Rapport honnête : retrouvées / déplacées / ambiguës / perdues |
| [`apply/spec.ts`](../apply/spec.ts) → `attendu` | le témoin d'identité dans la spec ; `apply` **refuse** l'édition si l'ancre ne désigne plus la même chose |

```bash
npm run relink -- <baseline-avant> <baseline-apres>   # rapport de re-liage
npm run relink:check -- <baseline>                    # la preuve, sur une mutation connue
```

**Mesuré** (Jira, 471 ancres, une bannière injectée en tête de page) : 411 ancres retrouvées
(87,3 %), dont 402 déplacées, **0 lien faux** contre la vérité terrain, 60 ambiguës et 0 perdue.
Les ambiguës ne sont pas devinées : elles sont refusées à l'édition. Une ancre muette (image,
carte sans texte) au milieu de jumelles reste indécidable, et c'est le bon comportement.

## Ce que produit `clients/<client>/<campagne>/baseline/`

```
capture.html          DOM post-JS à l'état desktop, marqué data-lpws, sans <script>, autonome
capture.mobile.html   le même DOM à l'état mobile (mêmes ancres) — le layout mobile réel,
                      recalculé par le vrai moteur, pas un espoir de reflow sans JS
assets/               les octets : css, fonts, images (hashés par contenu, dédupliqués)
                      + frames vidéo capturées en poster (video-<état>-<n>.png)
original.png(.mobile) le site LIVE gelé au moment de la capture — la référence du juge
clone.png(.mobile)    le clone rendu — la preuve
diff.png(.mobile)     pixels qui diffèrent
resources.json        tout ce que le live a réellement chargé (`local` → assets/)
verify.json           le verdict complet du juge, dont `sections` : chaque section recalée, son décalage, son ratio
meta.json             source, date, stats, rapports styles/assets, verdict + honnêteté
```

## Définition de « fini »

Un clone n'est fini que si :
1. `verify` passe : **diff visuel ≤ seuil** (3 % par défaut) sur desktop **et** mobile ;
2. les métriques de santé sont expliquées (un overflow présent sur l'original n'est pas un bug du clone) ;
3. *(dès que `4_structure` + `apply` existeront)* le **round-trip à vide** passe :
   `page.json` → apply → re-render → pixel-identique.

**Toujours regarder `clone.png` et `diff.png`** : un ratio peut mentir (page presque vide
→ diff faible), l'œil non.

## Choix de conception (et leurs raisons)

- **On garde la marque et les vrais assets.** Différence frontale avec templatize (LWS) qui
  tokenise tout : ici c'est la page du client d'un media buyer mandaté.
- **`data-lpws` injecté à la capture.** L'ancrage de `page.json` et du futur `apply` — jamais
  de sélecteurs CSS calculés, jamais de réécriture libre du HTML par un LLM.
- **JS retiré du clone.** Rejouer le JS d'un framework sur un DOM sérialisé casse l'hydratation.
  L'état *visuel* final survit (les styles inline posés par GSAP & co sont sérialisés avec le
  DOM). Formulaires/tracking : réinjection sélective, étape ultérieure — repérés dans
  `resources.json` pour ne rien perdre.
- **La vérité réseau plutôt que le parsing.** `resources.json` liste ce que le live a
  *réellement* chargé, octets compris ; `2_styles`/`3_assets` réécrivent des références vers
  ces octets au lieu de re-télécharger ou de deviner en parsant le HTML.
- **La page est GELÉE avant les références.** Timers JS tués, rAF annulés, vidéos pausées
  (`play()` neutralisé) : référence desktop, référence mobile et DOM sérialisé sont le même
  instant visuel. Sans ça, typewriters/carrousels bougent entre les screenshots et le juge
  compte du désync comme de l'infidélité.
- **Vidéos : la frame gelée devient le poster.** Les flux ne sont pas capturables (HTTP 206,
  MSE) ; la zone de chaque vidéo visible est screenshotée et sert de poster au clone —
  mêmes pixels des deux côtés par construction.
- **Deux sérialisations, mêmes ancres.** Les styles inline posés par le JS au desktop
  (largeurs px, transforms) rendent le DOM desktop faux à 390px : l'état mobile est
  sérialisé séparément (`capture.mobile.html`), avec les mêmes ids `data-lpws`.
- **Le juge rend en http local, pas en `file://`.** Une page `file://` a l'origine `null` :
  Chromium y refuse les fonts par CORS, même locales. Le juge sert le dossier baseline
  depuis une origine synthétique (`page.route` + `fulfill`).
- **Héritage LWS assumé, minimal.** Seule la logique éprouvée a été reprise (démontage
  d'overlays, métriques du juge) — pas la machinerie templatize/composer.

## Limites connues à ce stade

- Les flux vidéo ne sont pas embarqués (HTTP 206/MSE) : le clone montre la frame gelée en
  poster, il ne JOUE pas la vidéo. Suffisant pour le juge et les variantes visuelles.
- Ce qu'une page ne charge pas ne peut pas être local : fonts de graisses inutilisées,
  images d'autres pages référencées dans le CSS, candidats srcset d'autres viewports —
  absolutisés et comptés dans les rapports (voir `meta.json`).
- Non clonable en statique (héritage des limites templatize) : héros WebGL/Three/Rive,
  expériences scroll-jackées maison. Le dire honnêtement, pas le simuler.
- Sites bot-blockés (Akamai/Cloudflare) : pas encore de fallback (Wayback chez LWS) — à
  décider quand on rencontre le premier cas réel.
