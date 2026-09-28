# Corpus de test — les LP de référence du clonage

Choisi par Yann (2026-09-16). Cinq pages B2B/SaaS réelles, chacune stresse un aspect
différent de la machine. Toute évolution de `engine/clone` doit repasser ce corpus.

| LP | URL | Ce qu'elle teste |
|---|---|---|
| HubSpot — Marketing Hub | https://www.hubspot.com/products/marketing | très riche : hero, preuves sociales, features, CTA, formulaires |
| Salesforce — CRM | https://www.salesforce.com/crm/ | grosse page enterprise, beaucoup de composants ; anti-bot probable (Akamai) |
| Asana — Sales | https://asana.com/uses/project-management | page B2B avec segmentation + preuves + CTA |
| Monday — Work Management | https://monday.com/work-management | très visuelle, interfaces complexes à reconstruire |
| Atlassian — Jira | https://www.atlassian.com/software/jira | grosse LP produit, design system dense |

```bash
npm run corpus                  # re-juge les baselines déjà capturées (hors ligne, rapide)
npm run corpus -- --recapturer  # refait tout le clone de chaque page (réseau, lent)
npm run corpus -- <url>…        # une autre liste
```

Le tableau (verdict de page, diff desktop/mobile, diff recalé, sections fidèles, sections à
revoir) sort sur stdout et dans `clients/corpus.json`. « décalage seul » = la page échoue mais
chaque section recalée est fidèle : un bloc a changé de hauteur, rien n'est cassé.

Les résultats vivent sous `clients/<marque>/` (gitignoré) — `atlassian/`, `asana/`, `hubspot/`, `monday/` — seuls les verdicts comptent,
notés dans la conversation/les sessions, pas versionnés.
