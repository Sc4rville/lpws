# Famille CLONE — `url` → `baseline/` fidèle et vérifiée

Première famille de l'engine : prendre la landing page actuelle d'un client et en produire
un **clone fidèle, marqué et jugé**, sur lequel les variantes pourront s'appuyer.

```bash
npm run clone -- <url> [--client acme] [--campaign printemps] [--seuil 0.03]
npm run verify -- clients/acme/printemps/baseline        # rejuger sans recapturer
```

## Généalogie des étapes

| Étape | État | Rôle |
|---|---|---|
| [`1_acquire/`](1_acquire/) | ✅ | Rendu headless (JS exécuté, overlays démontés, scroll complet), **marquage `data-lpws`**, screenshots de référence du live, vérité réseau (`resources.json`) |
| `2_styles/` | 🔜 | CSS self-contained : feuilles rapatriées, URLs résolues, media queries intactes |
| `3_assets/` | 🔜 | Images/vidéos/fonts téléchargées, dédupliquées, réhébergées dans `assets/` ; `palette.json` |
| [`4_structure/`](4_structure/) | 🔜 | `page.json` — segmentation + typage des sections, slots ancrés. **Le schéma est déjà posé** ([`schema.ts`](4_structure/schema.ts)) : c'est le contrat de tout l'aval |
| [`5_verify/`](5_verify/) | ✅ | **Le juge** : diff visuel vs live, métriques de santé, preuves à l'œil |

[`run.ts`](run.ts) orchestre ; chaque étape reste utilisable seule.

## Ce que produit `clients/<client>/<campagne>/baseline/`

```
capture.html          DOM post-JS, marqué data-lpws, sans <script>, <base> injectée
original.png(.mobile) le site LIVE au moment de la capture — la référence du juge
clone.png(.mobile)    le clone rendu — la preuve
diff.png(.mobile)     pixels qui diffèrent
resources.json        tout ce que le live a réellement chargé (aucune devinette en aval)
verify.json           le verdict complet du juge
meta.json             source, date, stats, verdict résumé + notes d'honnêteté
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
  *réellement* chargé ; `2_styles`/`3_assets` consommeront cette liste au lieu de deviner en
  parsant le HTML.
- **Héritage LWS assumé, minimal.** Seule la logique éprouvée a été reprise (démontage
  d'overlays, métriques du juge) — pas la machinerie templatize/composer.

## Limites connues à ce stade

- Pas encore self-contained : `<base>` fait résoudre CSS/assets vers le site source → le
  clone a besoin du réseau et changera si le source change. Corrigé par `2_styles`/`3_assets`.
- Non clonable en statique (héritage des limites templatize) : héros WebGL/Three/Rive,
  expériences scroll-jackées maison. Le dire honnêtement, pas le simuler.
- Sites bot-blockés (Akamai/Cloudflare) : pas encore de fallback (Wayback chez LWS) — à
  décider quand on rencontre le premier cas réel.
