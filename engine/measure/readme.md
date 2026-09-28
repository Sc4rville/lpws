# Famille MEASURE — GA4 → le verdict à l'écran

Le maillon qui manquait : la balise dit à GA4 quelle version chaque visiteur a vue, et ici on
relit GA4 pour compter, **par version**, les sessions et les conversions. Sans cette famille le
buyer lance un test et ne sait jamais qui gagne.

```bash
npm run measure -- clients/<client>/<campagne>              # lit GA4, écrit resultats.json
npm run measure -- clients/<client>/<campagne> --exemple    # rejoue une réponse enregistrée
```

## Contrat

| | |
|---|---|
| **Entrée** | `tests.json` (la date de lancement) + `mesure.json` : `{ "propriete": "<id numérique GA4>", "compteDeService": "<chemin du JSON>" }` |
| **Sortie** | `resultats.json` : `{ luLe, depuis, source, versions: { controle: {n, c}, <nom-du-test>: {n, c} } }` |

`n` = sessions, `c` = conversions (« key events » dans GA4).

## Le droit de conclure — `stats.ts`

Un seul module, compilé aussi pour le navigateur (`ui/stats-embarque.ts`) : l'écran et le
serveur rendent le même verdict.

- **L'horizon est fixé avant de regarder** : au lancement, `planAuLancement` calcule
  l'échantillon par version (taux de conversion déclaré dans le contexte, sinon 3 % supposés ;
  hausse cherchée selon le trafic) et le fige dans `tests.json` (`plan`).
- **Pas de verdict avant l'horizon, ni avant une semaine pleine, ni sous 25 conversions** par
  version. Seule exception : un écart écrasant (|z| ≥ 3) après une semaine.
- **Inconclusif dit comme tel** (`nul`), et **« ce test ne conclura pas »** quand il faudrait
  plus de huit semaines au rythme observé.
- **Répartition faussée** (SRM, p < 0,001 dès 200 visiteurs) : le verdict est suspendu.

## Le journal des expériences — `experience.ts`

Quand un test cesse de collecter (bouton Arrêter, un autre test lancé à sa place, ou le
gagnant déployé), `experience.ts` écrit une ligne dans `experiences.json` : éditions, règle du
brain, dates, part de trafic, horizon fixé au lancement, échantillon lu dans `resultats.json`,
fourchette à 95 % de la hausse, verdict et conclusion — `gagnant`, `perdant`, `non concluant`,
`trop tôt` (arrêté avant l'horizon), `sans données` ou `répartition faussée`. Une ligne par
lancement : remettre l'original après un déploiement met la ligne à jour sans effacer
`deploye`. Les non-concluants restent : c'est ce qu'on apprendra de plus utile.

`historique` relit toutes les pages du client ; `aEviter` en tire les règles perdues ou
refusées par le buyer, que le brain ne repropose plus.

## Ce que le buyer fait, une fois par client (3 minutes)

1. **Ajouter notre compte de service en lecteur** sur la propriété GA4 du client : Admin →
   Gestion des accès à la propriété → Ajouter → l'adresse `…@….iam.gserviceaccount.com` → Lecteur.
   C'est le geste standard pour n'importe quel outil tiers ; il n'expose rien d'autre.
2. **Créer la dimension personnalisée** : Admin → Définitions personnalisées → Dimension →
   portée **Utilisateur**, nom `lpws_variante`, propriété utilisateur `lpws_variante`.
   GA4 ne remplit une dimension qu'à partir de sa création : la faire **avant** le premier test.
3. Si GA4 est installé via Google Tag Manager plutôt que via `gtag.js` : la balise pousse déjà
   `lpws_variante` dans le `dataLayer` ; il faut une variable « Couche de données » et la
   passer en propriété utilisateur de la balise GA4. Via `gtag.js`, rien à faire : le loader
   appelle `gtag('set', 'user_properties', …)` lui-même.

## Pourquoi une propriété UTILISATEUR

L'achat ou l'inscription est un autre événement, plus tard, qui ne porte pas notre paramètre.
Un paramètre d'événement ne suivrait que l'événement `lpws_variante` lui-même. Une propriété
utilisateur colle à tous les événements suivants du même visiteur : c'est ce qui permet
d'écrire « conversions par version » sans tricher.

## Limites, dites

- **Sessions, pas visiteurs** : GA4 compte des sessions ; un visiteur qui revient compte deux
  fois des deux côtés de la même façon. Le verdict reste juste, la taille d'échantillon un
  peu flatteuse.
- **Le délai GA4** : les données arrivent avec 24 à 48 h de retard sur les propriétés
  standard. « Pas encore de données » le premier jour est normal.
- **Les bloqueurs de pub** : un visiteur qui bloque Google ne compte pas, ni d'un côté ni de
  l'autre (cf. deploy/tag).
- **Aucune lecture Google Ads** pour l'instant : le coût par conversion attendra le jeton
  développeur de l'API Google Ads (des semaines).
- **Jamais éprouvé sur une vraie propriété** : le chemin complet est vérifié avec
  `--exemple`. La première propriété réelle dira si les noms de dimension et de métrique
  sont les bons (`customUser:lpws_variante`, `keyEvents`).
