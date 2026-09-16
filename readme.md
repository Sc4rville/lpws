# LpWS — Projet Landing Page Infrastructure pour Media Buyers

## Contexte

LWS veut construire un service B2B destiné directement aux **media buyers Google Ads**, principalement dans le **B2B et le SaaS**.

Distribution initiale potentielle : un réseau/newsletter d’environ **3 500 media buyers**, via un partenaire déjà implanté dans ce milieu.

L'objectif n'est pas de devenir un simple "landing page builder", mais de fournir aux media buyers une **infrastructure pour créer, tester, versionner et déployer rapidement des landing pages** pour leurs clients.

---

## Problème

Un media buyer gère des campagnes Google Ads pour plusieurs clients.

Lorsqu'il veut améliorer les performances d'une campagne, il peut avoir besoin de tester différentes landing pages :

- nouveau messaging
- nouvelle headline
- nouvel angle marketing
- nouvelle offre
- nouveau CTA
- nouvelle structure
- réduction de friction
- etc.

Aujourd'hui, cela peut nécessiter designer + développeur + intégration + déploiement + tracking.

LWS veut rendre ce workflow beaucoup plus rapide et automatisé.

---

## Workflow cible

```text
Media buyer
    ↓
Ajoute un client / une campagne
    ↓
Donne l'URL de la LP actuelle
    ↓
LWS crawl + screenshot + analyse la page
    ↓
LWS reconstruit une représentation structurée de la LP
    ↓
Media buyer choisit / demande un test
    ↓
LWS génère une variante
    ↓
Preview
    ↓
Validation
    ↓
Publication
    ↓
URL live
    ↓
Google Ads envoie du trafic
    ↓
Résultats
    ↓
Nouvelle itération
```

---

## Le repo

La machine qui exécute ce workflow vit dans [engine/](engine/) (code, par familles), la
réflexion dans [.claude/skills/](.claude/skills/), les sorties dans [clients/](clients/)
(gitignoré). Carte complète, conventions et décisions : [docs/architecture.md](docs/architecture.md).

Repo autonome : LPWS partage un bout de nom avec Last Web Studios et en hérite quelques
logiques éprouvées (démontage d'overlays, juge visuel, règle mécanique/réflexion), mais
aucun couplage de code.

## Démarrage rapide

```bash
npm install && npx playwright install chromium   # une fois

# cloner la LP d'un client → clients/<client>/<campagne>/baseline/
npm run clone -- https://exemple.com --client acme --campaign printemps

# rejuger une baseline existante sans recapturer
npm run verify -- clients/acme/printemps/baseline
```

État d'avancement du clonage : [engine/clone/readme.md](engine/clone/readme.md).

