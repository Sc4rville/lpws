# ui — l'interface du media buyer

Ce que voit le media buyer : ses clients, la page, les tests, la mesure, et la connexion
(Express · Intégral · Natif). Pour l'instant une maquette sur données réelles ; le vocabulaire
est le sien, pas celui de la machine ([scarville.md](../scarville.md)).

```bash
npm run ui           # ui/index.html + captures de clients/ → ui/dist/index.html
npm run ui:deploy    # build puis mise en ligne sur Vercel (projet lpws)
```

- `index.html` — la source, un seul fichier, sans dépendance. Contient le marqueur `/*THUMBS*/`.
- `build.ts` — injecte les captures (page d'origine, variantes) lues dans `clients/` et
  réduites en JPEG dans Chromium. `clients/` n'est jamais commité : les images n'existent que
  dans `dist/`, lui aussi ignoré.
- `dist/` — la sortie déployée. Le lien Vercel (`dist/.vercel/`) y reste entre deux builds.
