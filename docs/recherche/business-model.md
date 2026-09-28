# Business model — recherche marché · LPWS

> Ce que le marché fait payer, à qui, pour quoi — et ce qu'on peut vendre de plus en le
> branchant sur ce que la machine sait déjà faire. Recherche web du 2026-09-28 : prix relevés
> sur les pages officielles sauf mention « secondaire ». **Tout prix est à reconfirmer avant
> une décision** : ces pages changent souvent.
>
> Relié à la [feuille de route](../feuille-de-route.md) : chaque proposition cite la ou les
> micro-tâches qu'elle mobilise (`3.5`, `4.2`…). Décide surtout **3.5 · Le modèle commercial**.

---

## 0 · La réponse courte

1. **Unité de facturation : le client actif par mois** (un client du buyer avec au moins un
   test ou une surveillance en cours), avec un volume de visiteurs testés inclus. Pas la
   variante (objection « ce n'est qu'un titre »), pas le siège (le buyer travaille seul ou à
   deux), pas le pourcentage de dépense (il le vit comme une taxe).
2. **Trois paliers + un gratuit** : *Atelier* gratuit (clone + diagnostic, rien en ligne) →
   *Solo* ~149 $ → *Agence* ~399 $ → *Régime* sur devis (Intégral / Natif / accompagnement).
   Positionnement : au-dessus des outils « une page par annonce » (99–399 $), en dessous des
   plateformes de test (299 $ → 40 k$/an), parce qu'on livre **le diagnostic + la mise en
   ligne sans DNS + les garanties de tracking**, ce qu'aucun des deux camps ne fait seul.
3. **Ce qui rend le récurrent légitime entre deux tests** : la surveillance (tracking,
   vitesse, cohérence annonce ↔ page) et le rapport client en marque blanche. Sans ça, le
   buyer paie un mois, teste, et part — le churn SMB est de 3 à 7 % **par mois**.
4. **Le gratuit est un produit, pas un essai** : l'audit tracking (« votre redirection perd le
   gclid ») et le calculateur « peut-on conclure ? » sont déjà à moitié construits et vendent
   seuls dans une newsletter de 3 500 buyers.
5. **Menace n° 1 : Augmentic** fait déjà « une variante par campagne via une balise, épinglée
   sur l'UTM » à 99 / 399 $. **Menace n° 2 : Google et Meta eux-mêmes** (AI Max, Final URL
   expansion, Optimize website destination). Notre défense : le diagnostic sourcé, l'honnêteté
   statistique, et la page réelle du client modifiée sans casser sa mesure.

---

## 1 · Le paysage concurrentiel, prix relevés

### 1.1 · Les builders hébergés (on remplace la page)

| Outil | Prix | Unité | Ce qu'on en retient |
|---|---|---|---|
| **Unbounce** | 29 → 249 $/mois ; A/B illimité dès 149 $ (30 k visiteurs, 3 users) ; IA « Smart Traffic » à 249 $ ; *Concierge* et agence sur devis | visiteurs + domaines + users | le test est un **palier payant**, pas une base. Smart Traffic = bandit contextuel, apprend dès 30 visiteurs |
| **Instapage** | dès 79 $/mois (annuel, *secondaire*) ; 15 k / 30 k / 50 k / 100 k visiteurs ; *workspaces* par client | visiteurs uniques + workspaces | le **workspace = client** est l'unité agence |
| **Swipe Pages** | 29 / 69 / 149 $ ; agence **domaines clients illimités à 199 $** ; dépassement 5 $ par 5 k visites | visites | argument agence : « le coût logiciel reste plat quand le portefeuille grossit » |
| **LanderMagic** | 0 / 39 / 79 $ ; crédits IA + pages vues ; « dynamisation d'un site externe » dès 27 $ | crédits IA + vues | pages par mot-clé / ville pour Google Ads, sync conversions offline |

### 1.2 · Les plateformes de test par balise (on modifie la page existante)

