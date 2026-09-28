# Famille DEPLOY — une variante validée → une page publiable, sans perdre la mesure

Quatrième famille : rendre une variante **utilisable par un media buyer**. Il colle une URL
dans son annonce et envoie du trafic PAYANT dessus : ce qui compte ici n'est pas le rendu,
c'est que ses conversions lui reviennent.

```bash
npm run deploy -- <dossier-variante> <config.json>
```

## Contrat

| | |
|---|---|
| **Entrée** | une variante (famille `apply`) + une **DeployConfig** validée ([`config.ts`](config.ts)) |
| **Sortie** | `clients/<client>/<campagne>/publish/<nom>/` — `index.html(.mobile)`, `assets/`, `deploy.json` (préparation + verdict) |

## Pourquoi cette famille remet du JavaScript

Le clone est servi **sans** le JS du client : rejouer le JS d'un framework sur un DOM
sérialisé casse l'hydratation. Mais une page vers laquelle part du trafic payant sans mesure
ne vaut rien. On réinjecte donc le strict nécessaire, écrit par nous — et **rien d'autre**.

| Étape | Rôle |
|---|---|
| [`config.ts`](config.ts) | le contrat de livraison : canonical, CTA → vrai tunnel, pixels, Consent Mode |
| [`prepare.ts`](prepare.ts) | relais des identifiants de clic, pixels, `noindex` + `canonical`, CTA recâblés |
| [`check.ts`](check.ts) | **le juge** : ouvre la page comme Google Ads le ferait (`?gclid=…`) et vérifie que la mesure survit |
| [`run.ts`](run.ts) | orchestration — le juge tourne AVANT la mise en ligne, jamais après |

## Ce que le juge vérifie

1. **chaque CTA emporte l'identifiant de clic** vers le tunnel du client ;
2. `noindex` + `canonical` : une variante ne concurrence jamais la page qu'elle teste ;
3. le refus de consentement (Consent Mode v2) est poussé **avant** les pixels ;
4. les pixels configurés sont réellement demandés par la page.

Tant qu'un point échoue, le dossier est produit mais **marqué non publiable** : une
attribution perdue ne se rattrape pas rétroactivement.

## Choix de conception

- **Les identifiants de clic sont relayés, pas stockés côté serveur.** `gclid`, `gbraid`,
  `wbraid`, `msclkid`, `fbclid` et les `utm_*` sont captés à l'arrivée et recollés à chaque
  lien sortant **vers les domaines du client uniquement** — on ne colle pas l'identifiant du
  buyer sur un lien tiers.
- **Consent Mode v2 en refus par défaut.** En Europe, charger les pixels sans consentement
  est illégal *et* casse la mesure (Google jette les hits non consentis). C'est la bannière
  du client qui débloque. Le désactiver est un choix explicite, tracé dans les notes.
- **Les CTA pointent vers le vrai tunnel du client.** Le clone n'a pas de formulaire vivant :
  une variante honnête est un pré-lander qui renvoie vers l'inscription réelle, paramètres
  recollés. Pas de formulaire simulé qui perdrait des leads en silence.
- **`noindex` systématique.** Sans lui, la variante entre en concurrence de référencement
  avec la page du client — un dommage qu'on ne saurait pas réparer.

## Limites connues

- **Rien n'est encore mis EN LIGNE** : cette famille produit un dossier publiable et jugé,
  l'hébergement (sous-domaine, certificat, URL stable par variante) reste à câbler.
- Le juge vérifie que la page **demande** ses pixels, pas qu'un compte tiers réponde : la
  seule preuve qui compte reste un clic de test qui remonte dans le compte du client.
- Les pixels remis sont ceux de la config, pas ceux détectés sur la page d'origine : à
  rapprocher de `resources.json` avant toute mise en ligne.
- Voie **Shopify** non concernée : là-bas la variante est un template natif du thème, la
  mesure et le panier restent ceux du client (cf. feuille de route 1.3).

## Natif (Shopify) — à construire, le contrat est prêt

Validé hors ligne sur le thème Dawn le 2026-09-17 (spike jetable) : une variante = un
template JSON alternatif `product.<suffixe>.json`, ouvert par `?view=<suffixe>`. Panier,
paiement, pixels et apps restent ceux du client. La spec est validée contre les
`{% schema %}` du thème avant écriture (Theme Check ne détecte qu'une erreur sur quatre).

| verbe | opération sur le template |
|---|---|
| `set` | `sections.<id>.settings.<clé>`, ou `.blocks.<bloc>.settings.<clé>` |
| `remove` | retirer de `order` / `block_order` + supprimer l'entrée · refus si type `main-*` |
| `move` · `swap` | réordonner `order` / `block_order` |
| `duplicate` | copier l'entrée sous une nouvelle clé alphanumérique |
| `add` | entrée `{type, settings, blocks, block_order}` — le type doit avoir un `presets` |

Limites Shopify : 25 sections par template, 50 blocs par section, 1 000 templates par thème.
Header/footer = groupes de sections du layout ; avis = blocs `@app`.
