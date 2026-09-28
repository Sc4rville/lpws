# Engine — la machine LPWS

Tout le code exécutable vit ici, rangé par **familles** (une famille = un maillon du
workflow produit), chaque famille par **étapes numérotées** (l'ordre du pipeline se lit
dans l'arborescence).

```
engine/
  shared/     socle transverse, un seul exemplaire de chaque mécanique commune :
                paths · campagne (disposition sur disque + Test) · log · cli (args)
                json (lecture validée zod) · modele (claude -p au contrat) · mime · http
                navigateur (Chromium, shim __name, origine synthétique, hors ligne)
  viewer/     le cockpit local — comparer live/clone, suivre les captures, voir les variantes
  clone/      FAMILLE 1 — url du client → baseline fidèle, marquée, jugée   ← en cours
  apply/      FAMILLE 2 — hypothèse + éditions ancrées → variante prouvée   ← en cours
  variant/    FAMILLE 3 — le brain : page + annonce → diagnostic → 3 variantes ← en cours
  measure/    FAMILLE 5 — GA4 → conversions par version → le verdict        ← en cours
  deploy/     FAMILLE 4 — variante validée → page publiable et jugée        ← en cours
  intent/     BRIQUE À PART — termes de recherche Google Ads → intentions   ← fondations
              (alimente le brain et, plus tard, la répartition du tag)
  audit/      l'audit tracking gratuit : gclid, balises, Consent Mode, LCP
  surveille/  la vraie page relue : relevés datés, alertes, annonce ↔ page
  compte/     paliers, essai, mandats, Stripe optionnel, coût des diagnostics
  rapport/    le rapport client HTML (LPWS ou marque blanche)
```

Le workflow produit complet est dans le [readme racine](../readme.md) ; la carte
d'ensemble et les conventions détaillées dans [docs/architecture.md](../docs/architecture.md).

## Les règles de la maison

1. **Règle des natures** — *mécanique = script, réflexion = skill.* Tout le déterministe
   (rendu, téléchargement, diff, réécriture) est du code ici. Les moments de jugement
   (typer une section, produire un plan d'édition) sont faits par Claude via les skills
   ([.claude/skills/](../.claude/skills/)), et leur sortie est **validée par un schéma**
   avant d'être écrite.
2. **Généalogie lisible** — une famille = un dossier + un `readme.md` (contrat, étapes,
   définition de « fini »). Des étapes numérotées. Un fichier = un rôle, dit en tête de
   fichier. Un dossier n'existe que quand il a du contenu.
3. **Ancres, jamais de réécriture libre** — tout ce qui édite du HTML passe par les ancres
   `data-lpws` posées à la capture. Aucun LLM ne réécrit du HTML directement.
4. **Le juge avant la finesse** — chaque famille embarque sa vérification ; un résultat
   non vérifié n'est pas un résultat. Les rapports disent aussi ce qui a échoué ou manque
   (notes d'honnêteté dans les `meta.json`).
5. **Sorties hors du code** — l'engine écrit uniquement sous [clients/](../clients/)
   (gitignoré) : le repo reste le code + la doc, jamais la donnée.