| Outil | Prix | Unité |
|---|---|---|
| **Convert** | Growth 299 $ · Pro 420 $/mois (annuel, 100 k testés/mois) | utilisateurs testés (MTU) |
| **Mida** | Growth 299 $/mois (annuel, 100 k MTU) ; portail agence | MTU, projet = site |
| **VWO** | sur devis, par MTU et modules | MTU |
| **Kameleoon** | Starter 495 $/mois, 10 expériences, 50 k visiteurs, crédits de prompt | visiteurs + crédits |
| **AB Tasty** | aucun prix publié ; médiane 66,5 k$/an (Vendr, *secondaire*) | trafic 12 mois |
| **Optimizely** | sur devis ; paliers à 250 k / 500 k / 1 M MAU | MAU |
| **Webflow Optimize** (ex-Intellimize) | ~299 $/mois d'entrée *(page Webflow, à confirmer)* ; marche hors Webflow via un snippet | pages vues |

### 1.3 · Shopify (Natif, `1.3`)

| Outil | Prix | Unité |
|---|---|---|
| **Shoplift** | Core 99 $ · Advanced 299 $ · **Managed 699 $** (account manager, 2 sessions stratégie/mois) ; tarif spécial 5+ boutiques | visiteurs site (< 100 k pour Core) |
| **Intelligems** | 69 $ → 349 $ ; « profit par visiteur » sur chaque test | volume de commandes |
| **Replo** | 0 / 99 / 499 $ ; crédits agent + sessions ; « transformer la créa en contenu de page » au palier 499 $ | crédits + sessions |
| **Personizely** | 39 / 59 $ (10 k visiteurs) | visiteurs |
| **CustomFit.ai** | 79 $ (0–10 k) ; users illimités | visiteurs, **pas de siège** |

Côté Shopify, **0 % de commission sur le premier million de dollars** de revenu d'app
(à vie depuis 2025), 15 % au-delà.

### 1.4 · Les concurrents directs : « une page par annonce », IA

| Outil | Prix | Ce qu'il fait | Écart avec nous |
|---|---|---|---|
| **Augmentic** | Solo 99 $ (1 site, 5 variantes, 5 k visiteurs) · Team 399 $ (3 sites, 25 variantes, 100 k) · Scale | transforme le site existant en pages par campagne, **une balise**, variante épinglée sur `utm_campaign` | **quasi notre Express.** Pas de diagnostic sourcé visible, pas de juge tracking. C'est le concurrent à battre sur le prix d'entrée |
| **AgentMark** | 500 / 1 000 / 2 000 $/mois (25 k / 100 k / 300 k visiteurs) · **+1 000 $/mois stratège** · 30 j gratuits | une page par annonce publiée dans Shopify, split 50/50, « vous décidez du gagnant » | vente founder-led : **« 20 min, apportez une annonce, repartez avec la page »** |
| **Fibr AI** | sur devis ; plan **agences & affiliés** (10 k sessions, 5 URL) | agents perso / test / monitoring (« AYA » surveille la page 24/7) | le monitoring est vendu comme un agent à part |
| **Coframe** | sur devis ; « à l'impression » pour startups, « à la valeur » pour enterprise | CRO géré IA + humains | modèle service, cycle de vente |
| **Mutiny** | Free · Business 50 $ (crédits) · Enterprise **dès 40 k$/an** | B2B ABM, perso par compte | le haut de marché B2B, pas notre buyer |
| **Uplane** (YC F25) | — | « remplacer votre agence marketing » : annonces + LP | vise le client final, **contre** le buyer ; nous, on l'outille |

### 1.5 · Les plateformes publicitaires elles-mêmes

