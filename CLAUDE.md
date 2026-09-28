# CLAUDE.md — lpws

> Une page, pas plus. Le savoir vit dans `docs/`, la machine dans `engine/`, la réflexion
> dans `.claude/skills/` — ce fichier relie et donne les rituels.

## À l'ouverture d'une session
Le hook `.claude/hooks/brief.sh` injecte automatiquement le brief : état git, `session.md`
(où on en est / à faire), verdicts des captures. **Partir de ce brief** — pas de re-scan du
repo. Pour le contexte profond : [docs/architecture.md](docs/architecture.md) (conventions,
décisions actées), [engine/readme.md](engine/readme.md) (carte de la machine).

## Rituels
1. **Fin de session ou d'itération substantielle** : mettre à jour `session.md` — COURT
   (où on en est / fait / à faire / blocages), puis commit en français, message riche
   (c'est lui l'historique : `session.md` n'accumule jamais, il se réécrit).
2. **Propreté permanente** : rien ne traîne au root ; kebab-case partout ; fichiers temp →
   scratchpad, jamais dans le repo ; `clients/` (la donnée) jamais commité ; un dossier
   n'existe que quand il a du contenu. Ranger AVANT de committer : `npm run menage` (racine,
   noms, liens des .md, longueur de `session.md`, code mort via knip) — il tourne aussi en CI.
   Avant chaque merge : `npm run verif` (toute la CI, en local).
3. **Corpus** : toute évolution de `engine/clone` repasse le corpus ([docs/corpus.md](docs/corpus.md))
   et se juge aux verdicts, pas à l'impression.

## Règles non négociables
- **Natures** : mécanique = script dans `engine/`, réflexion = skill ; toute sortie de skill
  est validée par un schéma zod avant d'être écrite.
- **Ancres** : jamais de réécriture libre de HTML — tout passe par les `data-lpws`.
- **Honnêteté** : un échec se rapporte (échec franc + cause), il ne se maquille pas ;
  chaque `meta.json` garde ses notes d'honnêteté.
- **Simplicité** : avant d'ajouter un fichier de process, un dossier, un skill — se demander
  si `session.md`, un readme existant ou un commit suffit. (Leçon LWS : les statuts qui
  enflent deviennent illisibles.)

## Lancer
`npm install && npx playwright install chromium` puis :
`npm run clone -- <url>` · `npm run verify -- <baseline>` · `npm run viewer` (cockpit :4600)
