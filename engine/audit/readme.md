# audit — l'audit tracking gratuit

**Contrat :** une URL → `audit.json` : ce qui fait perdre des conversions sans que personne ne le voie.

La page est ouverte comme un clic Google Ads (`gclid=LPWS-AUDIT-0000` + UTM), sur mobile :
gclid après redirections, balises (GTM, GA4, Google Ads, Meta, TikTok, LinkedIn, Microsoft),
lieur `_gcl_aw`, CMP et Consent Mode v2 (refus par défaut, avant les balises), mesures parties
avant consentement, LCP, noindex, canonical. Chaque constat est `ok`, `attention`, `grave` ou
`a-verifier` (ce qu'un serveur d'audit ne peut pas trancher, ex. une CMP géolocalisée).

```bash
npm run audit -- https://exemple.com/landing [--client acme --campaign printemps]
```

Sans client, la sortie va dans `clients/_audits/` (hors des clients du buyer). « Fini » : aucun
constat n'est inventé ; ce qui n'a pas pu être observé est dit.
