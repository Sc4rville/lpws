# clients/ — les sorties de la machine

Toute la donnée produite par l'engine vit ici, **gitignorée** (le repo versionne le code,
pas les captures). Arborescence fabriquée par `engine/shared/paths.ts` — aucune famille
n'invente la sienne :

```
clients/
  <client>/                     ex. acme-saas
    <campagne>/                 ex. printemps-2026
      baseline/                 le clone fidèle de la LP actuelle (famille clone)
      variants/                 les variantes générées (familles apply/variant, à venir)
        <variante>/
```

Le contenu détaillé de `baseline/` est documenté dans
[engine/clone/readme.md](../engine/clone/readme.md).