- **Google AI Max for Search** : *Final URL expansion* (envoie le clic vers l'URL du domaine
  jugée la plus pertinente) et *Text customization* (réécrit l'annonce à partir des pages),
  **activés par défaut** quand on passe en AI Max. Conséquence : la Final URL que teste le
  buyer peut ne pas être celle où atterrit le clic → **à détecter et à dire** (`3.3`).
- **Meta « Optimize website destination »** (Sales, image/vidéo seule) : Meta peut remplacer
  l'URL de l'annonce par l'accueil ou une fiche produit. Même risque pour un test paid social.
- **Unbounce Smart Traffic** : le bandit par visiteur est une fonction standard à 249 $.

---

## 2 · Ce que le media buyer paie déjà — les ancres de valeur

| Poste | Ordre de grandeur | Source |
|---|---|---|
| Frais de gestion Google Ads d'une agence | 500 → 3 000 $/mois, ou **10–20 % de la dépense** au-delà de 3 k$/mois | Sproutbox 2026 |
| Une landing page par un freelance | **300 → 3 500 $** la page | eSEOspace 2025 |
| Une landing page par une agence US | **2 500 → 15 000 $** | idem |
| Un sprint CRO productisé | 500 £ (headlines) → 2 500 £ (un test de bout en bout) | GoGoChimp |
| Un retainer CRO | 2 500 → 5 000 £/mois (2–3 tests/mois) | GoGoChimp |
| CRO « payé à l'uplift » | fixe modéré + prime par point gagné | conversionrate.store |
| Reporting client marque blanche | 19 → 49 $/mois ; ou **~5–10 $ par client** | ClientPlug, Oviond |
| Hébergement GTM serveur (Stape) | 0 → 167 $/mois selon requêtes | Stape |

**Lecture.** Un seul test sans designer ni dev vaut au buyer le prix d'une page freelance
(300–3 500 $). À 149–399 $/mois, on est en dessous de **une** page — c'est l'argument de vente.
Et comme il facture souvent 10–20 % de la dépense à son client, **il peut refacturer LPWS**
(ligne « outil de test » ou « CRO ») : le prix doit être facile à refacturer, donc **par client**.

---

## 3 · La donne statistique pèse sur le prix (`4.2`)

- Sur 2 288 tests audités, **19 % donnent un gagnant significatif** ; Optimizely publie ~12 %,
  VWO ~14 % (ConversionTeam 2026). Quatre tests sur cinq ne concluent pas franchement.
- **Conséquence 1 — pas de facturation au gagnant.** Si l'on ne se paie qu'au test gagnant, on
  est payé une fois sur cinq, et chaque verdict devient une dispute d'attribution.
- **Conséquence 2 — pas de facturation à la variante.** Le buyer paierait pour des perdants.
- **Conséquence 3 — l'honnêteté est un argument commercial.** Dire « avec votre trafic, ce
  test ne conclura pas avant 9 semaines, en voici un plus gros » (`4.2`) est rare dans le
  marché : Unbounce, AgentMark, Augmentic affichent des lifts, pas des tailles d'échantillon.
- **Conséquence 4 — facturer au visiteur testé plafonne le mauvais levier** : un petit compte
  B2B n'a pas le trafic ; un gros e-com l'a. D'où une unité *client actif* avec un volume
  inclus généreux, le dépassement étant rare et facturé au palier supérieur.

---

## 4 · La grille proposée (hypothèse à valider, `3.5`)

| | **Atelier** | **Solo** | **Agence** | **Régime** |
|---|---|---|---|---|
| Prix indicatif | 0 $ | **149 $/mois** | **399 $/mois** | dès ~1 000 $/mois |
| Clients actifs | 1 page, pas de mise en ligne | 3 | 15 (puis ~20 $/client) | illimité |
| Visiteurs testés inclus | — | 50 k | 250 k | sur mesure |
| Copie + diagnostic « LPWS propose 3 tests » | ✅ | ✅ | ✅ | ✅ |
| Audit tracking (gclid, redirections, Consent Mode) | ✅ | ✅ | ✅ | ✅ |
| Express (balise GTM) | — | ✅ | ✅ | ✅ |
| « Peut-on conclure ? » + verdict | calculateur | ✅ | ✅ | ✅ |
| Surveillance continue (tracking, LCP, annonce ↔ page) | — | hebdo | quotidienne + alertes | temps réel |
| Rapport « À transmettre au client » | marqué LPWS | marqué LPWS | **marque blanche** | marque blanche |
| Intention (`engine/intent`) | — | — | ✅ | ✅ |
| Intégral (DNS) / Natif (Shopify) | — | — | — | ✅ |
| Stratège LPWS (fait pour vous) | — | — | option ~1 000 $/mois | inclus |

**Pourquoi ces montants.** Solo est au niveau d'Unbounce A/B (149 $) et au-dessus d'Augmentic
Solo (99 $) : on se justifie par le diagnostic et le juge tracking. Agence est au niveau
d'Augmentic Team (399 $) et sous Convert / Mida (299–420 $ **sans** génération de variantes ni
diagnostic). Régime s'aligne sur AgentMark (500–2 000 $) et Shoplift Managed (699 $).

