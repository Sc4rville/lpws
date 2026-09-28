<!--
  Transcription markdown du rapport publié en artifact le 2026-09-18 :
  https://claude.ai/code/artifact/6dfa3555-87f7-4d35-a043-137d24a32f02
  Version longue (détail conservé). Une version condensée est partie à Ylan sur Signal.
  Récupéré et converti le 2026-09-19. La mise en page riche est dans l’artifact ;
  ce fichier existe pour lire, annoter et apprendre hors ligne.
-->

**Recherche métier · LPWS**

# Le media buyer face à un outil de test de landing page

> Qui il est, ce qu'il demande dans les trente premières secondes, avec quels mots il le demande — et ce que les outils du marché lui répondent déjà.

**Sujet** — l'utilisateur de l'interface, pas l'acheteur **Sources** — docs produit Google Ads, Unbounce, Instapage, VWO, Optimizely, AB Tasty **Statut** — envoyé à Ylan

---

## A — Portrait

> Il vit dans les comptes pub tous les jours ouvrés, à lire des chiffres et prendre des décisions avec de l'argent réel en jeu.

Sa journée a une forme fixe : le matin, performance contre cible — CPA, ROAS, CPL. À midi, il lance des tests créa et réalloue. L'après-midi, budgets et enchères. En fin de journée, reporting et plan du lendemain. Sa vraie boucle est hebdomadaire : il *kill* les perdants, *scale* les gagnants, lance de nouveaux tests, rééquilibre.

**En agence**

5 à 20 comptes, reporting formalisé, accès délégués — GTM, Google Ads. C'est le cas où il peut agir seul.

**En freelance**

Plusieurs campagnes pour différents clients en simultané, suivi Trello ou Asana. Il vend des insights et des recommandations.

**En interne**

Un seul site, des accès plus larges — mais il dépend de la DSI pour tout ce qui touche au serveur.

**Niveau technique**

À l'aise avec pixel, GTM, UTM, conversions. Pas avec le DOM, le CSS, le DNS.

### Le fait structurant

Il n'est presque jamais propriétaire de la landing page. Le glossaire Ades la définit littéralement comme « la page sur laquelle tu rediriges les clics » — une page qu'il n'a pas construite, sur laquelle il n'a pas la main, et dont il porte pourtant le taux de conversion. Tout le produit se joue là.

### Sa hiérarchie de KPI

CPA et ROAS — ou CPL — d'abord. Puis volume de conversions et dépense. Puis CVR. Puis CTR, CPC, CPM, fréquence. Le Quality Score en dernier. Ce que le client lui reproche, c'est le revenu et la qualité des leads.

**Ce qui le réveille la nuit**

- Une conversion qui passe en (not set)
- Un gclid perdu en route
- Un CPC qui monte parce que la page a ralenti

**Ce dont il se fiche**

- Comment le HTML est modifié
- La stabilité des sélecteurs
- Le nom des règles internes
- La méthode statistique exacte

Il parle franglais sans y penser : *scaler*, *cut*, *créa*, *LP*, *winner*, *tracking*, *CPA*, *ROAS*. Et son livrable, au bout du compte, c'est un rapport hebdo ou mensuel qui répond à une seule question : sommes-nous dans les clous, rentables, en croissance ?

---

## B — Les dix questions, dans l'ordre où il se les pose

> L'ordre est le résultat, pas la présentation : il commence par vérifier que l'outil ne casse rien, et ne parle de résultats qu'en septième position.

1. Est-ce que ça casse mon tracking — gclid, pixel, conversions ?
2. Est-ce que la page va ralentir, et donc mon Quality Score et mon CPC ?
3. Qu'est-ce que j'ai besoin de demander au client — accès, DNS, Shopify — ou est-ce que je peux le faire seul ?
4. Est-ce que je peux voir la variante avant qu'un euro soit dépensé, et la montrer au client ?
5. Quel pourcentage du trafic va sur la variante, et je peux le changer ?
6. Je peux arrêter en un clic si ça se passe mal ?
7. Qui gagne, avec quelle confiance, et j'ai assez de données ?
8. Combien de temps encore avant de conclure ?
9. Quel CPA et quel CVR avant-après je peux mettre dans mon rapport client ?
10. Que teste-t-on ensuite ?

