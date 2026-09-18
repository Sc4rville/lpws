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

## État réel, après vérification sur DEUX sites

**HubSpot** (`/products/marketing`, une édition de texte) : les quatre scénarios passent.
Cible retrouvée par empreinte, édition au bon endroit, masque 39 ms, témoin intact, aperçu
fonctionnel à 0 % de trafic, bouton stop effectif.

**Jira** (`atlassian.com/software/jira`, trois verbes dont deux sur des bandes) : **REFUSÉ**.
Et c'est ce second site qui dit la vérité sur l'architecture actuelle.

| Problème trouvé | Ce que ça veut dire |
|---|---|
| **CSP** | `connect-src` interdit notre domaine : la config distante n'arrive jamais. Le loader repasse sur la config figée, donc plus de pilotage à distance **ni de bouton stop** sans recoller le loader. Traité, mais c'est une limite du site, pas un bug |
| **Coût du rapprochement** | ~700 ms de calcul par essai dans le navigateur du visiteur (471 empreintes × 471 éléments), plus 97 à 188 Ko de charge utile. Inacceptable sur une page qu'on veut rapide |
| **Moment** | à `DOMContentLoaded` la mise en page n'est pas finie : les bandes, repérées par géométrie, n'existent pas encore. On repique, mais on masque jusqu'à 1,5 s — ce qu'on paie en LCP, donc en Quality Score |
| **Bandes** | `s5`/`s6` restent non résolues au chargement, alors que le même rapprochement est parfait (471/471) trois secondes plus tard sur la même page |

**Ce que ça dit, et c'est la vraie conclusion** : rapprocher toute la page **au moment du
chargement** est la mauvaise idée. Le rapprochement doit se faire **à la construction**, où
700 ms ne coûtent rien et où on a déjà un navigateur : on ouvre la page vivante, on résout une
fois, on en déduit un sélecteur stable par cible, on le vérifie, et on n'embarque que ça. Le
runtime redevient un `querySelector` plus un contrôle d'identité à deux champs : quelques
millisecondes, aucune charge utile, presque plus de masque.

L'empreinte ne disparaît pas dans cette refonte, elle en est le socle : c'est elle qui permet
de dériver le sélecteur, de vérifier qu'il désigne encore la bonne chose, et de le refaire
quand la page du client bouge.

Le chrono est pris **dans** le tag, autour des vraies opérations DOM : un observateur extérieur
regroupe ses lots et rendait 0 ms alors que le masque avait bien été posé.