**Crédits : en coulisse, pas à l'écran.** Chaque diagnostic coûte un appel modèle (`claude -p`,
~87 s par page). Un plafond de diagnostics par mois protège la marge, mais on ne l'affiche pas
en « crédits » (Mutiny, Kameleoon, Replo le font ; le buyer y lit une taxe). **À mesurer
d'abord : le coût réel d'un diagnostic et d'une variante.**

**Remise annuelle** : 20–25 %, c'est la norme partout (Unbounce, Shoplift, Swipe Pages,
Augmentic). Elle attaque directement le churn mensuel SMB.

---

## 5 · La distribution : les 3 500 buyers du partenaire

- **Commission partenaire, ce que le marché paie** : Unbounce 25–35 % pendant 12 mois (+ 20 %
  de remise pour le filleul) ; beehiiv 50–60 % pendant 12 mois. **Proposition : 30 % pendant
  12 mois**, remise filleul 20 % sur 3 mois, et un code dédié pour mesurer.
- **L'entonnoir à tenir pour la cible YC (15–30 buyers actifs au 2 novembre)** : 3 500 lecteurs
  → ~35 % d'ouverture → ~5 % de clic → ~60 inscrits à l'Atelier → 25–50 % activés (un diagnostic
  vu) → **15–30 actifs**. Ordre de grandeur, pas une prévision : à remplacer par les vrais
  taux de la newsletter.
- **Ce qu'on met dans la newsletter** : pas « essayez LPWS », mais **l'audit gratuit** —
  « collez l'URL de votre LP, on vous dit si votre gclid survit ». La sonde existe déjà
  (redirection monday.com qui perd les paramètres, `docs/journal/kusaila.md`).
- **La vente founder-led d'AgentMark est à copier** : « apportez une annonce, 20 minutes,
  repartez avec la variante ». Chez nous : l'Atelier en visio, sur la page de son client.
- **La boucle virale** : le rapport « À transmettre au client » marqué LPWS en Solo arrive
  chez le client final ; le client final a souvent d'autres agences.

Marché adressable pour mémoire : 200 000+ agences dans le monde, 71 000 en Amérique du Nord,
87 % sous 50 personnes (Promethean 2026) ; logiciel CRO ~1,7 Md$ en 2025 (FMI, estimation de
cabinet — fiabilité faible).

---

## 6 · Ce qu'on pourrait ajouter, branché sur les autres tâches

Chaque module : ce qu'il vend · ce qui existe déjà · la tâche qu'il mobilise · priorité.

### 6.1 · À faire maintenant (acquisition, presque gratuit à construire)

| Module | Ce qu'il vend | Déjà là | Tâches | Palier |
|---|---|---|---|---|
| **Audit tracking gratuit** | « votre gclid survit-il ? », Consent Mode, pixels, redirections, `noindex` | `deploy/check.ts`, la sonde de redirection, `1_acquire` | `3.2`, `1.1.1` | Atelier |
| **Calculateur « peut-on conclure ? »** | trafic + taux actuel → durée, écart détectable | rien, mais c'est une formule | **`4.2`** (à remonter) | Atelier → tous |
| **Rapport client** | le livrable hebdo du buyer, prêt à envoyer | « À transmettre au client » dans l'UI | `3.4`, `4.1` | Solo (LPWS) / Agence (marque blanche) |

### 6.2 · À faire pour justifier le récurrent (rétention)

| Module | Ce qu'il vend | Déjà là | Tâches | Palier |
|---|---|---|---|---|
| **Surveillance de page** | alerte si le tracking casse, si le LCP monte, si la page change (re-liage) | `relink.ts`, `lcp.ts`, le juge de la balise qui vérifie chaque minute | `1.1.3` (versionner les captures), `3.2` | Solo hebdo / Agence quotidien |
| **Alerte annonce ↔ page** | « la créa a changé, la page ne suit plus » — l'alignement continu | concordance annonce → page jugée | **`3.3`** (dernier point), `2.2` | Agence |
| **Alerte AI Max / Meta** | « Google envoie 40 % de vos clics ailleurs que sur la page testée » | rien | `3.3` (lecture Google Ads), `4.2` | Agence |
| **Mémoire du client** | ne jamais re-proposer une hypothèse perdue ; historique à montrer | refus déjà stockés | `4.1`, `4.3` | tous — c'est le **coût de départ** du buyer |

