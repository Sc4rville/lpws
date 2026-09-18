# Brique INTENT — la requête avant le clic

Ce que quelqu'un a tapé sur Google avant de cliquer dit son intention. Aujourd'hui « jira
pricing » et « how to use jira » tombent sur la même page. Cette brique lit les termes de
recherche du compte Google Ads, les range par intention, et fabrique le pont qui permettra
au tag de servir une variante différente selon l'intention.

Construite **à part** : elle ne touche ni au clone, ni au tag, ni à `apply`. Elle produit des
fichiers que le brain (famille 3) et la livraison (famille 4) sauront lire.

```bash
npm run intents -- <export.csv> --client atlassian --campagne software-jira --marques jira,atlassian
```

## Ce qu'il faut savoir avant tout

| | Au clic | Après coup |
|---|---|---|
| ce que Google donne | le **mot-clé acheté** (`{keyword}`), la correspondance, le groupe d'annonces — via ValueTrack | les **vraies requêtes**, avec clics, coût, conversions — le rapport « termes de recherche » |
| ce qu'il ne donne pas | la requête tapée (plus transmise depuis des années) | les requêtes à faible volume (masquées depuis 2020), presque tout sur Performance Max |

Le produit tient dans le **pont** entre les deux : les requêtes servent à décider quelle
intention se cache derrière chaque mot-clé ; au clic, le mot-clé suffit alors à retrouver
l'intention.

## Contrat

| Entrée | |
|---|---|
| export CSV de Google Ads | FR ou EN, UTF-8 ou UTF-16, virgule / point-virgule / tabulation — lu tel quel |
| ou la feuille remplie par [`ads-script.js`](ads-script.js) | en-têtes GAQL, nombres bruts ; le script tourne dans le compte du buyer, sans token |

| Sortie (`clients/<client>/<campagne>/intents/`) | |
|---|---|
| `termes.json` | les lignes normalisées ([`schema.ts`](schema.ts) → `Termes`) |
| `intents.json` | les groupes d'intention avec leurs chiffres, la table **mot-clé → intention**, la liste à revoir, les notes |

## Étapes

| Fichier | Rôle |
|---|---|
| [`import.ts`](import.ts) | lit l'export ; trouve l'en-tête, la langue, le séparateur ; nombres à la française ou à l'anglaise ; ignore les totaux et le dit |
| [`classify.ts`](classify.ts) | range chaque terme par motifs FR/EN, dans l'ordre : transaction · alternative · prix · comparaison · information · marque · catégorie |
| [`group.ts`](group.ts) | agrège par intention, calcule taux et CPA (null quand il n'y a pas de quoi), vote mot-clé → intention pondéré par les clics |
| [`run.ts`](run.ts) | orchestration, écriture, tableau lisible |

## Les sept intentions

| | Le visiteur | Ce qu'une variante doit lui montrer |
|---|---|---|
| **transaction** | prêt à agir — essai, démo, s'inscrire | le chemin le plus court vers l'action |
| **alternative** | veut quitter un concurrent | la migration facile, ce qu'il gagne au change |
| **prix** | le budget décide | l'offre, le gratuit, les paliers |
| **comparaison** | en train de choisir | les preuves, les avis, ce qui distingue |
| **information** | apprend, n'achète pas encore | de la valeur, un pas de plus, pas un formulaire agressif |
| **marque** | connaît déjà — parfois juste pour se connecter | souvent rien à tester : exclure les navigationnels du trafic payant |
| **catégorie** | requête générique | le défaut : à affiner avant d'en faire un test |

Le classement est **heuristique** : des motifs, un ordre de priorité, et un « je ne sais pas »
rangé à part (`aRevoir`) plutôt qu'un faux rangé avec les autres. C'est le socle sur lequel un
skill pourra affiner — sa sortie passera par le même schéma.

## Comment le tag s'en servira (pas encore câblé)

1. Le buyer colle une fois dans Google Ads le suffixe d'URL finale :
   `lpws_kw={keyword}&lpws_mt={matchtype}&lpws_ag={adgroupid}&lpws_cp={campaignid}&lpws_dev={device}`
2. Au clic, la page reçoit `?gclid=…&lpws_kw=jira+pricing&…`.
3. Le tag lit `lpws_kw`, cherche dans `motsCles` d'`intents.json` (servi dans la config),
   trouve `prix`, et ne considère que les variantes prévues pour cette intention. Le reste
   ne change pas : répartition collante par gclid, témoin, stop.
4. La mesure se fait par intention × variante : le tag pousse déjà la variante dans le
   dataLayer ; il poussera aussi l'intention.

## Limites, dites avant qu'on les découvre

- **Le volume.** Découper par intention multiplie les tests, et chacun a besoin de
  conversions. À 900 clics par jour, deux ou trois intentions tiennent, pas dix. Les notes
  d'`intents.json` signalent les groupes sous 25 conversions.
- **La longue traîne est invisible** : Google ne montre que les termes qui comptent.
- **Un mot-clé large** déclenche des requêtes de plusieurs intentions : le vote lui en donne
  une, la majoritaire en clics. Les autres sont servies « à côté ». Restructurer les groupes
  d'annonces par intention est la vraie réponse — c'est le métier du buyer, on peut le lui
  suggérer.
- [`ads-script.js`](ads-script.js) n'a **pas encore tourné** sur un vrai compte.
- [`exemple.csv`](exemple.csv) est **synthétique** : le format est celui de Google Ads, les
  chiffres sont inventés pour exercer le code.
