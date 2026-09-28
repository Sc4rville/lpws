# compte — paliers, essai, mandats, paiement, coûts

**Contrat :** `clients/compte.json` (validé zod) + les règles qui en découlent.

- [`paliers.ts`](paliers.ts) : Atelier · Solo · Agence · Régime, tirés de
  [docs/recherche/business-model.md](../../docs/recherche/business-model.md). **Hypothèses**, pas des
  prix confirmés. Unité : le client actif du mois (au moins un test en ligne).
- [`compte.ts`](compte.ts) : palier en vigueur (essai de 14 jours), clients actifs, facture
  indicative, `peutLancer` (mandat toujours exigé ; paliers appliqués avec `LPWS_FACTURATION=1`).
- [`stripe.ts`](stripe.ts) : session de paiement + webhook signé (HMAC, 5 min). Inactif sans
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX_*` : l'interface le dit. Le webhook
  n'accepte que la session créée par l'instance, payée ; un abonnement ni `active`, ni `trialing`,
  ni `past_due` ramène à l'Atelier. Retour après paiement : `LPWS_URL_PUBLIQUE` (sinon l'hôte de la
  requête). La facturation des clients en plus de l'Agence n'est pas encore envoyée à Stripe.
- [`couts.ts`](couts.ts) : coût réel des appels modèle (`clients/couts.jsonl`), groupés en
  diagnostics. `npm run couts`.