### 6.3 · Les modules premium (montée en gamme)

| Module | Ce qu'il vend | Déjà là | Tâches | Palier |
|---|---|---|---|---|
| **Intention** | une variante par intention de recherche (prix, alternative…) | `engine/intent/` (import, 7 intentions, ValueTrack) | `lpws_kw` dans le tag, mesure intention × variante | Agence |
| **Natif Shopify** | tout le catalogue, panier intact ; distribution par l'App Store (0 % jusqu'à 1 M$) | spike Dawn validé hors ligne | **`1.3`** (compte Partner, bloqué) | Régime ou app à part |
| **Intégral** | tout changer, `compose` compris, sans clignotement | idée seulement | `1.4` option A | Régime |
| **Stratège LPWS** | « on le fait pour vous », comme AgentMark (+1 000 $) et Shoplift Managed (699 $) | le brain fait 80 % du travail | `2.7` (confiance mesurée avant de la vendre) | option |
| **Tests d'offre e-com** | prix, livraison, remise, bundle — ce qu'Intelligems facture 112–349 $ | rien | `2.3` famille e-com, `1.3` | plus tard |

### 6.4 · À ne pas vendre (encore)

- **« Le système apprend de tous les clients »** (`4.4`) : fragile statistiquement et
  juridiquement, déjà écarté dans la feuille de route. Au mieux, plus tard, des **repères
  anonymisés** (« sur 40 pages SaaS, ce type de test a gagné 3 fois ») une fois `4.5` en place.
- **Paiement à l'uplift** : 1 test sur 5 conclut ; attribution contestable. À la rigueur, une
  **garantie** (« si aucun test n'est lancé en 30 jours, le mois est offert »), pas un partage
  de revenu.
- **Le pourcentage de la dépense publicitaire** : c'est le modèle de l'agence — on
  deviendrait son concurrent.

---

## 7 · Juridique et conformité qui touchent le modèle (`3.6`)

- **Mandat écrit** du buyer sur la page de son client : à intégrer à l'inscription (case +
  conditions), pas en option. C'est aussi ce qui distingue l'Atelier d'un outil de scraping.
- **Google Search — tests et cloaking** : Google tolère les tests A/B tant que Googlebot n'est
  pas traité à part (pas de détection de robot) et que le test est temporaire. Express répartit
  **tous** les visiteurs — le `gclid` d'abord, un identifiant aléatoire sinon — donc du trafic
  organique, et Googlebot, peuvent voir la variante : c'est conforme si on ne cible jamais le
  robot. À vendre comme une garantie : pas de ciblage de user-agent, test borné dans le temps,
  arrêt en un clic ; option « trafic payant seulement » à étudier pour les clients SEO.
- **Google Ads — Destination mismatch** : une redirection vers un autre domaine est refusée.
  Express reste sur le domaine du client (✅). **Intégral** devra le rester aussi (relais sur le
  même domaine, pas de sous-domaine LPWS) — contrainte d'architecture pour `1.4`.
- **RGPD / DPA** : le rapport client et la surveillance manipulent des données de performance ;
  un DPA type est à prévoir dès le palier Agence (Mutiny ne le propose qu'en Enterprise : c'est
  un argument pour nous en Europe).

---

## 8 · Les décisions à prendre, dans l'ordre

1. **Valider l'unité « client actif / mois »** : 10 entretiens buyers (réseau du partenaire) +
   une question Van Westendorp dans la newsletter (« à quel prix par client ce serait trop
   cher / une affaire ? »). → `3.5`
2. **Mesurer le coût d'un diagnostic et d'une variante** (appels modèle, box, Vercel) avant de
   figer les plafonds. → `3.5`, `2.5`
