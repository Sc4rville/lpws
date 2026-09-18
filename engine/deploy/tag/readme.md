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

## État réel, vérifié sur DEUX sites, trois chargements chacun

| | HubSpot (`/products/marketing`) | Jira (`atlassian.com/software/jira`) |
|---|---|---|
| verdict | **VALIDE** | **VALIDE** |
| fiabilité | **3/3** chargements appliquent | **3/3** chargements appliquent |
| mode | piloté | figé (CSP du site) |
| config servie | **0,4 Ko** | **0,7 Ko** |
| masque médian | 79 ms | 2 155 ms |
| la cible apparaît d'elle-même à | 76 ms | 2 306 ms |
| **retard ajouté** | **3 ms** | **0 ms** |

**Le bon chiffre n'est pas la durée du masque, c'est le retard AJOUTÉ.** Sur Jira le titre du
hero est fabriqué par le JavaScript du site et n'existe qu'à ~2,3 s : masquer jusque-là ne
retarde rien, on révèle au moment où la page se serait affichée de toute façon. Comparer la
durée du masque à zéro faisait passer un coût nul pour une catastrophe.

**Ce qui a débloqué les sites rendus par JavaScript**, dans l'ordre où ça a compté :

| Correction | Avant | Après |
|---|---|---|
| Écouter l'insertion (MutationObserver) au lieu de sonder toutes les 50 ms | 0 édition | l'édition part au moment où l'élément entre dans le DOM, avant la peinture |
| **Budget de masque mesuré à la construction** au lieu d'une constante | 1/3 chargements | **3/3** |
| Le témoin tranche, le sélecteur n'a plus à être unique | sélecteurs fragiles au re-rendu | sélecteurs larges et stables |
| Tenir après avoir posé (le site re-rend et réécrit son texte) | variante effacée en silence | remise en place, bornée à 5 s |
| Ne s'exécuter que dans le cadre principal | 8 exécutions parallèles (iframes) | 1 |

**Ce qui reste vrai, et se dit à l'installation** : sous CSP stricte (cas de Jira) la config
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
