---
name: clone
description: Use to clone a client's landing page into a verified baseline — "clone <url>", "capture cette LP", "fais la baseline de <client>", "recapture la page". Drives engine/clone (headless render, data-lpws marking, visual-diff judge), verifies honestly, reports what passed and what's approximated. Not for cloning arbitrary third-party sites (LPWS clones the page of a mandated media buyer's client) and not for generating variants (future skill).
version: 0.1.0
user-invocable: true
argument-hint: "<url> [--client x] [--campaign y]"
allowed-tools:
  - Bash(npm run clone *)
  - Bash(npm run verify *)
  - Read
---

> ⚠ **Skill jeune** : préviens avant usage non surveillé. Promotion après ≥3 usages validés.

Clone la LP actuelle d'un client en **baseline fidèle, marquée `data-lpws`, jugée par diff
visuel** — le socle sur lequel les variantes s'appuieront. La mécanique est dans
[engine/clone](../../../engine/clone/readme.md) : **ne jamais re-cloner à la main ni de
mémoire** ; si l'acquisition échoue, elle échoue — le dire.

## Dérouler

```bash
npm run clone -- <url> --client <client> --campaign <campagne>
# rejuger sans recapturer (après un correctif) :
npm run verify -- clients/<client>/<campagne>/baseline
```

1. **Lancer** la commande. Elle imprime le verdict JSON (`fidele`, ratios de diff, chemins).
2. **Regarder les preuves** — obligatoire, un ratio peut mentir :
   - `Read clone.png` : le clone ressemble-t-il au site ? sections pleines, pas de zone blanche ?
   - `Read diff.png` : où sont les pixels qui diffèrent ? (du bruit d'antialiasing partout =
     ok ; un bloc massif = section cassée/manquante)
3. **Diagnostiquer si `fidele: false`** avec `verify.json` : `sante` dit pourquoi
   (`brokenImages`, `stuckHidden` = reveals figés, `clippedHeadings`, `overflowX`,
   `consoleErrors` = souvent une ressource distante qui refuse le hors-origine).
4. **Rapporter honnêtement** :
   - verdict + ratios desktop/mobile, et ce que tes yeux ont vu sur les screenshots ;
   - les notes d'honnêteté de `meta.json` (js retiré, refs distantes tant que
     `2_styles`/`3_assets` n'existent pas, tracking repéré mais non capturé) ;
   - non clonable en statique (WebGL/scroll-jack) → le dire et s'arrêter, ne pas simuler.

## Cas connus

- **Diff élevé mais clone visuellement bon** : hauteurs de page très différentes
  (`heightDelta` dans `verify.json`) — souvent un lazy-load non déclenché sur le live au
  moment du shot. Relancer le clone une fois avant de conclure.
- **Site bot-blocké** (Akamai/Cloudflare) : pas encore de fallback. Le signaler à Yann,
  c'est une étape à construire (le Wayback-fallback de LWS est la piste).
- **Page quasi vide dans `clone.png`** : préloader non démonté ou reveal global figé —
  regarder `stuckHidden`, et signaler le site : les heuristiques de
  `1_acquire/render.ts` (`dismantleOverlays`) ont un trou à combler.
