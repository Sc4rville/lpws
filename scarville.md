# scarville.md — le plan d'action, tenu par Yann

> Le pendant de [kusaila.md](kusaila.md) : ce que Yann décide et pilote, mis à jour **avant chaque
> étape importante**. L'état de la machine reste dans [session.md](session.md), l'arbre complet
> dans [docs/feuille-de-route.md](docs/feuille-de-route.md).

---

## 2026-09-18 · La livraison est tranchée : trois voies, trois noms

**Le problème.** On sait fabriquer une meilleure version de la page d'un client. Il faut la
mettre devant ses visiteurs sans casser son site, sans lui coûter sa mesure, et en pouvant
tout changer. Ce qui décide de la méthode, ce n'est pas la plateforme (OVH, WordPress, Webflow…)
mais **comment le site est construit** : Shopify ou pas · page fabriquée par le serveur ou par
le JavaScript du site.

| Voie | Nom produit | Pour qui | Ce que le client fait | Ce qu'on peut changer |
|---|---|---|---|---|
| Tag GTM | **Express** | tout le monde — la porte d'entrée | rien : le buyer a déjà GTM | retouches (`set` `remove` `move` `swap` `duplicate`) ; clignotement possible |
| Relais DNS (proxy) | **Intégral** | sites non-Shopify, en régime | un enregistrement DNS, une fois | tout, `compose` compris, sans clignotement |
| Template de thème | **Natif** | boutiques Shopify | un accès à la boutique | tout, natif : panier, paiement, apps intacts |

**Le parcours d'un client.** 1 · On le convainc avec le clone (l'atelier, aucun accès).
2 · Premier test en **Express**, sans rien demander. 3 · Régime en **Intégral** ou **Natif**,
une fois le résultat vu — c'est là qu'on demande le DNS ou l'accès, et à ce moment-là ça passe.

**La règle de standardisation.** Le brain ne parle jamais HTML ni Liquid. Il parle `page.json`
(sections typées, emplacements) et des verbes, validés par schéma contre le **kit** du client :
ses coquilles de sections récoltées sur tout son site (`compose` v2), complétées par une
bibliothèque générique LPWS habillée à sa charte. Trois niveaux de fidélité, affichés à chaque
proposition : bloc dupliqué (identique) · coquille récoltée (identique) · générique habillé
(cohérent, jugé).

**État réel.** Express : construit et mesuré 9/9, mais en conditions de test (injecté avant
tout, config simulée) — jamais à travers un vrai GTM. Intégral : une idée, rien de construit.
Natif : validé hors ligne sur Dawn, bloqué par le compte Partner.

---

## En cours · L'interface du media buyer

Maquette HTML (artefact) de ce que voit le buyer : rail des clients · panneau (vue d'ensemble,
page, variantes, mesure, **Connexion** avec les trois voies dépliables et leur marche à suivre)
· playground (structure de la page, éditions, hypothèse, vérification, part de trafic, lien
d'aperçu, stop) · mesure (Google Ads, relais des identifiants de clic, Consent Mode, résultats,
taille d'échantillon). Données réelles du corpus (Jira, HubSpot, Monday, Asana) et du spike
Dawn ; les chiffres Google Ads sont des exemples et marqués comme tels.

Direction visuelle : tech, épuré, icônes dessinées à la main, rien qui ne serve.

**Première maquette publiée** (18 sept., soir) : https://claude.ai/artifact/DUhnF76pbi2D3muLbHRkTd
— cinq clients (les quatre du corpus + Dawn), playground sur les vraies specs, connexion
dépliable par voie. Ce qui est simulé : les comptes et résultats Google Ads (marqués
« exemple »), les états « en ligne », l'hypothèse de la variante Dawn, et les boutons de
connexion (Shopify, DNS, vérification) qui n'appellent rien.

---

## Prochaines étapes, dans l'ordre

1. **Maquette UI** → validation par Yann → transposition dans `engine/viewer` (ou un front dédié).
2. **Express en vrai** : un conteneur GTM réel + config hébergée, mesurer le clignotement réel.
3. **Spike Intégral** : un relais devant une vraie page WordPress ou Webflow, vérifier que les
   formulaires et le suivi survivent.
4. **Détection du cas au clone** : Shopify / WordPress / Webflow / Next · rendu serveur ou JS ·
   GTM présent · CSP stricte — tout est déjà sous la main dans `1_acquire`.
5. `compose` v2 (coquilles) → `kit.json`.
6. **Shopify** : compte Partner + boutique de dev (Yann).
