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

**Mesuré sur `hubspot.com/products/marketing`** (page jamais marquée) : cible retrouvée par
empreinte, 1/1 édition posée au bon endroit, **masque 39 ms**, témoin à 0 édition, aperçu
fonctionnel à 0 % de trafic, bouton stop effectif.

Le chrono est pris **dans** le tag, autour des vraies opérations DOM : un observateur extérieur
regroupe ses lots et rendait 0 ms alors que le masque avait bien été posé.
