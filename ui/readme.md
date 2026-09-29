# ui — l'interface du media buyer

Ce que voit le media buyer : ses clients, la page, les tests, les résultats, et la connexion
(Express · Intégral · Natif). Le vocabulaire est le sien, pas celui de la machine
([scarville.md](../docs/journal/scarville.md)).

```bash
npm run ui:serve     # la v1 branchée sur la machine → http://localhost:4700
npm run ui           # la démo statique : ui/index.html + captures de clients/ → ui/dist/index.html
npm run ui:deploy    # démo statique en ligne sur Vercel (projet lpws)
```

## La v1 (`server.ts`) — ce qui marche aujourd'hui

Un serveur local sans dépendance qui sert `index.html` et pilote les familles existantes en
sous-processus (clone, apply, tag). Le parcours complet, tel que le buyer le vit :

1. **« + » → Nouvelle page** : coller l'URL → capture (`clone`) suivie ligne à ligne.
2. **Tableau de bord** : « Prête pour un premier test », balise à installer.
3. **Express** : la vraie balise `https://lpws.vercel.app/t/<client>.js` à coller dans GTM,
   la demande d'accès à copier pour le client, « Vérifier l'installation » qui ouvre la vraie
   page et cherche la balise.
4. **Nouveau test** : les textes de la page (titre d'abord, puis accroches, boutons) → nouveau
   texte → « Créer le test » : variante (`apply`) → cible retrouvée sur la vraie page (`tag`)
   → balise et config publiées sur Vercel. Une à deux minutes, suivies à l'écran.
5. **Page du test** : original et variante côte à côte, lien d'aperçu `?lpws=<test>`, trafic,
   **Lancer** / **Arrêter** → la config `v/<client>.json` est republiée (part 50 → 0), ~15 s.

Vérifié le 18 sept. sur hubspot.com/products/marketing, par l'API et à l'écran.

Sans serveur (le fichier ouvert tel quel, ou la démo Vercel), l'interface retombe sur les
données de démonstration.

| Route | |
|---|---|
| `GET /api/etat` | clients, captures, tests, connexion — lu dans `clients/` |
| `POST /api/clients` `{url}` | capture (job) |
| `GET /api/jobs/<id>` | suivre un job |
| `GET /api/clients/<c>/<camp>/textes` | les textes changeables (cache `baseline/textes-v2.json`) |
| `POST /api/clients/<c>/<camp>/tests` | créer un test → variante + tag + publication (job) |
| `POST /api/clients/<c>/<camp>/tests/<id>` `{etat, part}` | lancer / arrêter → config republiée (job) |
| `POST /api/clients/<c>/<camp>/verifier` | la balise est-elle sur la vraie page ? (job) |
| `GET /files/…` · `GET /t/…` · `GET /v/…` | captures ; fichiers du tag tels que Vercel les sert |
| `GET/POST /api/clients/<c>/<camp>/intentions[/…]` | analyse, import CSV, décisions, génération par intention, simulateur, connecteur Google Ads, mesure — voir [../engine/intent/readme.md](../engine/intent/readme.md) |
| `POST /api/intents/<c>/<camp>/sync` | le seul endpoint hors mot de passe : Bearer du connecteur Google Ads |

État dans `clients/<client>/<campagne>/` : `tests.json`, `express.json`, `capture.json` (le
temps d'une capture). Jamais dans le repo.

## Ce qui n'est pas là

- **Mesure GA4 branchable** : la vue Intentions → étape 4 enregistre la propriété et lance
  `engine/measure/run.ts` ; sans compte de service provisionné, la page du test dit que les
  résultats se lisent dans GA4 au lieu d'inventer des chiffres.
- **Intentions Google Ads** : vue dédiée par client (import CSV du rapport « termes de
  recherche », relecture par intention, variantes ciblées, simulateur, connecteur script
  Google Ads en lecture seule). La synchronisation exige une instance publique HTTPS
  (`LPWS_URL_PUBLIQUE` + `LPWS_MOT_DE_PASSE`) ; en local seul l'import CSV fonctionne.
- **Un seul verbe** pour le buyer : changer un texte. Retirer, déplacer, dupliquer existent
  dans la machine mais pas encore à l'écran.
- **Une page par client** : la config du tag est par client (`v/<client>.json`), deux pages
  du même client s'écraseraient.
- **Express jamais éprouvé via un vrai GTM** : la balise est publique et la config répond,
  mais personne ne l'a encore collée dans un conteneur réel. C'est le prochain test.
- Le serveur tourne sur le poste de Yann ; la démo Vercel reste statique.

## Fichiers

- `index.html` — la source, un seul fichier, sans dépendance. Marqueur `/*THUMBS*/` pour la
  démo statique.
- `server.ts` — la v1 : les routes et le mot de passe ; le reste dans `server/` (config · jobs ·
  etat · pipeline des tests · tag · verrou par client · intentions).
- `build.ts` — la démo statique : injecte les captures lues dans `clients/`, réduites en JPEG
  dans Chromium.
- `dist/` — la sortie déployée (ignorée), avec `t/` et `v/` du tag et le lien Vercel.
