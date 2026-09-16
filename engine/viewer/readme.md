# Viewer — le cockpit local

Visionneuse des sorties de la machine, en local, zéro dépendance.

```bash
npm run viewer   →   http://localhost:4600
```

- **Liste vivante** : scanne `clients/` et se rafraîchit seul — une capture lancée dans un
  terminal apparaît ici quelques secondes après, badgée `nouveau`. Pastille : 🟢 fidèle ·
  🔴 pas fidèle · 🟡 non jugée (capture présente, jugement absent/interrompu).
- **Côte à côte** : screenshot du vrai site (au moment de la capture) vs clone, scroll synchronisé.
- **Glissière** : avant/après superposés — le plus parlant pour repérer un décalage.
- **Diff** : les pixels qui diffèrent (la preuve du juge).
- **Clone rendu** : le `capture.html` servi en vrai dans une iframe (pas un screenshot).
- **Variantes** : vide tant que la famille `variant` n'existe pas ; elles s'afficheront ici
  dès qu'elles seront écrites sous `clients/<client>/<campagne>/variants/`.

Deux fichiers, deux rôles : [`server.ts`](server.ts) (scan + statique + API) et
[`app.html`](app.html) (l'interface). Le serveur n'écoute que sur `127.0.0.1`.
