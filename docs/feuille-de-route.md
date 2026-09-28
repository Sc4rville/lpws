# Feuille de route — LPWS

> Quatre blocs, dans l'ordre où ils se conditionnent : **contrôler** la page du client,
> **créer** ce qu'on va y mettre, **distribuer** l'expérience au media buyer, **nourrir**
> l'amélioration. Chaque bloc ne peut pas être meilleur que celui d'avant.
>
> `✅ fait` · `🟡 partiel` · `⬜ à faire` · `🔴 bloqué ou décision requise` · `⚠️ trou identifié`

---

# 1 · CONTRÔLER — avoir vraiment la main sur leur page

**Ce que ça veut dire :** pouvoir modeler la page de n'importe quel client, de façon fiable
et répétable. Par le clone, ou par une intégration à sa plateforme. **Cette étape doit être
irréprochable, sinon tout ce qui suit hérite de ses approximations.**

**Où on en est :** le bloc le plus avancé — deux pages du corpus fidèles à 0,1 % — et le trou
d'identité (1.1.3) qui invalidait silencieusement tout l'aval est comblé et prouvé.

## 1.1 · Capturer la page

### 1.1.1 · Acquisition
- ✅ Rendu headless, JS exécuté
- ✅ Démontage des overlays (cookies, preloaders) avant ET après le scroll
- ✅ Scroll complet pour déclencher le lazy-load et les apparitions
- ✅ Gel de la page (timers, boucles d'animation, vidéos) pour que référence et clone soient le même instant
- ✅ Frames vidéo capturées en image (les flux ne sont pas embarquables)
- ✅ Deux états sérialisés : desktop et mobile, mêmes ancres
- ✅ CSS-in-JS re-matérialisé (règles insérées par le JS, feuilles adoptées)
- ✅ Refus d'une page ≥ 400 ou d'une page d'erreur déguisée en 200
- ⬜ Attendre la fin des animations avant de geler *(héros Jira figé en pleine transition : fidèle mais pas livrable)*
- ⬜ Délai maximum par ressource au rapatriement *(clone Asana interrompu sans message, cause non identifiée)*
- ⬜ Stratégie pour les sites anti-bot *(Salesforce/Akamai — à décider quand un vrai client le demande)*
- ✅ monday : ce n'était pas un scroll-jack mais une feuille CSS refusée (SRI), une imbrication `<button>` non re-parsable et une affiche de vidéo plus petite que sa trame ; corrigés (0,2 % / 0,9 %)
- ✅ Anti-bot (Akamai / Salesforce) : Chromium complet + UA réel, un seul navigateur pour la capture et le juge
- ✅ Shadow DOM recopié en `<template shadowrootmode>` (Salesforce : en-tête, vidéo, pied) ; les ancres, sélecteurs (`hôte >>> intérieur`), le loader et apply y descendent (lien de l'en-tête Salesforce édité et jugé 3/3)
- ✅ Animations menées à terme avant la photo de référence (Asana) · délai par ressource (plus de capture éternelle)
- ✅ Racines fantômes fermées ouvertes à la capture (et refusées par la balise, en le disant) · iframes d'un autre domaine photographiés · pages sous login (`--auth`, `--cookie`) ; page-laboratoire `ui/demo/lab/`
- ⬜ Décider s'il faut un troisième viewport (tablette)

### 1.1.2 · Rendre la page autonome
- ✅ Octets saisis pendant le rendu, hashés par contenu, dédupliqués
- ✅ Extension déduite du contenu réel (les CDN mentent sur les types)
- ✅ CSS réécrit (`url()`, `@import`), polices locales
- ✅ Images : `src`, `srcset`, posters, styles en ligne
- ✅ `<base>` retirée : la page se rend sans réseau
- 🟡 Ce que la page ne charge pas reste distant, et c'est compté honnêtement
- ⬜ Vidéos non embarquées : seul le poster est là

### 1.1.3 · L'IDENTITÉ DES ANCRES — le trou comblé
> Constat de départ : `e231` ne voulait pas dire « le titre du héros » mais « le 231ᵉ élément
> dans l'ordre du document ». **Mesuré sur Jira (471 ancres), une bannière ajoutée en haut de
> page : 293 ancres désignaient un AUTRE contenu**, sans qu'`apply` s'en aperçoive.
> **État : empreinte + re-liage + refus construits et prouvés.** 411 ancres retrouvées (87,3 %),
> dont 402 déplacées, **0 lien faux** contre la vérité terrain, 60 ambiguës, 0 perdue.
- ✅ Ancres de contenu `e<n>` (par balise)
- ✅ Ancres de section `s<n>` (par géométrie — les sections modernes sont des div anonymes)
- ✅ **Empreinte** par élément : rôle, texte, signature de classes (hachages de build retirés), chemin des parents, section, rang ([`fingerprint.ts`](../engine/clone/1_acquire/fingerprint.ts))
- ✅ Empreinte écrite à la capture, à côté du numéro → `anchors.json`
- ✅ Étape de **re-liage** ([`relink.ts`](../engine/clone/1_acquire/relink.ts)) : ossature des correspondances franches, puis l'ordre du document contraint le voisinage — c'est ce qui débloque les composants répétés
- ✅ Rapport honnête : retrouvées / déplacées / ambiguës / perdues, jamais de tranchage au hasard
- ✅ `apply` refuse une édition dont l'empreinte ne correspond plus (`attendu` dans [`spec.ts`](../engine/apply/spec.ts))
- ✅ Preuve rejouable sur mutation connue : `npm run relink:check -- <baseline>`
- ⬜ Versionner les captures d'un client au lieu de les écraser
- ⬜ Corpus de test du re-liage : les mêmes pages capturées à deux dates réelles *(la mutation synthétique prouve le mécanisme, pas la dérive d'un vrai site)*
- ⬜ Remplir `attendu` automatiquement à l'écriture d'une spec *(sinon personne ne le remplira)*
- ⬜ Rejouer une spec ancienne sur une capture neuve en traduisant ses ancres par le rapport de re-liage

### 1.1.4 · Le juge
- ✅ Diff visuel contre le live, desktop et mobile
- ✅ Rendu en http local *(en `file://` Chromium refuse les polices locales)*
- ✅ Métriques de santé : débordement, images cassées, blocs restés invisibles, titres rognés
- ✅ Hauteur aberrante : preuve tronquée au lieu d'un plantage (le drapeau ne dit plus « scroll-jack », il ne le savait pas)
- 🔴 Mesure la page **entière** : un titre qui passe à trois lignes décale tout et fait exploser le score
- ⬜ Juge v2 : diff **par section ancrée**
- ⬜ Verdict par section (savoir *laquelle* a cassé)
- ⬜ Même découpage appliqué au delta de variante
- ⬜ Round-trip à vide : page.json → apply → re-rendu → pixel identique

### 1.1.5 · Le corpus
- ✅ Cinq pages choisies, verdicts suivis
- 🟡 Deux fidèles : Jira 0,1 % · HubSpot 0,1 %
- 🔴 100 % SaaS et enterprise : ne reflète pas le mix réel du projet
- ⬜ Ajouter une vraie page produit Shopify
- ⬜ Ajouter un advertorial / pre-lander
- ⬜ Ajouter un quiz funnel
- ⬜ Relancer le clone Asana interrompu
- ⬜ Une commande qui repasse tout le corpus et sort un tableau de verdicts

## 1.2 · Modeler la page

- ✅ Six verbes : remplacer, retirer, déplacer, échanger, dupliquer, composer
- ✅ Appliqués aux deux états
- ✅ Ancre introuvable = échec franc, rien d'écrit
- ✅ Texte seulement, jamais d'injection de balises
- ✅ Journal avant/après avec la position réelle dans la page rendue
- 🟡 `compose` : typographie et grille exactes, mais les wrappers ne se récoltent pas (fond, gouttière, largeur de bouton)
- ⬜ `compose` v2 : cloner la coquille d'une section exemplaire puis la remplir
- ⬜ Remplacer un visuel par un autre visuel du client
- ⬜ Éditer un formulaire (libellés, ordre des champs, champ retiré)
- ⬜ Décider si on autorise un jour à toucher au style *(pour l'instant : non, on ne touche pas au CSS du client)*

## 1.3 · Voie Shopify — l'intégration native

- ✅ Correspondance verbes → template JSON validée hors ligne sur le thème Dawn
- ✅ Validation contre les schémas du thème : spec invalide refusée 6 fois sur 6
- ✅ Limites connues : 25 sections par template, 50 blocs par section
- ✅ Contrôle indépendant : l'outil officiel ne détecte qu'une erreur sur quatre — notre validation est plus stricte et donc nécessaire
- 🔴 **BLOQUÉ : compte Shopify Partner + boutique de dev** *(un compte Partner et une boutique de dev sont normalement gratuits — si un prix de 36 € apparaît, c'est probablement un plan payant, à vérifier)*
- ⬜ Pousser un template alternatif sur une vraie boutique
- ⬜ Vérifier l'ouverture par `?view=<suffixe>`
- ⬜ Vérifier que Shopify accepte et refuse la même chose que notre validateur
- ⬜ Trancher le mode d'accès : compte collaborateur, app custom, ou app publique avec exemption
- ⬜ En-tête et pied de page : passent par un layout alternatif — et **ne pas** retirer l'en-tête d'une page produit, le panier y vit
- ⬜ Lire le thème comme `page.json` *(sur Shopify la structure est déjà écrite : on la lit au lieu de l'inférer)*
- ⬜ Blocs d'app pour les avis (Judge.me, Loox) : on peut les placer, pas les créer
- ⬜ Intégrer le backend Shopify dans `engine/apply` une fois validé

## 1.4 · Voie non-Shopify

- 🔴 **NON TRANCHÉ** — dépend des stacks réelles des clients SaaS *(question ouverte)*
- ⬜ Inventorier ces stacks : Webflow, Framer, WordPress, Next.js maison
- **Option A — page hébergée sur un sous-domaine** *(le modèle Unbounce/Instapage)*
  - ⬜ Remettre un formulaire qui fonctionne, ou pointer vers leur vrai parcours d'inscription
  - ⬜ Remettre les pixels du client
  - ⬜ Sous-domaine, certificat, DNS
  - ⬜ `noindex` pour éviter le contenu dupliqué
  - ⬜ Bandeau de consentement
- **Option B — un tag posé via leur gestionnaire de balises** ← **la voie d'entrée** ([`engine/deploy/tag`](../engine/deploy/tag/readme.md))
  - ✅ Appliquer les verbes côté navigateur (`set`, `remove`, `move`, `swap`, `duplicate` ; `compose` reste hébergé)
  - ✅ Cibles retrouvées **par empreinte** sur le DOM vivant — impossible avant 1.1.3
  - ✅ Tout ou rien : une cible ambiguë et le visiteur voit la page d'origine
  - ✅ Répartition **collante par `gclid`** : une seule Final URL, donc plus de biais de diffusion
  - ✅ Clignotement **mesuré** sur la vraie page live (60 ms sur HubSpot), pas supposé
  - ✅ Juge sur le site LIVE, témoin vérifié intact
  - ⬜ Survivre au re-rendu React/Next *(le framework peut effacer nos modifications)*
  - ⬜ Mesurer l'impact réel sur le LCP, pas seulement la durée du masque

---

# 2 · CRÉER — le marketing brain

**Ce que ça veut dire :** décider *quoi* mettre sur la page et *pourquoi*. C'est le cœur de
la valeur, et la seule partie que personne d'autre ne fait.

**Où on en est :** le moteur existe ([`engine/variant`](../engine/variant/readme.md)) : signaux
comptés, 8 questions jugées, 34 règles évaluées, 3 variantes écrites, une par cible. Il manque
`page.json`, la créa, et un jeu de test annoté pour mesurer le jugement.

## 2.1 · La représentation de la page (`page.json`)
- ✅ Contrat posé : sections typées, emplacements ancrés
- 🔴 Rien ne le produit encore
- ✅ **Dépendance à 1.1.3 levée** : les ancres ont une empreinte, `page.json` peut être bâti dessus
- ⬜ Élargir la taxonomie au mix réel : page produit, collection, advertorial, listicle, quiz, bundle, abonnement, pricing, outil gratuit
- ⬜ Extraire la structure (skill) et la valider par schéma
- ⬜ Extraire aussi le **texte actuel** de chaque emplacement *(sans lui, rien à comparer à l'annonce)*

## 2.2 · Le contexte du client
- ✅ Les neuf questions identifiées et formulées en langage humain
- ✅ Schéma `context.json` ([`contexte.ts`](../engine/variant/contexte.ts)) : deux champs obligatoires (annonce, mode de vente), le reste optionnel
- 🟡 Pré-remplissage : l'offre est pré-remplie avec la marque, le reste non
- ✅ Ingestion du texte de l'annonce (titre, description, mots-clés)
- ⬜ ⚠️ Ingestion de la **créa** (image/vidéo) — demande un modèle qui voit, brique entièrement manquante alors que c'est l'ancre du message en paid social

## 2.3 · La knowledge base
- ✅ 30 règles rédigées, 28 sources avec leurs biais assumés
- 🟡 Issues de la recherche v1, orientée B2B : la famille e-commerce est mince
- 🔴 **Lancer la recherche v2** — le brief est prêt ([docs/recherche-v2-brief.md](recherche-v2-brief.md)), livrable : 80 à 120 règles rééquilibrées
- 🟡 KB extraite de la page HTML vers [`regles.ts`](../engine/variant/regles.ts) : exécutable, typée, pas encore un fichier de données pur
- 🟡 Trois sorties distinctes dans le moteur : test / conseil / méthode ; les refus et garde-fous restent à brancher
- ⬜ Ajouter la famille e-commerce : revenu par visiteur, retours, remise contre marge, guide des tailles, frais de port, achat invité, paiement fractionné, contenu client
- ⬜ ⚠️ Ajouter la continuité créa → haut de page : **totalement absente** de la v1
- ⬜ Verrouiller les refus comme filtre de sortie, pas comme simple conseil

## 2.4 · L'extraction des signaux
- ✅ Signaux listés et typés ([`signaux.ts`](../engine/variant/signaux.ts), [`jugement.ts`](../engine/variant/jugement.ts))
- ✅ Mécanique → script (page rendue aux deux tailles) · jugement → 8 questions typées indépendantes, sur le plan
- ⬜ Mécanique manquante : checkout, badges de paiement, vitesse (brancher `lcp.ts`), consentement
- 🟡 Concordance annonce → page : jugée (question typée) + chiffre de l'annonce repris ou non (script) ; pas encore un score continu
- ⬜ Concordance visuelle créa → haut de page
- ✅ Mise en cache des signaux et du jugement par capture (`--refaire` pour recalculer)

## 2.5 · Le moteur de diagnostic
- ✅ Jointure déterministe ([`diagnostic.ts`](../engine/variant/diagnostic.ts)), aucun modèle
- ✅ Filtrage par niche et trafic, montant pour les règles qui en dépendent
- ✅ Hiérarchisation impact × preuve × pertinence ÷ risque, catégorie stratégique devant
- ✅ Constats classés, chacun avec sa règle et ses sources ; les non évaluables listés avec ce qui manquait
- ⬜ Les quatre points d'arrêt : pas de contexte → demander · illégal → refuser · cosmétique → rediriger · rien à dire → l'avouer
- 🟡 Régime calculé (gros changements sous 200 k visiteurs/mois), pas encore répercuté sur l'ampleur des éditions

## 2.6 · La génération de variantes
- ✅ Contrat : pas d'hypothèse, de métrique, de risque et de diagnostic → pas de variante
- ✅ [`variantes.ts`](../engine/variant/variantes.ts) : un constat devient une spec valide, au contrat de `apply/spec.ts`
- ✅ Cadre fermé : n'écrire que ce que la page affirme, une ancre existante ou rien
- ✅ Trois variantes, une par cible (titre, bouton, structure), proposées au buyer qui choisit

## 2.7 · La qualité du brain
- 🟡 **Jeu de test annoté** : 6 pages, 48 réponses justifiées (`engine/variant/annotations/`), accord du jugement 69 % → 73 % (`npm run brain:eval`) ; relecture par un media buyer attendue, le modèle n'est pas déterministe d'un tir à l'autre
- ⬜ Choisir 12 à 15 pages pondérées selon le mix réel
- ⬜ Annoter la structure : où est le héros, la preuve, quel type de page
- ⬜ Annoter les signaux **à l'aveugle**, avant de voir la réponse de la machine
- ⬜ Annoter le bon diagnostic (page + contexte)
- ⬜ Enregistrer les désaccords entre annotateurs *(un désaccord humain = un signal mal défini, pas une erreur machine)*
- ⬜ Mesurer les trois couches et refuser d'afficher une confiance non mesurée
- ⬜ Non-régression à chaque changement de règle ou de formulation

---

# 3 · DISTRIBUER — l'expérience du media buyer

**Ce que ça veut dire :** que tout soit fluide de son côté. Mettre une page en ligne,
brancher la mesure, voir ses comptes, valider une variante.

**Où on en est :** la mesure est câblée et jugée (3.2), l'hébergement ne l'est pas. Le cockpit
reste un outil de développement, pas un produit.

## 3.1 · Mettre en ligne
- ✅ Dossier publiable produit et **jugé avant publication** ([`engine/deploy`](../engine/deploy/readme.md))
- ✅ Livrer une variante **sans héberger** : la voie Express (tag GTM) l'applique sur la vraie page · ⬜ héberger (Intégral) reste à construire
- ✅ Une seule URL, celle du client : la répartition est collante par `gclid` · `?lpws=<nom>` pour l'aperçu
- ⬜ Sur Shopify : publier le template et ouvrir par `?view=`
- ✅ Arrêter en un clic (`actif:false`, l'original reprend 100 %) ; l'état affiché est l'état en ligne
- ✅ `noindex` + canonique dans `deploy` (sans objet en Express : la page reste celle du client)

## 3.2 · Brancher la mesure
- ✅ Remettre les pixels du client sur la variante (gtag / Meta, depuis la config)
- ✅ **Juge de livraison** : la page est ouverte comme Google Ads le ferait (`?gclid=…`) et refusée si un CTA perd l'identifiant de clic
- ✅ Consentement conforme en Europe : Consent Mode v2 en refus par défaut, avant les pixels
- ✅ Paramètres de campagne relayés vers le tunnel du client (gclid, gbraid, wbraid, msclkid, fbclid, utm_*)
- ✅ `noindex` + `canonical` : pas de concurrence de référencement avec la page du client
- 🟡 Preuve de bout en bout : le visiteur voit la variante sur une page publique (démo Relay) ; la remontée dans une vraie GA4 attend une propriété

## 3.3 · Brancher les plateformes publicitaires
- ⬜ Google Ads : lire les annonces, mots-clés, termes de recherche, conversions
- ⬜ Assumer les limites de l'API : termes masqués, pas de colonnes personnalisées, risque de double comptage
- ⬜ Meta Ads : lire les créas, les audiences, les conversions
- ⬜ Shopify : commandes, produits, événements de paiement
- 🟡 **Alerter quand la créa change et que la page ne suit plus** *(c'est ça, l'alignement continu qu'on vend)* : la concordance annonce ↔ haut de page est mesurée à chaque relevé de surveillance ([`engine/surveille`](../engine/surveille/surveille.ts), [`concordance.ts`](../engine/variant/concordance.ts)) à partir de l'annonce saisie ; la lecture automatique des annonces attend l'API Google Ads

## 3.4 · L'interface
- ✅ Interface web hébergée (box, mot de passe) : copie, campagne, propositions, tests, résultats
- 🟡 Un mot de passe partagé ; ni comptes ni droits
- ✅ Ajouter une page : client et campagne déduits de l'adresse
- ✅ « Votre campagne » : deux champs obligatoires, le reste optionnel
- ✅ **Le diagnostic hiérarchisé** : « LPWS propose 3 tests » avec la raison et la source, « À transmettre au client »
- ✅ « Créer ce test » / « Pas celui-là » (le refus est gardé)
- ✅ Suivre les tests : part de trafic, jours, verdict dès que GA4 remonte
- ✅ Multi-compte : un buyer gère plusieurs clients (compte, palier, clients actifs du mois : [`engine/compte`](../engine/compte/compte.ts))
- 🟡 Compte, palier, essai, mandats, code partenaire, marque du rapport ; l'authentification reste le mot de passe partagé
- ✅ Audit tracking gratuit (gclid, redirections, balises, Consent Mode, LCP, noindex) : [`engine/audit`](../engine/audit/audit.ts), écran « Audit tracking »
- ✅ Suivi par client : relevés, alertes, audit, mémoire des tests ; rapport client HTML (LPWS ou marque blanche) : [`engine/rapport`](../engine/rapport/rapport.ts)
- ✅ Les deux : web sur la box de kabylesystem (seule instance qui publie), local avec `LPWS_SANS_VERCEL=1`

## 3.5 · Le modèle commercial
> Recherche marché et grille proposée : [business-model-rapport.md](business-model-rapport.md)
- 🟡 Unité de facturation : le client actif / mois, codé comme hypothèse ([`paliers.ts`](../engine/compte/paliers.ts)) ; appliqué seulement avec `LPWS_FACTURATION=1`, à confirmer par les entretiens
- 🟡 Ce qui est inclus : la grille Atelier · Solo · Agence · Régime est codée ; Stripe (abonnement + webhook signé) s'active avec les clés `STRIPE_*`, non configurées
- ✅ Coût réel d'un diagnostic journalisé (`clients/couts.jsonl`, `npm run couts`) : la base du plafond de diagnostics
- ⬜ Onboarding en libre-service ou accompagné
- ⬜ Le chemin d'accès Shopify conditionne l'onboarding e-commerce

## 3.6 · Le juridique et la confiance
- ✅ Mandat déclaré par client avant tout lancement (qui, quand, quelle déclaration) ; conditions d'utilisation acceptées dans le compte · ⬜ le contrat écrit reste humain
- ⬜ Refus documenté des patterns illégaux — à présenter comme un argument, pas une limite
- ⬜ Données de performance et RGPD
- ⬜ Propriété du contenu produit

---

# 4 · NOURRIR — l'amélioration récursive

**Ce que ça veut dire :** que le système s'améliore avec ce qui s'est réellement passé.

**Où on en est :** rien, et c'est un choix. Le produit vend du diagnostic, pas de
l'apprentissage automatique. Mais il y a des fondations qui ne coûtent rien à poser
maintenant et qui coûteront très cher à rattraper.

## 4.1 · Enregistrer ce qui s'est passé
- ✅ Chaque variante porte déjà son hypothèse, sa métrique, son risque et son diagnostic
- ✅ Enregistrer le résultat : a-t-elle tourné, sur combien de visiteurs, qu'a fait la métrique
- ✅ Un objet « expérience » durable par client (`clients/<client>/experiences.json`, [`memoire.ts`](../engine/measure/memoire.ts))
- ✅ Enregistrer aussi les tests **non concluants** et ceux arrêtés sans mesure
- ✅ Enregistrer les variantes refusées par le buyer et pourquoi

## 4.2 · Savoir si on a le droit de conclure
- ✅ Calculer l'échantillon nécessaire **avant** de lancer ([`puissance.ts`](../engine/measure/puissance.ts), écran « Peut-on conclure ? », plan fixé au lancement)
- ✅ Dire franchement quand le trafic ne permettra jamais de conclure
- ✅ Se méfier d'un gagnant sur petit échantillon (gagnant précoce signalé)
- ✅ Garde-fous : cycle de 7 jours, 25 conversions minimum, répartition anormale (SRM)

## 4.3 · Apprendre pour un client
- ✅ Historique par client : ce qui a marché, ce qui a échoué (écran Suivi)
- ✅ Ne pas re-proposer une hypothèse déjà perdue chez lui (le brain l'écarte et le dit)
- ⬜ Enrichir son contexte avec ce qu'on a appris

## 4.4 · Apprendre entre clients — le pari risqué
- 🔴 Fragile statistiquement **et** juridiquement : à ne promettre à personne
- ⬜ Exiger une similarité de contexte avant de transférer un enseignement
- ⬜ Méta-analyse prudente, qui demande beaucoup de tests comparables
- ⬜ RGPD, confidentialité contractuelle, concurrence
- ⬜ Décider si on y va — et seulement quand la donnée le justifie

## 4.5 · Faire vivre la knowledge base
- ⬜ Tracer quelle règle a produit quelle variante et quel résultat
- ⬜ Une règle qui perd plusieurs fois perd de la confiance ; une règle qui gagne en gagne
- ⬜ Relire la KB à chaque nouvelle recherche

---

# Les cinq choses à faire maintenant

1. ~~**L'identité des ancres** (1.1.3)~~ — **fait** : empreinte, re-liage, refus d'`apply`, preuve rejouable. Reste le versionnage des captures et le remplissage automatique d'`attendu`.
2. **La boutique de dev Shopify** (1.3) — débloque le gros de l'e-commerce, et c'est du côté de Yann.
3. **La recherche v2** (2.3) — tourne en parallèle, livre la moitié manquante de la KB.
4. **Le juge par section** (1.1.4) — sans lui on ne sait pas *quoi* a cassé, ni côté clone ni côté variante.
5. **Le jeu de test annoté** (2.7) — petit à produire, et c'est la condition pour avoir le droit d'afficher une confiance.