> Les trois premières sont des questions de risque. Tant qu'elles ne sont pas répondues à l'écran, il ne regarde pas le reste.

---

## C — Vocabulaire

> Colonne de gauche : nos mots. Colonne de droite : les siens. Les termes barrés n'ont aucune traduction — ils n'existent pas dans son monde et ne doivent pas apparaître à l'écran.

| Interne (LPWS) | Ce qu'il dit |
| --- | --- |
| ancre / empreinte data-lpws | n'existe pas — au mieux « l'élément », « le bloc » |
| règle kb-38, schéma zod | n'existe pas |
| masque anti-clignotement | la page ne clignote pas · pas de flicker |
| témoin / baseline | l'original, le contrôle, la version A · Kameleoon : page d'origine · Unbounce : Champion |
| variante | la variante, la version B, le test · Unbounce : Challenger |
| hypothèse | ce qu'on teste et pourquoi |
| capture / clone | la copie de la page, le snapshot |
| répartition d'exposition | le split, 50/50, le trafic · traffic weight |
| significativité / p-value | c'est significatif ? la confiance, fiable |
| uplift relatif | le lift, +X % · Optimizely : Improvement |
| conversion primaire | la conv, le lead, l'achat, l'objectif |
| identifiant de clic préservé | le gclid passe, le tracking est intact |
| tag GTM / relais DNS / template Shopify | le tag, le CNAME, le thème Shopify |
| arrêt / rollback | on coupe, on stoppe, on remet l'original |
| promotion du gagnant | on déploie le winner, on scale · Unbounce : Promote to Champion |
| Final URL | la Final URL, l'URL de destination — il l'écrit tel quel |
| CVR | le taux de conv |

---

## D — Ce qu'on affiche en premier, ce qu'on relègue

> Le principe vient des rapports d'agence : « Lead with the KPIs and metrics important to your stakeholders, and clear the clutter for everything else. »

### Le tableau de bord, liste des tests

Calqué sur le scorecard Google Ads (Clicks, CTR, Cost, Impressions, All conversions, avec la différence estimée en deuxième ligne) et sur Optimizely (Visitors, Conversions, Conversion Rate, Improvement, Statistical Significance). Par ligne : nom du client et de la page, statut en langage humain, CVR original contre variante, lift, confiance, conversions par version, jours écoulés et restants — plus deux voyants.

### La page d'un test

Les deux aperçus côte à côte, original et variante, avec **ce qu'on teste et pourquoi** en une phrase au-dessus. Puis le verdict, le split, et trois boutons : Arrêter, Déployer le gagnant, Remettre l'original. Un lien d'aperçu partageable. Et les garde-fous rendus visibles : le gclid passe, le poids ajouté en millisecondes, le consentement respecté.

**Au premier écran**

- Statut en langage humain
- CVR original vs variante, lift, confiance
- Conversions par version · jours restants
- Voyants tracking et vitesse
- Aperçus côte à côte · lien partageable
- Arrêter / Déployer / Remettre l'original

**Onglet « Détails techniques »**

- Ancres et empreintes
- Diff HTML
- Méthode de calcul
- Logs de capture
- Notes d'honnêteté du meta.json
- Versions de règles, hash de la baseline

---

## E — Comment les concurrents présentent un test

> Six produits, six manières de dire la même chose. Le vocabulaire est déjà stabilisé sur le marché — autant s'y aligner plutôt qu'en inventer un septième.

### Google Ads — Custom experiments