3. **Sortir l'audit tracking et le calculateur en outils publics** : ce sont les deux entrées de
   l'entonnoir. → `3.2`, `4.2`
4. **Comptes, clients multiples, droits** : sans eux, pas de facturation par client. → `3.4`
   (multi-compte, auth) — devient **bloquant pour vendre**.
5. **Stripe + essai** : 14 jours sans carte est la norme (Unbounce, Augmentic, Swipe Pages,
   Personizely) ; l'Atelier gratuit peut le remplacer.
6. **Contrat partenaire** : 30 % × 12 mois, code dédié, un numéro de la newsletter
   consacré à l'audit gratuit.
7. **Débloquer Shopify** (`1.3`) : ouvre à la fois le palier Régime et un canal (App Store).

---

## Sources (consultées le 2026-09-28)

- Unbounce — https://unbounce.com/pricing/ · partenaires : https://unbounce.com/partner-program/ · Smart Traffic : https://documentation.unbounce.com/hc/en-us/articles/360036411591-What-is-Smart-Traffic
- Instapage — https://instapage.com/plans · https://marketerschoice.com/instapage-pricing-2026/ (secondaire)
- Swipe Pages — https://swipepages.com/pricing/ · https://swipepages.com/solutions/industry/agencies/
- LanderMagic — https://www.landermagic.com/pricing
- Convert — https://www.convert.com/compare-convert-plans-detailed/
- Mida — https://www.mida.so/pricing
- VWO — https://vwo.com/pricing/
- Kameleoon — https://www.kameleoon.com/v/IcvPoU8ffiZA7_av/plans
- AB Tasty — https://www.abtasty.com/pricing (chiffres Vendr rapportés en secondaire)
- Optimizely — https://support.optimizely.com/hc/en-us/articles/4410289753485-Learn-about-plan-options-and-costs
- Webflow Optimize — https://webflow.com/pricing · https://webflow.com/feature/optimize
- Shoplift — https://www.shoplift.ai/pricing
- Intelligems — https://apps.shopify.com/intelligems
- Replo — https://www.replo.app/pricing
- Personizely — https://www.personizely.net/pricing
- CustomFit.ai — https://www.customfit.ai/pricing
- Augmentic — https://www.augmentic.app/
- AgentMark — https://www.agentmark.ai/
- Fibr AI — https://fibr.ai/pricing
- Coframe — https://rightaichoice.com/tools/coframe (secondaire, pas de prix publié)
- Mutiny — https://www.mutinyhq.com/pricing
- Uplane (YC F25) — https://www.ycombinator.com/launches/Odk-uplane-replace-your-marketing-agency
- Google AI Max — https://support.google.com/google-ads/answer/15909989
- Meta Optimize website destination — https://www.linkedin.com/posts/mrahmey_meta-quietly-rolled-out-a-new-feature-called-activity-7358874515688280064-XwqZ (secondaire)
- Google Search, tests A/B — https://developers.google.com/search/docs/crawling-indexing/website-testing
- Google Ads, Destination mismatch — https://support.google.com/adspolicy/answer/16428020
- Google Ads API, niveaux d'accès — https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- Shopify, partage de revenu — https://shopify.dev/docs/apps/launch/distribution/revenue-share
- Frais d'agence Google Ads — https://sproutbox.co/google-ads-agency-pricing-management-fees
- Coût d'une landing page — https://eseospace.com/blog/how-much-does-a-custom-landing-page-cost-pricing-for-freelance-agency-and-diy/
- CRO productisé — https://www.gogochimp.com/services · https://conversionrate.store/
- Reporting marque blanche — https://clientplug.io/white-label-reports · https://www.oviond.com/pricing/
- Stape — https://stape.io/price
- Taux de tests gagnants — https://www.conversionteam.com/ab-test-win-rate/
- Churn SMB — https://churntools.com/churn-rate-by-size/smb
- Intercom Fin (prix au résultat) — https://fin.ai/help/en/articles/13975800-fin-pricing-outcomes
- beehiiv partenaires — https://www.beehiiv.com/partners
- Agences dans le monde — https://prometheanresearch.com/digital-agency-industry-report/
- Marché CRO — https://www.futuremarketinsights.com/reports/conversion-rate-optimization-software-market
