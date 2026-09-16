# DEEP RESEARCH — Landing Page Intelligence & Marketing Brain pour LWS (v2, mix corrigé)

> **À coller tel quel dans un nouveau chat avec Recherche avancée activée.**
> Version 2 : le mix client a été corrigé — SaaS self-serve + e-commerce/DTC dominants, B2B enterprise en minorité.

---

## CONTEXTE DU PROJET

Nous construisons LWS (LastWebStudios), une infrastructure destinée aux media buyers / agences / équipes marketing qui gèrent des campagnes d'acquisition.

Le concept à terme :

1. Un media buyer fournit l'URL d'une landing page existante.
2. LWS crawl/analyse la page.
3. LWS reconstruit une représentation fidèle et manipulable de la LP.
4. Le système comprend l'offre, le positionnement, le message, la structure, les preuves, les objections, les CTA.
5. Le media buyer demande une modification ou un nouvel angle de test.
6. LWS génère une variante réellement pertinente.
7. La variante est déployée et testable.
8. À terme, LWS connecte les données Google Ads / Meta Ads / Shopify / CRM / analytics.
9. Le système propose de nouvelles hypothèses de test selon : trafic, annonces, créas, mots-clés, secteur, offre, LP actuelle, performances historiques, résultats des tests précédents.

L'objectif n'est PAS de construire un simple "AI landing page builder". Nous voulons un **Marketing Brain / Landing Page Intelligence Layer** capable de produire des LP et des variantes qui ont une vraie logique marketing et business.

---

## ⚠️ CORRECTION MAJEURE DU MIX CLIENT (raison d'être de cette v2)

Une version antérieure de cette recherche supposait une clientèle majoritairement **B2B / enterprise SaaS**. **C'était faux.** Les entreprises réellement visées par LWS sont majoritairement **SaaS et E-COMMERCE / DTC**, le B2B enterprise étant minoritaire.

Pondération demandée :

- **~40-45 % de la profondeur du rapport sur l'E-COMMERCE / DTC** — écosystème Shopify, marques DTC, acquisition paid social, pages produit / collection / advertorial / quiz, checkout, économie AOV/RPV, retours, abonnement & réassort.
- **~40-45 % sur le SaaS** — mais orienté **self-serve / PLG / SMB SaaS / micro-SaaS / outils IA** (free trial, freemium, pricing au crédit, ACV faible à moyen, trafic élevé, cycle court), PAS principalement enterprise sales-led.
- **~10-15 % sur le B2B enterprise / sales-led / high-ACV** — à conserver, mais comme cas minoritaire avec ses règles propres (demo booking, MQL/SQL, cycles longs, faible trafic).

### Conséquences majeures à traiter explicitement

**1. La donne statistique change radicalement.**
La critique centrale de la v1 était que les LP B2B n'ont jamais assez de trafic pour des A/B tests correctement dimensionnés. L'e-commerce et le SaaS self-serve en ont souvent. Le rapport doit déterminer rigoureusement : **à partir de quel volume de trafic et de quel taux de conversion une vraie boucle d'apprentissage devient-elle viable ?**

Produire de véritables tables de sample size / MDE pour des scénarios réalistes : CR de base 2 % et 3 % ; 20k / 50k / 100k / 500k visiteurs mensuels ; MDE 5 % / 10 % / 20 % ; puissance 80 % ; alpha 0,05 ; une et deux variantes.

Couvrir : Kohavi/Deng/Tang sur les expériences fiables, réduction de variance CUPED, tests séquentiels, bandits multi-bras, shrinkage bayésien, pooling hiérarchique / méta-analytique inter-clients, risque de faux positifs et winner's curse, effets de nouveauté, saisonnalité (énorme en e-com : BFCM, périodes de soldes), et les données publiées de win rate (VWO ~14 %, Optimizely ~12 %, méta-analyse GoodUI/Georgiev sur ~115 tests avec lift médian ~4,9 %), plus tout dataset de résultats de tests spécifique e-commerce.

**Conclure honnêtement** : pour quels segments de la clientèle LWS la vision "le système apprend des données réelles" est-elle atteignable, et pour lesquels ne l'est-elle pas.

