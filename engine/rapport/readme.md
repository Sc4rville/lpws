# rapport — le rapport client

**Contrat :** un test d'une campagne → une page HTML autonome (captures embarquées), à envoyer
au client : ce qui a été testé et pourquoi, dates, échantillon prévu, résultat GA4 s'il existe,
verdict avec garde-fous ([`../measure/puissance.ts`](../measure/puissance.ts)), recommandation,
et ce que les tests précédents ont appris. Marqué LPWS, ou à la marque du buyer en Agence et
Régime. Aucun chiffre absent de GA4 n'est inventé.

Servi par l'interface : `GET /api/clients/<client>/<campagne>/rapport/<test>`.
