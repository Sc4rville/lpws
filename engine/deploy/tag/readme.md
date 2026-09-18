# La voie TAG — la variante sur la vraie page, sans DNS ni hébergement

Le visiteur arrive sur **l'URL réelle du client**. Son domaine, son suivi et son Quality Score
sont intacts, et le media buyer pose ça depuis un **Google Tag Manager auquel il a déjà accès** :
c'est la seule voie de livraison qui ne demande aucun nouvel accès à son client.

```bash
npm run tag -- <baseline> <spec.json> [...] [--part 50] [--base <url>]   # loader + config
npm run tag:check -- <baseline> <spec.json>                              # juger sur la page LIVE
```

## Deux pièces, et la séparation est tout l'intérêt

| | |
|---|---|
| `loader.js` | collé **une seule fois** dans le GTM du client, puis jamais retouché |
| `v/<client>.json` | la config servie — c'est elle qu'on change pour piloter |

Avant cette séparation, chaque variante était une balise à recréer dans GTM avec republication
du conteneur. Personne ne teste dix variantes à ce prix, et tester dix variantes est exactement
ce qu'on vend. Trois conséquences pour le media buyer :

- **bouton stop immédiat** : `actif: false` coupe tout, sans republier le conteneur ;
- **lien d'aperçu** : `?lpws=<nom>` force la variante même à 0 % du trafic — c'est le lien
  qu'il envoie à son client avant de dépenser un euro · `?lpws=off` remontre l'original ;
