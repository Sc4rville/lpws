# surveille — la page réelle, relue

**Contrat :** une campagne → `surveillance/<date>.json` (un relevé) + `surveillance/alertes.json`.

Chaque relevé : statut, gclid conservé, balises, LCP, résumé d'audit, haut de page (titre,
sous-titre, boutons), empreinte, présence du tag Express, et concordance annonce ↔ haut de page
([`../variant/concordance.ts`](../variant/concordance.ts), déterministe, sans appel modèle).
Une alerte n'est levée que sur un **changement** : page hors service, gclid perdu, balise
disparue, tag Express absent, LCP dégradé, haut de page modifié, annonce qui ne colle plus.

```bash
npm run surveille -- clients/acme/printemps
npm run surveille -- --tout
```

L'interface relève automatiquement avec `LPWS_SURVEILLANCE=1` (fréquence du palier, ou
`LPWS_SURVEILLANCE_H`). La lecture des annonces depuis Google Ads attend l'API.
