# Corpus de test — les LP de référence du clonage

Choisi par Yann (2026-09-16). Cinq pages B2B/SaaS réelles, chacune stresse un aspect
différent de la machine. Toute évolution de `engine/clone` doit repasser ce corpus.

| LP | URL | Ce qu'elle teste |
|---|---|---|
| HubSpot — Marketing Hub | https://www.hubspot.com/products/marketing | très riche : hero, preuves sociales, features, CTA, formulaires |
| Salesforce — CRM | https://www.salesforce.com/crm/ | grosse page enterprise, beaucoup de composants ; anti-bot probable (Akamai) |
| Asana — Sales | https://asana.com/uses/sales | page B2B avec segmentation + preuves + CTA |
| Monday — Work Management | https://monday.com/work-management | très visuelle, interfaces complexes à reconstruire |
| Atlassian — Jira | https://www.atlassian.com/software/jira | grosse LP produit, design system dense |

```bash
# repasser tout le corpus :
for u in \
  https://www.hubspot.com/products/marketing \
  https://www.salesforce.com/crm/ \
  https://asana.com/uses/sales \
  https://monday.com/work-management \
  https://www.atlassian.com/software/jira \
; do npm run clone -- "$u" --client corpus; done
```

Les résultats vivent sous `clients/corpus/` (gitignoré) — seuls les verdicts comptent,
notés dans la conversation/les sessions, pas versionnés.