- **Réglage** — « Experiment split » — « We recommend using 50% to provide the best comparison ». Cookie-based recommandé plutôt que search-based. Jusqu'à deux objectifs.
- **En cours** — Chaque métrique sur deux lignes : la valeur de l'expérience, puis la différence estimée sous forme d'intervalle — « if you notice [+8%, +12%], it means that there might be anywhere from a 8% to 12% increase ». Au survol : « There's a 95% chance that your experiment notices a +10% to +20% difference for this metric. »
- **Trop tôt** — Sous 100 conversions, la valeur affiche ‑‑ et le message passe à *collecting data* en cours, *not enough data* une fois terminé.
- **Significatif** — « you'll also find a blue asterisk ». Méthode assumée : « Two-tailed significance testing is then run using the 95% confidence interval. »
- **Fin** — Deux boutons, *Apply* pour appliquer à la campagne, ou *End* / *End now*.
- **Garde-fou** — Alerte « Website redirects are losing click data », et « you or your IT personnel will need to change the server behavior to forward the GCLID ». Leur propre outil de test de LP « doesn't support any form of URL redirects including JavaScript-based redirects ».
### Unbounce

- **Vocabulaire** — « the original version is your champion by default » ; les nouvelles versions sont des *Challenger*. Un *Weight* par variante, dont la somme doit faire 100.
- **Cohérence** — Le visiteur « will always see the same variant, even if they return later ».
- **Résultat** — Un *confidence rating* dans l'A/B Test Center, test du chi-carré, seuil usuel 95 %. Durée recommandée : « four full weeks, with a minimum of 100 conversions (preferably closer to 200) on each variant and a 95% confidence level ».
- **Fin** — *Promote to Champion* puis *Republish* ; les variantes inactives sont archivées.
- **Smart Traffic** — L'anti-thèse commerciale : « After as few as 50 visits, Smart Traffic has enough information to start routing visitors » · « You don't have to wait for results » · « 30% more conversions ». Le rapport affiche un *Lift Percentage* qui compare le CVR obtenu à celui qu'aurait donné un split aléatoire.
### Instapage

- **Réglage** — Un poids par variante, illustré littéralement : « three variations with 35%, 40%, and 25% splits… 10,000 visitors… approximately 3,500, 4,000, and 2,500 ». On peut *pause a variation* en cours de route.
- **Fin** — « you will be asked to choose a winning variation, and the one you pick will be the only variation that remains live on the URL ».
- **Promesse** — « Run A/B tests without page loading delays. » Les libellés exacts des colonnes de résultats n'ont pas pu être vérifiés — page en 403.
### VWO

- **Métrique** — « The probability that a variation will perform better than the control » — expliqué au lecteur : « a chance of 60% means that the variation is likely to perform better than the control 60% of the time ».
- **Décision** — Le *Smart Decision* apparaît « when its potential loss is below the threshold of caring and its Probability to beat baseline is greater than or equal to 95% », et se retire « if the Probability to beat baseline goes below 90% ».
- **Minimums** — 25 conversions par variante, 1 500 visiteurs sur le test, et au moins une semaine de durée.
### Optimizely

- **Métriques** — « Improvement: The relative improvement in conversion rate for the variation over the baseline as a percentage » et « Statistical Significance: the statistical likelihood that the improvement is from changes you made, not chance ».
- **Trop tôt** — Tant que le seuil n'est pas atteint, la page affiche qu'il faut plus de visiteurs, avec un temps d'attente estimé — *visitors remaining*.
### AB Tasty

- **Métrique** — « the odds of a strictly positive gain on a variation compared to the original version ».
- **Lecture** — Au-dessus de 95 %, la variante « can be implemented with what is considered to be low risk (5% or less) ». En dessous de 5 %, elle « shouldn't be implemented ». Autour de 50 %, c'est neutre. L'intervalle est explicité : « we are 95% confident that the true value of the gain is situated between the two values ».
- **Minimums** — 5 000 visiteurs et 500 conversions par variante.
### Meta Ads — Experiments