- la config de la dernière visite est gardée en local, donc les visites suivantes appliquent
  sans attendre le réseau (l'aller-retour du loader serait sinon son coût caché en clignotement).

## Ce que ça résout, et ce que ça coûte

| | |
|---|---|
| ✅ | zéro DNS, zéro domaine, zéro déploiement chez le client |
| ✅ | une seule Final URL : la répartition se fait dans le tag, **collante par `gclid`** — Google ne peut plus biaiser le test en réoptimisant la diffusion entre deux annonces |
| ✅ | verbes disponibles : `set`, `remove`, `move`, `swap`, `duplicate` |
| ⚠️ | `compose` **non** : c'est le seul verbe qui fabrique une section à partir du design system récolté. Pour lui, voie hébergée |
| ⚠️ | clignotement : la page est masquée le temps de poser les éditions (**mesuré**, pas supposé) |
| ⚠️ | un framework qui re-rend peut effacer nos modifications — non traité à ce stade |
| ⚠️ | `set` écrit avec `textContent` : si la phrase visée contient des balises enfant (un `<span>` coloré), elles sautent. Viser l'enfant, ou plusieurs `set` |

## Le problème que l'empreinte a débloqué

Sur la page vivante, nos ancres `data-lpws` **n'existent pas** : elles ont été posées sur notre
clone. Le tag doit donc retrouver chaque cible **par ce qu'elle est**, et il rejoue dans le
navigateur exactement le calcul du re-liage hors ligne
([`relink.ts`](../../clone/1_acquire/relink.ts), gardé pur d'imports node pour ça).

**Tout ou rien** : si une seule cible est ambiguë ou perdue, aucune édition n'est posée et le
visiteur voit la page d'origine. Une variante à moitié appliquée se jugerait comme si elle
était complète.

## Le juge (`check.ts`)

C'est le seul test de la machine qui se fait contre **le site live**, pas contre une capture :
1. l'empreinte retrouve-t-elle la cible sur un DOM qu'on n'a jamais capturé ;
2. le texte attendu est-il **réellement dans la page rendue** (on relit, on ne croit pas le tag) ;
3. combien de millisecondes la page reste masquée ;
4. **le témoin est-il intact** — une variante qui fuit sur le groupe témoin détruit la comparaison ;
5. **l'aperçu** marche-t-il à 0 % de trafic (sinon le lien de démo au client est mort) ;
6. **le bouton stop** coupe-t-il vraiment (c'est la condition de confiance du buyer).

## État réel — 18 chargements par site, mesurés

| | HubSpot (`/products/marketing`) | Jira (`atlassian.com/software/jira`) |
|---|---|---|
| **fiabilité** | **9/9** | **9/9** |
| rendu de la page | par le serveur | par le JavaScript du site |
| mode | piloté | figé (CSP du site) |
| config servie | 0,4 Ko | 0,7 Ko |
| masque médian | 30 à 109 ms | 1 091 à 2 246 ms |
| **écart de LCP avec / sans le tag** | **−8 ms** | **+8 ms** |

**Le LCP est le seul verdict de vitesse qui compte** (`npm run lcp`, tirs alternés avec et sans
le tag). Les deux écarts sont à ±8 ms, alors que le bruit propre de Jira va de 4 676 à 11 908 ms :
autrement dit, **le tag ne produit aucun effet mesurable au-dessus du bruit de la page**.

La raison tient en une phrase : sur un site rendu en JavaScript, la cible n'existe pas encore
quand le visiteur arrive. Masquer en l'attendant ne retarde rien, parce que la page n'avait
rien à afficher non plus — et le masque se lève dès que la variante est posée, jamais à
l'expiration du budget.

## Ce qu'il a fallu corriger pour y arriver

Sept corrections. Trois étaient dans le tag, **quatre étaient dans le juge** — il accusait le
tag de défauts qui étaient les siens.

| Correction | Avant | Après |
|---|---|---|
| Écouter l'insertion (MutationObserver) au lieu de sonder toutes les 50 ms | 0 édition sur Jira | l'édition part quand l'élément entre dans le DOM, avant la peinture |
| Budget de masque **chronométré** à la construction, plus une constante | 1/3 | 3/3 |
| Marge **proportionnelle** (×1,8) plutôt que fixe (+400 ms) | 8/9 | **9/9** |
| Tenir après avoir posé : le site re-rend et réécrit son texte | variante effacée en silence | remise en place, bornée à 5 s |
| Ne s'exécuter que dans le cadre principal | 8 exécutions en parallèle (iframes) | 1 |
| *(juge)* lire **après** le verdict du tag, pas à 3 000 ms fixes | 8/9 rapportés | 9/9 réels |
| *(juge)* ne plus tronquer les textes à 80 caractères | variante longue « absente » | vue |
| *(juge)* trois chargements et un taux, pas un tir unique | « valide » puis « refusé » sur la même page | fiabilité mesurée |
| *(juge)* le retard estimé devient indicatif, le LCP tranche | fausses alertes sur des chargements sains | verdict sur une mesure fiable |

**La leçon, et elle vaut au-delà de ce fichier** : la moitié des échecs venaient de l'outil de
mesure. Un juge qu'on ne vérifie pas ment avec autorité, et on passe des heures à réparer du
code qui marchait.

**Ce qui reste vrai et se dit à l'installation** : sous CSP stricte (cas de Jira) la config
distante n'arrive pas, donc le pilotage à distance ET le bouton stop demandent de recoller le
loader dans GTM. Ça se mesure avec `npm run tag:check`, ça ne se découvre pas en campagne.

## Comment la résolution marche maintenant

1. **À la construction**, on ouvre la vraie page, on la laisse se former (scroll compris), on
   marque, on relève les empreintes et on rapproche : 471/471 sur Jira.
2. On en dérive un **sélecteur CSS court, vérifié unique**. On refuse un chemin purement
   positionnel : unique sur la page finie, il désigne autre chose sur la page en formation.
   Il faut une poignée stable (id, attribut de test, classe non hachée) pour l'ancrer.
3. On **rouvre la page telle qu'elle s'ouvre** et on revérifie chaque sélecteur au budget de
   masque. Ce qui ne tient pas est refait **depuis le témoin** (rôle + texte), qui ne dépend
   d'aucune structure. Ce qui n'existe qu'après est déclaré **tardif** et signalé.
4. **Chez le visiteur** : `querySelector`, contrôle du témoin, écriture. Le sélecteur dit où
   regarder, le témoin dit si c'est bien lui.

L'empreinte n'a pas disparu, elle est le socle : c'est elle qui permet de dériver le sélecteur,
de vérifier qu'il désigne encore la bonne chose, et de le refaire quand la page du client bouge.

Le chrono est pris **dans** le tag, autour des vraies opérations DOM : un observateur extérieur
regroupe ses lots et rendait 0 ms alors que le masque avait bien été posé.