**2. Les métriques changent.**
En e-commerce, l'OEC n'est pas le "taux de conversion" mais le **Revenue per Visitor (CR × AOV)**, plus ROAS/MER, marge contributive, **taux de retour et de remboursement**, réachat / LTV, rétention d'abonnement. Rechercher les preuves sur l'optimisation RPV vs CR (une variante peut monter le CR en baissant l'AOV et la marge nette), sur les conversions tirées par la remise qui détruisent la marge, et sur les retours comme coût caché de promesses trop agressives (surtout en apparel).

Pour le SaaS self-serve, l'OEC est l'**activation puis trial→paid**, pas le volume de leads : benchmarks d'activation, débat free trial vs freemium vs reverse trial (Elena Verna / Kyle Poyar / données OpenView PLG), carte bancaire requise ou non, time-to-value.

**3. Les sources de trafic changent.**
Beaucoup moins de Google Search / LinkedIn ; beaucoup plus de **Meta Ads, TikTok Ads, Google Shopping & Performance Max, trafic influence/UGC, email/SMS (flows type Klaviyo)**.

Rechercher en profondeur : la continuité créa → landing page en paid social (**le créa EST l'ancre du message match, pas le mot-clé**), comment le trafic social froid diffère de l'intention search, le rôle des advertorials / listicles / pre-landers / quiz funnels en DTC, les LP natives TikTok, et ce que l'automatisation Performance Max / Advantage+ implique pour la stratégie LP (moins de leviers au niveau keyword, plus au niveau créa et flux produit).

Traiter aussi la dégradation d'attribution post-iOS14/ATT, la Conversions API de Meta, la Web Pixels API de Shopify, les limites de GA4 — et ce que tout cela implique sur la capacité même de LWS à mesurer l'impact d'une LP.

**4. Les types de pages changent.**
Au-delà des LP lead-gen classiques, rechercher et taxonomiser : **pages produit (PDP), pages collection, advertorials / pre-landers éditoriaux, pages listicle, quiz funnels, pages comparatives, pages bundle/offre, pages abonnement, pages type app-store, pages pricing, pages outil gratuit / calculateur, flows de signup trial, pages adjacentes à l'onboarding.** Pour chacune : structure recommandée, CTA, preuve, friction, messaging, métriques, failure modes.

**5. Le corpus de preuves bascule vers l'e-commerce.**
Aller en profondeur sur la recherche UX e-commerce de Baymard (raisons d'abandon de panier, usabilité checkout, recherche PDP, transparence des frais de port, guest checkout, badges de confiance près des champs de paiement), sur les effets des avis et notes (Michael Luca / Yelp ; Salganik, Dodds & Watts / Music Lab ; volume vs valence ; problème de la distribution en J ; effet crédibilisant de quelques avis négatifs), sur l'UGC et les vidéos avis.

Et sur le risque légal : **FTC Rule on Consumer Reviews and Testimonials (en vigueur 21 oct. 2024)**, Digital Fairness Act UE, DSA art. 25, UCPD, DGCCRF — puisque fausse urgence, faux compteurs et faux avis sont endémiques en DTC et constituent désormais une vraie exposition juridique que LWS ne doit jamais générer.

---

## 1. RECHERCHE SUR LES ÉLÉMENTS DE LANDING PAGE

Étudier en profondeur : hero, headline, subheadline, proposition de valeur, CTA principal, CTA secondaire, navigation, social proof, logos clients, testimonials, reviews, case studies, chiffres/résultats, bénéfices, features, démonstrations produit, screenshots, vidéos, comparaisons, pricing, FAQ, objections, garanties, sécurité, certifications, intégrations, formulaires, footer, réassurance, friction, sticky CTA, exit intent, chat, calendrier/demo booking.

**Plus les éléments spécifiques e-commerce :** visuels produit et galeries, zoom, guides des tailles, sélecteurs de variantes, stock/disponibilité, messaging livraison et délais, seuils de livraison offerte, politique de retour, moyens de paiement et BNPL (Klarna/Afterpay), notes en étoiles, sections avis, galeries UGC, bundles/upsells, cross-sells, sticky add-to-cart, cart drawer, dégressifs de quantité, toggles d'abonnement, countdown timers, trust badges.

Pour chaque élément : rôle psychologique, rôle business, impact potentiel sur la conversion, impact potentiel sur la qualité du lead/client (et sur l'AOV et les retours en e-com), situations où il est particulièrement pertinent, situations où il est inutile ou contre-productif, dépendance au secteur / à l'audience / à la source de trafic, niveau de preuve disponible.

---

## 2. PAS DE "BEST LP" UNIVERSELLE

Déterminer comment la LP doit changer selon :

**Type d'entreprise** — SaaS self-serve, SMB SaaS, micro-SaaS, outils IA, developer tools, enterprise SaaS, marketplace, fintech, healthtech, cybersecurity, HR/martech/sales software, DTC apparel, beauté/skincare, compléments/CPG, maison, électronique, bijouterie, food & beverage, animalerie, box par abonnement, services professionnels, immobilier, éducation.

**Type d'offre** — free trial, freemium, demo, consultation, audit, devis, outil gratuit, lead magnet, achat direct, abonnement, contrat enterprise, webinar, téléchargement, appel, remise première commande, bundle.

**Niveau de valeur** — faible / moyen / high ticket / enterprise, et pour l'e-com : tranches d'AOV.

**Cycle de vente** — self-serve, PLG, sales-led, enterprise, consultation obligatoire, achat d'impulsion, achat réfléchi.

**Sophistication du prospect** — les 5 niveaux de conscience de Schwartz (unaware, problem-aware, solution-aware, product-aware, most aware) et les 5 stades de sophistication de marché, particulièrement pertinents en DTC.

**Source de trafic, intention, device, géographie** (pays, langue, culture, localisation, monnaie, réglementation, confiance, références locales).

---

## 3. SEARCH INTENT, SHOPPING & PAID SOCIAL

Analyser la chaîne `search query → keyword → ad → landing page → conversion`, et tout autant la chaîne `créa → hook → pre-lander → PDP → checkout` pour le paid social, et `flux produit → Shopping/PMax → PDP` pour l'e-commerce.

Étudier : message match, pertinence keyword→headline, continuité ad→LP, search intent, landing page relevance, Quality Score (expected CTR, ad relevance, landing page experience — citer la documentation officielle Google, et noter que le QS est un **diagnostic, pas un input de l'enchère**), taux de conversion, qualité du lead/client.

Répondre à : la LP doit-elle reprendre exactement le wording de l'annonce ? Quand construire plusieurs LP par cluster de mots-clés / ad groups ? Quand une LP générique devient-elle un problème ? Branded vs non-branded, competitor keywords, niveaux d'intention mixtes, arbitrage SEO vs persuasion.

**Pour l'e-commerce :** quand envoyer le trafic payant vers une PDP, une page collection, une LP dédiée ou un advertorial — chercher des preuves réelles et le consensus praticien, et expliciter la contradiction entre "envoyer le trafic Shopping vers la PDP" et "les LP dédiées convertissent mieux".

---

## 4. MESSAGE MATCH

Recherche approfondie : ad → hero, keyword → headline, keyword → offre, promesse ad → promesse LP, **continuité créa → visuel hero (crucial en paid social)**, continuité de CTA, gestion des attentes.

Séparer ce qui est réellement démontré, ce qui relève du consensus CRO, et ce qui relève du folklore marketing (signaler comme anecdotiques les chiffres de case studies vendor massivement recyclés).

Surtout : **comment un logiciel pourrait-il détecter automatiquement un mauvais message match ?** Proposer une approche concrète à base de signaux détectables — extraction des entités de promesse depuis le texte d'annonce et le créa, recouvrement sémantique + lexical avec le hero, présence du bénéfice quantifié, congruence de l'offre (une pub qui promet "-50 %" face à un hero qui ne mentionne jamais la remise).

---

## 5. PSYCHOLOGIE DE CONVERSION

Cognitive load, attention, information scent, trust, perceived risk, perceived value, uncertainty, friction, motivation, urgency, social proof, authority, familiarity, loss aversion, scarcity, commitment, consistency, specificity, credibility, objection handling.

NE PAS recycler la "dark psychology". Pour chaque mécanisme : preuves expérimentales, psychologie établie vs folklore, contextes où ça marche, cas de backfire.

**Obligatoire — statut de réplication :** quels principes de Cialdini ont survécu, l'échec de l'ego depletion (Hagger et al. 2016, 23 labos), l'effondrement d'une grande partie du priming social, la non-réplication de l'étude serviettes Goldstein/Cialdini/Griskevicius par Bohner & Schlüter (2014), et le résultat de social proof négatif de Cialdini à Petrified Forest. **Dire clairement quels mécanismes LWS ne doit PAS encoder.**

---

## 6. COPYWRITING

Headline formulas, proposition de valeur, benefit vs feature, spécificité, messaging orienté résultat, pain points, agitation, objection handling, risk reversal, CTA copy, urgence, clarté, différenciation, positionnement.

Comparer les frameworks majeurs (AIDA, PAS, BAB, 4Ps, StoryBrand, JTBD messaging, positionnement April Dunford, awareness/sophistication de Schwartz, structures advertorial direct-response DTC).

Déterminer lesquels sont réellement utiles, lesquels se chevauchent, lesquels conviennent à quel contexte, lesquels sont de simples heuristiques, lesquels ont des preuves expérimentales, et **comment un moteur IA doit les utiliser sans produire du copy générique**.

---

## 7. VALUE PROPOSITION

Comment communiquer problème, résultat, bénéfice, différenciation, mécanisme, coût, délai, risque, preuve. Le "what / who / why / why now / why you". Ce qui doit apparaître above the fold selon le contexte.

Inclure ce que dit réellement la preuve sur le fold et le scroll (NN/g : ~57 % du temps d'attention above the fold ; les gens scrollent si on leur en donne une raison ; données Chartbeat) et comment cela diffère sur un trafic DTC massivement mobile.

---

## 8. TRUST / CREDIBILITY

Logos, testimonials, résultats quantifiés, noms de clients, case studies, reviews, notes, certifications, badges de sécurité, garanties, intégrations reconnaissables, endorsements d'experts, mentions presse, crédibilité fondateur.

**Plus les spécificités e-com :** notes en étoiles, nombre d'avis, badges acheteur vérifié, UGC, garanties retour/remboursement, transparence livraison, confiance paiement.

Questions : quelle preuve est la plus crédible selon le type de produit ? La preuve quantitative est-elle toujours supérieure ? Quand les logos comptent-ils vraiment ? Quand les testimonials sont-ils faibles (voire nuisibles, ex. sur des pages comparatives) ? Comment éviter le fake social proof ? Comment la confiance varie avec le ticket et le cycle ?

Citer Baymard, Luca (Yelp, +5-9 % de revenu par étoile, effet concentré sur les indépendants), Salganik et al. 2006 (Science, N=14 341), et la recherche montrant que quelques avis négatifs peuvent accroître la crédibilité.

---

## 9. FORMULAIRES, FRICTION & CHECKOUT

Nombre de champs, progressive profiling, email-only, formulaires multi-étapes, questions de qualification, calendar booking, friction du CTA, autofill, champs requis, validation, formulaires mobile.

**Plus la friction checkout e-com :** guest checkout, nombre d'étapes, autocomplétion d'adresse, express payment (Apple Pay / Shop Pay), frais de port surprise.

Réexaminer de façon critique "moins de champs = plus de conversions" : présenter les données corrélationnelles classiques (Imagescape, Marketo, HubSpot ~40k LP, Eloqua) **ET** le contre-exemple de Michael Aagaard chez Unbounce (retirer des champs a d'abord coûté −14 %, puis un formulaire reconstruit a gagné +19,21 % — *"I removed all the fields that people actually want to interact with and only left the crappy ones"*). Conclusion : ce sont **quels** champs, pas combien.

Pour l'e-com, citer les raisons d'abandon de panier de Baymard (coûts additionnels, création de compte forcée, checkout trop long, méfiance carte) avec tailles d'échantillon et dates.

---

## 10. QUALITÉ CLIENT, MARGE & ROI BUSINESS

Partie centrale, à recadrer pour le mix corrigé.

- **Lead-gen :** visitor → lead → MQL → SQL → opportunity → customer → revenue.
- **E-commerce :** visitor → add-to-cart → checkout initiated → purchase → revenu net après remise et retours → réachat → LTV.
- **SaaS self-serve :** visitor → signup → activated → paid → retained.

Analyser comment une LP peut gonfler artificiellement les conversions sans améliorer le business : CTA trop agressif, formulaire trop facile, qualification insuffisante, promesse trompeuse, mauvais targeting, incentive attirant les mauvais prospects, remise lourde détruisant la marge, allégations exagérées générant des retours, suppression de friction sur le trial produisant des signups qui n'activent jamais.

Déterminer quelles métriques LWS doit apprendre à optimiser. Inclure le problème statistique de l'optimisation de métriques aval retardées, rares et bruitées — littérature surrogate/proxy (Kohavi sur le choix de l'OEC ; Athey et al. surrogate index ; validation Netflix sur ~200 tests / ~1 098 bras, ~95 % de cohérence directionnelle entre surrogate à 14 j et outcome à 63 j, ~79 % de précision sur les décisions de lancement) — et définir un OEC défendable pour chacun des trois segments.

---

## 11. A/B TESTING & EXPÉRIMENTATION

Hypothèse, contrôle, variante, métriques primaire/secondaires, sample size, significativité, puissance, MDE, durée, effets de nouveauté, saisonnalité, tests multiples, faux positifs/négatifs, tests séquentiels, bayésien vs fréquentiste.

Montrer comment LWS doit représenter une expérience comme un objet structuré dont le système peut apprendre. Inclure les tables de sample size réalistes demandées plus haut, et dire explicitement quels profils de clients peuvent et ne peuvent pas faire tourner des tests valides.

---

## 12. GÉNÉRATION D'HYPOTHÈSES

Probablement la partie la plus importante. Construire un framework permettant à LWS de produire des hypothèses de test à partir de signaux observables.

Taxonomie complète : message match, value proposition, positionnement, headline, CTA, preuve, trust, objections, friction, offre, pricing/remise, urgence, segmentation d'audience, personnalisation, layout, formulaire, checkout, mobile, vitesse, UX technique, spécifique PDP, continuité créa↔LP.

Pour chaque catégorie : signaux observables, hypothèses possibles, modifications possibles, métriques à surveiller, risques, conditions d'application.

Référencer les frameworks CRO structurés existants : modèle LIFT (WiderFunnel/Goward), ResearchXL (Speero/CXL), priorisation PXL, taxonomie des issues UX de Baymard, et les frameworks d'audit spécifiques e-commerce.

---

## 13. PERSONNALISATION

Keyword, ad, créa, industrie, taille d'entreprise, rôle, géographie, intention, visiteur nouveau vs récurrent, campagne, device. Et pour l'e-com : source de référence, navigation passée, contenu du panier, géo/livraison, premier achat vs client récurrent.

Déterminer : quelles personnalisations sont réellement utiles, lesquelles sont trop complexes, lesquelles améliorent la conversion, lesquelles nuisent à la cohérence, comment éviter la fake personalization.

Inclure les preuves sur le Dynamic Text Replacement, la baisse de précision du reverse lookup IP firmographique post-privacy, et la preuve causale que la personnalisation peut se retourner (Kim & Han 2025, *Behavioral Sciences*, N=360, design 3×2 : quand la préoccupation vie privée est saillante, la perso basée PII ne fait pas mieux qu'un message générique et fait moins bien qu'une perso contextuelle modérée), plus les données d'enquête sur la "creepiness".

**Spécifier exactement quelles données seraient nécessaires à une personnalisation intelligente par LWS.**

---

## 14. MARCHÉ DES LANDING PAGES GÉNÉRÉES PAR IA

Analyser : AI website builders, AI landing page builders, outils de copywriting IA, plateformes CRO, plateformes d'expérimentation, plateformes de personnalisation, outils de marketing intelligence, outils d'optimisation d'ads, **et la stack spécifique e-commerce**.

Étudier au minimum : Unbounce (Smart Traffic, Smart Copy), Instapage (AdMap, DTR), VWO, AB Tasty, Optimizely, Convert, GrowthBook, Statsig, Webflow Optimize (ex-Intellimize), Framer, Leadpages, Landingi, Swipe Pages, Jasper, Copy.ai, Mutiny, Coframe, Lovable/Bolt/v0, **Replo, Shogun, PageFly, GemPages, Zipify, Funnelish, ConvertFlow, Intelligems, Visually.io, Loop/Recharge, Triple Whale / Northbeam, Klaviyo**, et les startups CRO à agents IA apparues en 2025-2026.

Ne pas se contenter de décrire les fonctionnalités : analyser ce qu'ils font réellement, leur positionnement, leurs limites, leur architecture apparente, leur cible, leur pricing si disponible, leur différenciation, ce qu'ils ne résolvent pas, et où LWS pourrait avoir un avantage.

Noter le M&A et les fermetures et ce qu'ils disent du marché : sunset de Google Optimize (30 sept. 2023), rachat d'Intellimize par Webflow (2024) et rebrand en Webflow Optimize, fusion VWO + AB Tasty (janv. 2026), rachat de Statsig par OpenAI (~1,1 Md$, 2025), pivot éventuel de Mutiny, consolidation de l'écosystème d'apps Shopify.

---

## 15. ÉTAT DE L'ART 2025-2026

AI search, AI Overviews et AI Mode et leur impact mesuré sur le CTR (Ahrefs, Pew, Seer, Similarweb — et la contre-affirmation de Google), évolutions Google Ads, Performance Max et AI Max, Meta Advantage+, évolution des comportements de recherche et d'achat, **shopping agentique / agents IA achetant pour l'utilisateur et ce que cela implique pour les LP et les flux produit**, privacy, tracking, first-party data, server-side tracking, Consent Mode v2, enhanced conversions, conversion modeling, impact ATT/iOS, Shopify Web Pixels, contenu généré par IA et sa détectabilité/qualité, personnalisation, outillage CRO, tendances de design de LP, UX mobile, vitesse, attribution.

**Classer explicitement chaque finding en : Established / Supported / Hypothesis / Marketing folklore.** Cette classification en quatre niveaux est très importante et doit être utilisée partout.

---

## 16. SOURCES

Priorité aux sources primaires : documentation officielle Google et Google Ads/Analytics, papiers académiques, recherche peer-reviewed, rapports d'expérimentation, datasets originaux, recherche d'entreprise.

Secondaires de haute qualité : Baymard, Nielsen Norman Group, CXL/Speero, Unbounce Conversion Benchmark Report, VWO, Optimizely, HubSpot, recherche Shopify, benchmarks Klaviyo, données Triple Whale/Northbeam, données PLG OpenView/Kyle Poyar, First Page Sage, Demand Curve, Reforge.

**Ne PAS traiter ces entreprises comme neutres** — identifier explicitement leurs biais commerciaux et leurs biais d'échantillonnage.

Chercher aussi la recherche académique : HCI, économie comportementale, recherche publicitaire, psychologie du consommateur, revues de marketing science (Journal of Marketing, Marketing Science, JMR), et la recherche sur l'achat B2B pour le segment minoritaire.

---

## 17. ÉVALUATION DES PREUVES

Pour chaque conclusion majeure : source, date, type de source, population étudiée, contexte, taille d'échantillon si disponible, méthode, résultat, limites, confiance.

Utiliser **Evidence strength : Very High / High / Medium / Low / Anecdotal**, avec une brève justification.

Ne jamais transformer une étude isolée en règle universelle.
Mauvais : *"Les CTA rouges convertissent mieux."*
Bon : *"Certaines études montrent un effet dans certains contextes, mais l'effet dépend du contraste, du design et du contexte de marque ; il ne faut pas encoder 'rouge = meilleur' comme règle générale."*

---

## 18. BENCHMARKS

Chercher les benchmarks pertinents quand ils existent : taux de conversion, taux d'add-to-cart, abandon de panier, complétion de checkout, AOV, RPV, ROAS/MER, trial-to-paid, taux d'activation, conversion demo, complétion de formulaire, vitesse, bounce/engagement, métriques de funnel.

Segmenter autant que possible par industrie, source de trafic, offre, étape de funnel, device, B2B/B2C/DTC, tranche de ticket/AOV. **Ne jamais présenter un benchmark unique comme vérité universelle** ; dire quand les données sont insuffisantes.

Utiliser : Unbounce Conversion Benchmark Report (médiane globale ~6,6 %, SaaS ~3,8 %, trafic email ~19,3 % — avec son biais d'échantillonnage), abandon de panier moyen Baymard (~70 %) avec réserves méthodologiques, benchmarks e-commerce Shopify/Littledata, benchmarks Google Ads WordStream/LocaliQ, benchmarks email/SMS Klaviyo, benchmarks trial-to-paid PLG.

---

## 19. TEARDOWNS DE LANDING PAGES

Analyser des LP réelles, pondérées selon le mix corrigé.

**DTC / e-commerce :** Ridge, Hims/Hers, Warby Parker, Allbirds, Glossier, Oura, Whoop, AG1, Liquid Death, Brooklinen, Casper, Away, Bombas, Gymshark, Tracksmith.
**SaaS self-serve :** Notion, Linear, Figma, Canva, Framer, Vercel, Superhuman, Descript, ElevenLabs, Cursor, Lovable, Loom, Calendly, Typeform, Webflow.
**Enterprise (cas minoritaire) :** HubSpot, Salesforce, Gong, Deel, Rippling.

Grille structurée pour chacune : Offre / Audience / Intention / Proposition de valeur / Hero / CTA / Preuve / Objections / Friction / Trust / Message match / Hiérarchie de l'information / Mécanisme de conversion probable / Faiblesses potentielles / Hypothèses à tester.

**AVERTISSEMENT MÉTHODOLOGIQUE à énoncer explicitement :** ne jamais confondre *"cette entreprise utilise X"* avec *"X fonctionne parce que cette entreprise l'utilise"*. C'est du survivorship bias, et LWS ne doit jamais dériver une règle d'un teardown seul.

---

## 20. TAXONOMIE DES LANDING PAGES

Construire une taxonomie couvrant les deux mondes : lead generation, demo, free trial, signup freemium, achat produit (PDP), page collection/catégorie, advertorial/pre-lander, listicle, quiz funnel, page bundle/offre, page abonnement, consultation, enterprise, webinar, téléchargement, comparaison, concurrent, feature-specific, industry-specific, use-case-specific, location-specific, outil gratuit/calculateur.

Pour chaque type : structure recommandée, CTA, preuve, friction, messaging, objections, métriques, failure modes courants.

---

## 21. LANDING PAGE DECISION ENGINE

**INPUTS** — company, industrie, offre, ICP, source de trafic, campagne, keyword ou créa, intention search/social, ad copy et créa, LP existante, étape de funnel, AOV/ACV/ticket, sales motion, marge, géographie, device, performance historique.

**↓ ANALYSIS** — intention, message match, proposition de valeur, trust, friction, objections, différenciation, qualité lead/client, risque marge, UX, problèmes techniques.

**↓ OUTPUT** — structure de LP, recommandations de messaging, recommandation hero, recommandation CTA, recommandation preuve, traitement des objections, hypothèses de test, propositions de variantes, métrique attendue impactée, confiance, rationale.

---

## 22. RÈGLES CONDITIONNELLES

Faire ressortir des règles IF/THEN explicites couvrant le mix corrigé. Exemples de la forme attendue :

- IF traffic = Meta cold AND offer = premier achat DTC THEN ...
- IF traffic = Google Shopping/PMax THEN destination = PDP vs LP dédiée ...
- IF AOV < X AND marge faible THEN éviter un hero centré remise ...
- IF produit = achat réfléchi (AOV élevé, risque de taille en apparel) THEN accentuer retours/garantie ...
- IF offer = free trial AND product = self-serve THEN ...
- IF trial requiert carte bancaire THEN ...
- IF sales motion = enterprise AND ACV = high THEN ...
- IF visitor = competitor keyword THEN ...
- IF trafic mensuel < N THEN ne pas lancer de micro A/B tests ...

---

## 23. PRIORISATION

Comment prioriser les opportunités pour que l'IA ne propose pas 40 modifications inutiles.

Évaluer `Potential Impact × Evidence × Relevance × Ease / Risk`, et comparer aux frameworks établis (les 14 questions binaires de PXL, ICE, PIE, RICE), en notant la faiblesse connue de PXL qui sous-note les changements stratégiques audacieux.

Niveaux de sortie :
- **HIGH** — "votre ad promet X mais votre LP ne mentionne jamais X"
- **MEDIUM** — "pas de preuve sociale sur un achat réfléchi à AOV élevé"
- **LOW** — "tester une autre couleur de CTA"

Les changements marketing substantiels doivent toujours primer sur la micro-optimisation cosmétique.

---

## 24. FACTEURS TECHNIQUES & UX

Vitesse, Core Web Vitals (LCP <2,5 s, INP <200 ms, CLS <0,1 au 75e percentile), responsive mobile, optimisation d'images (énorme en e-com), poids JS, bloat de thème et d'apps Shopify, tracking, fiabilité des formulaires et du checkout, accessibilité, liens cassés, compatibilité navigateurs, redirects, cookies, consentement, analytics, attribution.

Déterminer lesquels ont réellement un impact business significatif — et dire honnêtement que l'étude vitesse la plus citée (Deloitte/Google *"Milliseconds Make Millions"*, 2020, 37 marques, ~30 M sessions, +8,4 % de conversions retail par 0,1 s) est **observationnelle et corrélationnelle**, pas un A/B test propre, et couvre retail/travel/lead-gen plutôt que le SaaS.

---

## 25. WHAT NOT TO DO

Fausse rareté et faux countdown timers, faux testimonials et faux avis, copy IA générique, animations excessives, popups excessifs, dark patterns, allégations trompeuses, champs inutiles, headlines génériques, feature dumping, pages interminables sans hiérarchie, jargon excessif, stock imagery, social proof non pertinent, statistiques non sourcées, copie du messaging concurrent, sur-personnalisation, vanity CRO, **drip pricing et frais de port cachés, subscription traps et flows de résiliation difficiles**.

Déterminer ce qui est réellement nuisible et pourquoi, y compris l'exposition réglementaire : FTC Rule on Consumer Reviews and Testimonials (en vigueur 21 oct. 2024, pénalités civiles par infraction, couvrant explicitement les faux avis générés par IA), évolutions FTC "click to cancel" / negative option, Digital Fairness Act UE et DSA art. 25, UCPD, application DGCCRF.

**LWS doit refuser de générer ces patterns par défaut — argumenter pourquoi c'est un actif de confiance, pas une limitation.**

---

## 26. STRUCTURE DU RAPPORT FINAL

Executive Summary ; 1. Core Findings ; 2. What Actually Drives Landing Page Performance ; 3. Differences by Industry ; 4. Differences by Business Model ; 5. Differences by Traffic Source ; 6. Search Intent, Google Ads, Shopping & Paid Social ; 7. Message Match (search et créa) ; 8. Psychology & Behaviour ; 9. Copywriting ; 10. Trust & Proof ; 11. Forms, Friction & Checkout ; 12. Customer Quality, Margin & Revenue ; 13. CRO & Experimentation (avec tables de sample size) ; 14. Hypothesis Generation ; 15. Personalization ; 16. AI Landing Page Market ; 17. Competitive Landscape ; 18. 2025-2026 Trends ; 19. Landing Page Taxonomy ; 20. Decision Engine ; 21. Prioritization Framework ; 22. Technical / UX Factors ; 23. Common Failure Modes ; 24. Knowledge Base for LWS ; 25. Recommended Product Architecture ; 26. MVP vs V2 vs V3.

---

## 27. LIVRABLE CLÉ — KNOWLEDGE BASE

Produire une table structurée, exploitable par un produit :

| Context | Signal | Recommendation | Reason | Evidence | Confidence |
|---|---|---|---|---|---|

Viser **80 à 120 règles**, équilibrées entre e-commerce/DTC, SaaS self-serve, et (minoritairement) B2B enterprise. Chaque règle doit indiquer son niveau de confiance, et les règles Low/Medium doivent être formulées comme des hypothèses à tester plutôt que comme des vérités.

---

## 28. IMPLICATIONS PRODUIT POUR LWS

Que doit réellement savoir LWS pour produire une bonne variante ?

- **Depuis la LP (crawl)** — quelles données ?
- **Depuis Google Ads** — nommer les vraies ressources et champs API : `search_term_view`, `keyword_view`, `ad_group_ad`, `conversion_action`, `metrics.conversions` / `conversions_value` / `clicks` / `impressions` / `cost_micros`, et les vraies limites : custom columns non exposées, search terms masqués sous les seuils de confidentialité, risque de double-comptage dans le reporting AI Max.
- **Depuis l'API Meta Ads** — créas, ciblage adset, conversions via CAPI, fenêtres d'attribution et leur dégradation.
- **Depuis Shopify** — Admin API (orders, products), événements checkout, Web Pixels API ; et depuis Klaviyo/email.
- **Depuis le CRM.**
- **Ce que le client doit fournir manuellement.**

Quelles analyses peuvent être automatisées ? Quelles décisions peuvent être automatisées ? Lesquelles doivent rester humaines ? Quel est le minimum de données pour produire une variante utile ? Pour produire une recommandation fiable ? À partir de quel niveau de données peut-on honnêtement parler de "marketing intelligence" ?

---

## 29. MVP vs VISION

**MVP** — URL + crawl + contenu LP + structure + éventuellement ad copy/créa fournis manuellement + contexte business fourni manuellement, déjà suffisant pour générer des variantes intelligentes.

**V2** — intégration Google Ads / Meta Ads, données de campagne, données keyword et créa, analytics, données Shopify, génération automatisée d'hypothèses, suivi d'expériences.

**V3** — données CRM et feedback revenue, apprentissage automatique depuis les expériences, personnalisation, recommandations prédictives, cross-client intelligence, base de tests propriétaire.

Être concret sur ce qui est constructible et ce qui est spéculatif.

---

## 30. AUTOCRITIQUE

Section **"What We Still Don't Know"** : questions sans réponse, domaines avec peu de preuves, contradictions entre sources, hypothèses à tester, données manquantes, risques de biais, et ce que LWS ne devrait PAS encoder comme règles.

Puis une critique franche des hypothèses les plus faibles du concept LWS lui-même, réexaminées sous le mix corrigé :

a) Avec les volumes de trafic e-commerce et SaaS self-serve, la boucle d'apprentissage devient-elle viable — pour qui, à partir de quel seuil de trafic, et avec quelles réserves ?
b) La cross-client intelligence est-elle statistiquement et légalement viable (RGPD, confidentialité contractuelle, hétérogénéité des contextes, exigences du pooling méta-analytique) ?
c) Une IA peut-elle inférer de façon fiable l'offre, l'ICP, l'AOV, la marge et le sales motion depuis une page crawlée — où échouera-t-elle ?
d) Ce marché paiera-t-il, face à Replo / Shogun / PageFly / Unbounce / Intelligems / Webflow Optimize et aux builders LLM génériques, vu la consolidation 2025-2026 ?
e) Déployer et héberger des variantes crée-t-il une responsabilité technique et juridique que LWS sous-estime (intégration au thème Shopify, intégrité du tracking, consentement, vitesse) ?

Dire clairement si des parties de la vision sont faibles ou irréalistes, et pourquoi. **Je préfère "nous ne savons pas encore" à une règle marketing inventée.**

---

## 31. STANDARD DE RECHERCHE

Vraie deep research : trouver les sources primaires, trouver les études, comparer plusieurs sources, identifier les contradictions, vérifier les dates, identifier les biais commerciaux, synthétiser, et convertir chaque conclusion en implication produit. Privilégier les sources récentes pour les sujets qui bougent vite, tout en conservant la recherche fondamentale plus ancienne quand elle reste valide.

---

## 32. CITATIONS

Chaque affirmation substantielle sourcée, traçable de **recommandation LWS → conclusion → preuve → source originale**. Éviter les chaînes de citations ("un blog dit qu'une entreprise dit qu'une étude montre") ; remonter à l'étude originale quand c'est possible.

---

## 33. TROIS NIVEAUX DE SORTIE

- **Niveau 1 — Executive** : ce que l'équipe LWS doit savoir immédiatement.
- **Niveau 2 — Strategic** : comment ces connaissances doivent façonner le produit et son architecture.
- **Niveau 3 — Technical / Knowledge Base** : les règles, signaux, variables, hypothèses, taxonomies et frameworks transformables en système.

---

## QUESTION CENTRALE À GARDER TOUT DU LONG

Pas *"comment fait-on une bonne landing page ?"* mais :

> **"Comment construire un système capable de déterminer quelle landing page ou quelle variante devrait être construite POUR CE TRAFIC, CETTE OFFRE, CETTE AUDIENCE, CE BUSINESS MODEL et CETTE ÉTAPE DU FUNNEL, et comment savoir si cette décision améliore réellement le business ?"**

Le but est que LWS ne soit pas un générateur de LP génériques, mais un système qui transforme progressivement **DATA → CONTEXT → DIAGNOSIS → HYPOTHESIS → VARIANT → EXPERIMENT → RESULT → LEARNING**, et qui s'améliore avec les données réelles de campagnes et d'expérimentations.

Sois extrêmement rigoureux, sceptique vis-à-vis des "best practices" non démontrées, et orienté implications produit concrètes. **Ne cherche pas à confirmer la vision. Si certaines hypothèses du projet sont mauvaises, faibles ou irréalistes, dis-le explicitement et explique pourquoi.**
