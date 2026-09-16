# Session — lpws

> Journal COURT et toujours courant, mis à jour en fin de chaque session de travail.
> L'historique détaillé = `git log` (les messages de commit sont riches exprès). Pas d'accumulation ici.

## Où on en est
Famille `clone` opérationnelle à moitié : acquisition (`1_acquire`) + juge (`5_verify`) construits,
validés sur le corpus 5 LP. Cockpit de visualisation en place (`npm run viewer`, port 4600).
Aucun clone ne passe encore le seuil de 3% — causes identifiées, pas mystérieuses.

## Fait récemment (2026-09-16)
- Repo monté : conventions (docs/architecture.md), corpus (docs/corpus.md), skill /clone.
- `npm run clone` : rendu headless + marquage data-lpws + screenshots référence + juge diff visuel.
- Corpus passé : Asana 4,6% (Δh=0, le meilleur) · HubSpot 4,4% · Jira 11,9% (fonts CDN refusées) ·
  Monday 17,6% (scroll-jack/vidéo, limite dure) · Salesforce = échec franc anti-bot.
- Cockpit viewer : côte à côte synchronisé, glissière, diff, clone rendu, emplacement variantes.

## À faire (dans l'ordre)
1. `2_styles` + `3_assets` : clone self-contained (fonts/CSS/images locaux) → Asana et Jira doivent passer verts.
2. Juge v2 : diff par section ancré data-lpws (fini les cascades de décalage type HubSpot).
3. `4_structure` (page.json via skill) + famille `apply` → test round-trip pixel-identique.
4. Première variante de bout en bout, visible dans le cockpit.

## Blocages / parking
- Salesforce (anti-bot Akamai) : fallback à construire quand un vrai client en aura besoin.
- Détection scroll-jack à rapporter explicitement (drapeau dans meta.json) au lieu d'un mauvais score.
