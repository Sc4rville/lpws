# Où on en est — 19/09/2026

## Le projet

Infrastructure de landing pages pour media buyers Google Ads (B2B/SaaS).
Voir `readme.md` pour le cadrage. Distribution potentielle : un réseau de
~3 500 media buyers via un partenaire déjà implanté.

**Le nom du dossier (`lpws`) ne correspond pas au projet (`LWS`).** À renommer
tant que le dépôt est neuf.

## L'angle, reformulé

Le media buyer ne veut pas *une* belle page. Il veut **tester dix variantes de
la même page sans mobiliser un designer**. Ce n'est pas un problème de design,
c'est un problème de vitesse d'itération. Ça change le produit, le prix, et la
cible.

L'actif le plus précieux du projet n'est pas le code, c'est **la distribution** :
un produit moyen avec ce réseau bat un produit parfait sans.

## Deux décisions ouvertes, à trancher avant de coder

**1. Par quoi on commence ?**
Le readme décrit la chaîne complète (crawl → analyse → structure → variantes →
publication). Le cœur, c'est **la génération de variantes** ; le reste est de la
plomberie. Proposition : commencer par là, sur une seule page réelle, sans
interface — prouver que la variante produite est vendable avant de construire
autour.

**2. Qui héberge la page publiée ?**
Point structurant. Le media buyer envoie du trafic PAYANT vers cette URL : elle
doit être rapide, fiable, sur un domaine crédible. Vercel / notre serveur / le
domaine du client ? Ça change l'architecture, le prix, et la responsabilité si
ça tombe en pleine campagne.

## Architecture : principe déjà acquis

**Séparation capteur / raisonnement.** Le modèle constate un fait ; la règle de
la base de connaissances explique pourquoi ça compte (raison, source, grade de
preuve). L'explication ne vient JAMAIS du modèle.

**Conséquence de conception, à tenir :** chaque signal extrait doit être une
**question indépendante, avec un type de sortie déclaré** (booléen / choix /
échelle) et une confiance. Testable une par une, cachable, jugeable contre un
corpus — et ça rend l'extracteur interchangeable.

## Jev — verdict (analysé le 19/09, message détaillé envoyé à Ylan)

Modèle sorti le 15/09 par TypeSafe. N'écrit pas : ne fait que des décisions
typées (vrai/faux, choix, note) avec des **probabilités calibrées**.

**Pourquoi c'est troublant de justesse :** notre couche d'extraction est
littéralement une liste de questions typées. Et la critique principale faite à
Jev — il n'explique rien — ne nous touche pas, vu la séparation ci-dessus.

**Pourquoi on ne l'adopte PAS maintenant :**
- **aveugle aux images** — rédhibitoire, en paid social c'est la créa qui porte
  le message ;
- **précision moyenne** (67,8 % contre 74,1 % pour le meilleur comparateur, sur
  leur propre tableau de bord) et étalon mou : jugé contre l'opinion moyenne
  d'autres modèles, pas une vérité terrain ;
- **il n'écrit pas** — or notre coût récurrent, c'est l'écriture des variantes,
  pas l'extraction ;
- produit de quelques jours, propriétaire, accès restreint.

**Ce qu'on en fait :** rien à brancher. Juste la précaution de conception
ci-dessus, qui est meilleure de toute façon. Si on branche Jev un jour, ce sera
un changement de config. Et on aura alors un avantage que personne n'a : une
vraie vérité terrain, nos pages annotées par nous.

**Et surtout : `page.json` n'existe pas encore.** Il n'y a littéralement rien
sur quoi faire tourner une extraction. Choisir le modèle avant d'avoir la chose
qu'il doit lire, c'est prendre le problème par la fin.

## Organisation de travail

- Discussion et décisions : fenêtre JARVIS.
- Exécution : **Benito**, relancé sur Fable 5.
- Suivi des fichiers : VS Code ouvert sur le dépôt.