- **Seuil** — 90 % par défaut selon l'auteur du guide Convert, avec l'option *End test early if a winner is found* explicitement déconseillée.
- **Piège** — Le CVR n'est pas une métrique standard chez Meta — il faut le reconstruire en métrique custom, Purchases divisé par Link Clicks.
---

## F — L'installation vue par lui, voie par voie

> La seule question qui compte au moment de l'installation : est-ce que je peux le faire seul, ou est-ce que je dois déranger le client ?

### Tag GTM

> S'il a déjà l'accès — cas fréquent en agence. Sinon il envoie au client : tagmanager.google.com → conteneur → User Management → Add Users → son email → permission Publish → Invite.

Une seule balise, aucune modification de ton site, tu peux la retirer à tout moment. Le gclid et tes conversions ne sont pas touchés. Poids ajouté : X ms.

Ne pas masquer toute la page pendant le chargement. « Anti-flicker snippets increase your Largest Contentful Paint » — et un LCP dégradé, c'est une landing page experience *Below average*, donc un CPC plus cher. Le remède coûte plus que le mal.

### Relais DNS

> Il ne peut pas le faire seul, jamais. Le standard du marché : Unbounce fournit un CNAME à copier avec auto-configuration GoDaddy et IONOS via Entri ; Leadpages fait de l'*Auto-configure DNS* via Domain Connect ; sinon des instructions par registrar.

Ce qu'il faut pouvoir lui mettre entre les mains, en un bouton : une fiche à transmettre à l'hébergeur ou au dev — ajouter un CNAME lp.client.com → x.lpws.app, rien d'autre ne change, retour arrière = supprimer l'enregistrement.

Votre site principal n'est pas touché. Seule cette adresse est relayée.

### Template Shopify

> Accès collaborateur : le client fournit son URL myshopify.com et un code à quatre chiffres — le *collaborator request code* — puis approuve dans Settings → Users → Accept request.

Un thème dupliqué, l'original reste publié. On ne touche ni au checkout ni aux commandes.

### Dans les trois cas

Un lien d'aperçu partageable avant de dépenser un euro — Instapage vend la revue et l'approbation par commentaires, Unbounce des commentaires on-page. Un contrôle automatique qu'un ?gclid=test arrive intact sur la page finale. Et sur le consentement : s'aligner sur la CMP du client. L'exemption CNIL « mesure d'audience et A/B testing » — position de 2020, sous conditions d'information et d'opposition — est contestée par d'autres sources, donc on ne la promet pas dans l'interface.

---

## G — Quinze formulations à reprendre telles quelles

> Écrites dans ses mots, prêtes à poser dans l'interface.

- Lancer le test — *variante : Mettre en ligne la variante*
- Arrêter le test — l'original reprend 100 % du trafic
- Voir l'aperçu — *et : Envoyer le lien d'aperçu au client*
- Trafic : 50 % original · 50 % variante — *avec un curseur, pas un champ*
- Pas encore assez de données — continuez, il manque environ N conversions
- En cours : X jours écoulés, encore ~Y jours au rythme actuel
- Gagnant probable : variante B, +18 % de conversions, confiance 96 %
- Résultat neutre : aucune différence mesurable avec ce trafic
- Déployer le gagnant — *et son symétrique : Remettre l'original*
- Tracking intact : le gclid arrive sur la page, vos conversions Google Ads ne changent pas
- Page pas ralentie : +X ms, pas de clignotement
- Ce qu'on teste : titre plus direct. Pourquoi : la promesse actuelle ne reprend pas l'annonce
- CPA : 42 € → 35 € sur la période du test
- Rien à installer côté client : une balise GTM, retirable en un clic
- À transmettre à votre développeur — *bouton qui copie les instructions DNS ou Shopify*

---

Recherche métier LPWS · version longue, détail conservé. Une version condensée a été envoyée à Ylan sur Signal.

---
