# Architecture LPWS

> La vision produit (contexte, problème, workflow cible) est dans le [readme racine](../readme.md).
> Ici : comment le repo est construit, et comment on l'étend sans le rendre illisible.

## Vue d'ensemble

```
lpws/
  readme.md · CLAUDE.md   vision produit + démarrage · rituels de travail
  session.md              où on en est, à faire (court, réécrit à chaque session)
  engine/                 LA MACHINE — code exécutable, par familles (carte : engine/readme.md)
  ui/                     l'interface du media buyer (serveur, écran, démo) + design.md
  docs/                   ce dossier
    architecture.md       conventions & décisions actées
    feuille-de-route.md   l'arbre des tâches et leur état
    corpus.md · brain.html  le corpus de pages de référence · la carte du marketing brain
    recherche/            rapports et briefs de recherche (business model, media buyer, v1, v2)
    journal/              les journaux des contributeurs (kusaila, scarville)
  scripts/menage.ts       le garde-fou de rangement (npm run menage, en CI)
  scripts/verif.ts        la CI en local (npm run verif) : à passer avant chaque merge
  clients/                LES SORTIES — data par client/campagne, gitignoré
  .claude/                skills (la réflexion) + hook du brief de session
```

Trois plans, trois responsabilités :

| Plan | Contient | Versionné |
|---|---|---|
| `engine/` | le déterministe (scripts) | oui |
| `.claude/skills/` | le jugement (instructions Claude) | oui |
| `clients/` | la donnée produite | non |

## Le pipeline produit et où il vit

```
media buyer donne l'url de la LP du client
   │
   ▼
┌ clone ────────────────────────────────────────────┐
│ 1_acquire   rendu headless + marquage data-lpws   │  ✅
│ 2_styles    css self-contained                    │  ✅
│ 3_assets    images/fonts rapatriés, <base> ôtée   │  ✅
│ 4_structure page.json (sections + slots ancrés)   │  🔜 (schéma posé)
│ 5_verify    le juge : diff vs live + santé        │  ✅
└───────────────────────────────────────────────────┘
   │  baseline/ fidèle, marquée, jugée
   ▼
┌ variant ┐ → ┌ apply ┐ → ┌ deploy ─────────────────┐ → ┌ measure ┐
│ brain : │   │ édits │   │ Express (tag GTM)   ✅  │   │ GA4 →   │
│ diagnos.│   │ ancrés│   │ Intégral (DNS)      🔜  │   │ verdict │
│ → 3 var.│   │       │   │ Natif (Shopify)     🔜  │   │         │
└─────────┘   └───────┘   └─────────────────────────┘   └─────────┘
     ✅            ✅                                         ✅
```

## Conventions (les tenir, c'est ça qui garde le repo lisible)

- **Familles numérotées en étapes** : `1_`, `2_`… — l'ordre du pipeline se lit dans `ls`.
  Un trou dans la numérotation = étape pas encore construite, documentée dans le readme
  de la famille avec 🔜.
- **Un readme par famille** : contrat (entrée → sortie), tableau des étapes avec état,
  définition de « fini », choix de conception avec leurs raisons, limites connues.
- **Un fichier = un rôle**, énoncé dans le commentaire de tête. Si le commentaire de tête
  devient un paragraphe de « et aussi », le fichier doit être découpé.
- **Pas de dossier vide, pas de stub** : un dossier naît quand il a du contenu. Les étapes
  futures existent dans les readmes, pas en squelettes de fichiers.
- **Les contrats d'abord** : les schémas (zod) des données échangées entre familles sont
  posés avant le code qui les produit — ex. [`clone/4_structure/schema.ts`](../engine/clone/4_structure/schema.ts).
- **Honnêteté mécanique** : chaque `meta.json` embarque ses notes d'honnêteté (ce qui est
  approximé, pas capturé, pas encore construit). Un rapport qui ne dit pas ses limites est
  un rapport faux.

## Décisions actées

| Décision | Raison |
|---|---|
| Repo autonome (pas de dépendance à lastwebstudios) | besoins frontalement divergents (garder la marque vs la stripper) ; ne pas coupler à la prod LWS |
| Héritage LWS minimal : overlays + juge + règle des natures | c'est le battle-tested ; le reste (leadengine, composer…) ne concerne pas LPWS |
| Tout TypeScript + Playwright | une seule stack, Chromium fait rendu/screenshots/interception |
| Ancres `data-lpws` posées à la capture | round-trip déterministe ; jamais de réécriture libre du HTML |
| Diff visuel vs live comme critère de « fini » | mesurable, pas discutable |
| Réflexion via skills, zéro clé API | Claude fait le typage/les plans ; sortie validée par schéma |
| Capteur / raisonnement séparés | le modèle constate un fait, la règle explique pourquoi il compte. Chaque signal est une **question indépendante au type de sortie déclaré** (booléen / choix / échelle) + confiance : testable seule, jugeable contre un corpus, extracteur interchangeable |
| Vérifier le juge avant d'accuser le code | sur les sept corrections du tag (9/9), quatre étaient dans le juge : un instrument non vérifié ment avec autorité |

## Étendre la machine (checklist)

1. Nouvelle **étape** d'une famille : créer `n_nom/`, la brancher dans le `run.ts` de la
   famille, mettre à jour le tableau du readme de la famille.
2. Nouvelle **famille** : dossier + `readme.md` (contrat/étapes/« fini ») + `run.ts` +
   script npm + ligne dans `engine/readme.md` et dans ce fichier.
3. Nouveau **moment de réflexion** : un skill dans `.claude/skills/<nom>/SKILL.md` + un
   schéma zod qui valide sa sortie côté engine.
