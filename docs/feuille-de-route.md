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
- ⬜ Stratégie scroll-jack *(Monday : détecté et rapporté, clone inexploitable en l'état)*
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
- ✅ Drapeau scroll-jack et preuve tronquée au lieu d'un plantage
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
- **Option B — un tag posé via leur gestionnaire de balises**
  - ⬜ Appliquer les verbes côté navigateur
  - ⬜ Éviter le clignotement sans détruire la vitesse de chargement
  - ⬜ Survivre au re-rendu React/Next *(le framework peut effacer nos modifications)*
  - ⬜ Mesurer l'impact réel sur les performances

---

# 2 · CRÉER — le marketing brain

**Ce que ça veut dire :** décider *quoi* mettre sur la page et *pourquoi*. C'est le cœur de
la valeur, et la seule partie que personne d'autre ne fait.

**Où on en est :** la logique est entièrement cartographiée
([docs/brain.html](brain.html)), le moteur n'existe pas. Les hypothèses sont écrites à la main.

## 2.1 · La représentation de la page (`page.json`)
- ✅ Contrat posé : sections typées, emplacements ancrés
- 🔴 Rien ne le produit encore
- ✅ **Dépendance à 1.1.3 levée** : les ancres ont une empreinte, `page.json` peut être bâti dessus
- ⬜ Élargir la taxonomie au mix réel : page produit, collection, advertorial, listicle, quiz, bundle, abonnement, pricing, outil gratuit
- ⬜ Extraire la structure (skill) et la valider par schéma
- ⬜ Extraire aussi le **texte actuel** de chaque emplacement *(sans lui, rien à comparer à l'annonce)*

## 2.2 · Le contexte du client
- ✅ Les neuf questions identifiées et formulées en langage humain
- ⬜ Schéma `context.json` : offre, cible, mode de vente, panier moyen, marge, source de trafic, étape du funnel, promesse publicitaire, volume mensuel, limites légales
- ⬜ Pré-remplissage par lecture de la page — proposer, jamais affirmer
- ⬜ Ingestion du texte de l'annonce
- ⬜ ⚠️ Ingestion de la **créa** (image/vidéo) — demande un modèle qui voit, brique entièrement manquante alors que c'est l'ancre du message en paid social

## 2.3 · La knowledge base
- ✅ 30 règles rédigées, 28 sources avec leurs biais assumés
- 🟡 Issues de la recherche v1, orientée B2B : la famille e-commerce est mince
- 🔴 **Lancer la recherche v2** — le brief est prêt ([docs/recherche-v2-brief.md](recherche-v2-brief.md)), livrable : 80 à 120 règles rééquilibrées
- ⬜ Extraire la KB de la page HTML vers un fichier de données validé par schéma
- ⬜ Implémenter les **cinq familles d'exécution** : diagnostic, interdiction, garde-fou, méthodologique, humilité — quatre chemins distincts dans le moteur, pas une boucle unique
- ⬜ Ajouter la famille e-commerce : revenu par visiteur, retours, remise contre marge, guide des tailles, frais de port, achat invité, paiement fractionné, contenu client
- ⬜ ⚠️ Ajouter la continuité créa → haut de page : **totalement absente** de la v1
- ⬜ Verrouiller les refus comme filtre de sortie, pas comme simple conseil

## 2.4 · L'extraction des signaux
- ⬜ Lister les signaux dont les règles ont besoin
- ⬜ Séparer le mécanique (compter des champs, détecter une navigation, mesurer la vitesse) du jugement (générique ou spécifique)
- ⬜ Mécanique → scripts
- ⬜ Jugement → skill, **une question typée indépendante par signal** *(garde l'option d'un modèle de décision rapide plus tard)*
- ⬜ Score de concordance annonce → page : entités de promesse, recouvrement de sens et de mots, présence du chiffre
- ⬜ Concordance visuelle créa → haut de page
- ⬜ Mise en cache des signaux par capture

## 2.5 · Le moteur de diagnostic
- ⬜ Jointure déterministe entre signaux et règles — **aucun LLM ici**
- ⬜ Filtrage par contexte : niche, source de trafic, montant
- ⬜ Hiérarchisation : impact × preuve × pertinence ÷ risque, plus une catégorie « stratégique » qui échappe au sous-scoring
- ⬜ Sortie : constats classés, chacun traçable jusqu'à sa source
- ⬜ Les quatre points d'arrêt : pas de contexte → demander · illégal → refuser · cosmétique → rediriger · rien à dire → l'avouer
- ⬜ Régime de changement selon le trafic : peu de trafic → gros changements assumés · beaucoup → tests chirurgicaux

## 2.6 · La génération de variantes
- ✅ Contrat : pas d'hypothèse, de métrique, de risque et de diagnostic → pas de variante
- ⬜ Skill `variant` : un constat choisi devient une spec valide
- ⬜ N'écrire que ce que le client affirme déjà — jamais inventer une statistique
- ⬜ Proposer un plan de 3 à 5 variantes hiérarchisées plutôt qu'une seule

## 2.7 · La qualité du brain
- 🔴 **Jeu de test annoté inexistant** — sans lui, la confiance affichée à côté d'un diagnostic est décorative
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

**Où on en est :** quasi inexistant. Le cockpit est un outil de développement, pas un produit.

## 3.1 · Mettre en ligne
- ⬜ Héberger une variante : sous-domaine, certificat, diffusion
- ⬜ Une URL stable par variante *(c'est elle que le buyer colle dans son annonce)*
- ⬜ Sur Shopify : publier le template et ouvrir par `?view=`
- ⬜ Dépublier et revenir en arrière en un clic
- ⬜ `noindex` et canonique pour ne pas polluer le référencement du client

## 3.2 · Brancher la mesure
- ⬜ Remettre les pixels du client sur la variante
- ⬜ **Vérifier que la mesure fonctionne avant de déclarer une variante prête**
- ⬜ Consentement conforme en Europe
- ⬜ Paramètres de campagne cohérents entre l'annonce et la page

## 3.3 · Brancher les plateformes publicitaires
- ⬜ Google Ads : lire les annonces, mots-clés, termes de recherche, conversions
- ⬜ Assumer les limites de l'API : termes masqués, pas de colonnes personnalisées, risque de double comptage
- ⬜ Meta Ads : lire les créas, les audiences, les conversions
- ⬜ Shopify : commandes, produits, événements de paiement
- ⬜ **Alerter quand la créa change et que la page ne suit plus** *(c'est ça, l'alignement continu qu'on vend)*

## 3.4 · L'interface
- 🟡 Cockpit local : comparer, voir les variantes, lire le journal
- 🔴 Rien pour un utilisateur externe : ni compte, ni multi-client, ni droits
- ⬜ Ajouter un client, ajouter une campagne
- ⬜ Formulaire d'entrée du contexte
- ⬜ **Afficher le diagnostic hiérarchisé** *(c'est le livrable qui se vend, pas la variante)*
- ⬜ Valider ou refuser une variante
- ⬜ Suivre les tests en cours
- ⬜ Multi-compte : un buyer gère plusieurs clients
- ⬜ Comptes, authentification, droits
- ⬜ Décider : local, web, ou les deux — et qui héberge

## 3.5 · Le modèle commercial
- ⬜ Trancher l'unité de facturation *(par compte et par mois — facturer à la variante invite l'objection « ce n'est qu'un titre »)*
- ⬜ Définir ce qui est inclus
- ⬜ Onboarding en libre-service ou accompagné
- ⬜ Le chemin d'accès Shopify conditionne l'onboarding e-commerce

## 3.6 · Le juridique et la confiance
- ⬜ Mandat écrit du buyer *(on clone la page du client d'un buyer mandaté, pas un site tiers)*
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
- ⬜ Enregistrer le résultat : a-t-elle tourné, sur combien de visiteurs, qu'a fait la métrique
- ⬜ Un objet « expérience » durable : contrôle, variante, dates, échantillon, résultat, verdict
- ⬜ Enregistrer aussi les tests **non concluants** *(sinon on n'apprend que des gagnants)*
- ⬜ Enregistrer les variantes refusées par le buyer et pourquoi *(signal très précieux sur nos diagnostics)*

## 4.2 · Savoir si on a le droit de conclure
- ⬜ Calculer l'échantillon nécessaire **avant** de lancer
- ⬜ Dire franchement quand le trafic ne permettra jamais de conclure
- ⬜ Se méfier d'un gagnant sur petit échantillon
- ⬜ Surveiller les garde-fous, pas seulement la métrique principale

## 4.3 · Apprendre pour un client
- ⬜ Historique par client : ce qui a marché, ce qui a échoué
- ⬜ Ne pas re-proposer une hypothèse déjà perdue chez lui
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
