# Session — lpws

> Journal COURT et toujours courant, mis à jour en fin de chaque session de travail.
> L'historique détaillé = `git log` (les messages de commit sont riches exprès). Pas d'accumulation ici.

## Où on en est
Famille `clone` complète hors `4_structure` : acquisition + localisation (`2_styles`/`3_assets`)
+ juge. **3 clones du corpus sont FIDÈLES** : Asana 0,0 % / 0,01 % · HubSpot 0,05 % / 0,17 % ·
Jira 0,15 % / 0,63 % (seuil 3 %). Monday = échec expliqué (scroll-jack, drapeau dans meta.json).
Salesforce = échec franc anti-bot (inchangé).

## Fait récemment (2026-09-16, soir)
- `2_styles` + `3_assets` : clones self-contained — CSS/fonts/images réécrits vers `assets/`
  (octets capturés au vol par `1_acquire`, hashés par contenu), le non-capturé absolutisé et
  compté, `<base>` retirée.
- `1_acquire` durci, à coups de diagnostics sur Jira : gel de la page avant les références
  (timers/rAF tués, vidéos pausées `play()` neutralisé), posterize des vidéos (frame gelée →
  poster du clone), attente « toutes images décodées », sérialisation des DEUX états
  (`capture.mobile.html`, mêmes ancres), re-matérialisation du CSS-in-JS (CSSOM/
  adoptedStyleSheets — le formulaire héros Jira rendait en input nu sans ça), sniff magic
  bytes (fonts servies sans extension → `.bin` illisibles).
- Juge : rendu **http local** (en `file://`, origine `null` → fonts refusées par CORS même
  locales), scroll avant preuve (lazy sous le pli), hauteur aberrante tronquée + drapeau
  scroll-jack dans santé et honnêteté (item du parking réglé).

## À faire (dans l'ordre)
1. Juge v2 : diff par section ancré `data-lpws` (les cascades sont mortes sur ce corpus,
   mais la métrique globale reste fragile au premier décalage).
2. `4_structure` (page.json via skill) + famille `apply` → round-trip pixel-identique.
3. Première variante de bout en bout, visible dans le cockpit.

## Blocages / parking
- Salesforce (anti-bot Akamai) : fallback à construire quand un vrai client en aura besoin.
- Monday/scroll-jack : détecté et rapporté proprement ; clone inexploitable sans stratégie dédiée.
- Vidéos : frame gelée en poster — les flux ne sont pas embarqués (HTTP 206/MSE).
- Des « auto: snapshot » apparaissent dans le git log (outil externe au repo ?) — écrasés
  cette fois au commit ; identifier la source si ça revient.
