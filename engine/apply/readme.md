# Famille APPLY — une hypothèse → une variante visible et prouvée

Deuxième famille : exécuter **fidèlement** un plan d'édition sur une baseline clonée.
Le jugement (quoi changer et pourquoi) a lieu ailleurs ; ici, tout est déterministe.

```bash
npm run apply -- <dossier-baseline> <spec.json>
```

## Contrat

| | |
|---|---|
| **Entrée** | une `baseline/` fidèle (famille `clone`) + une **VariantSpec** validée ([`spec.ts`](spec.ts)) |
| **Sortie** | `clients/<client>/<campagne>/variants/<nom>/` — `variant.html(.mobile)`, captures, `delta.png(.mobile)`, `variant.json` |

## Ce qu'une variante est, et n'est pas

Une variante n'est **pas** « une nouvelle page ». C'est **une hypothèse** et les quelques
éditions ancrées qui la testent. Le schéma zod force cette discipline : pas d'hypothèse,
pas de métrique attendue, pas de risque, pas de diagnostic d'origine → la spec est refusée.
Si une variante change cinq choses et qu'elle gagne, on n'a rien appris.

Aujourd'hui les specs sont écrites à la main (le moteur de diagnostic n'existe pas encore).
Demain c'est le skill `variant` qui les produit — et la même validation s'applique, c'est la
règle maison : toute sortie de skill passe un schéma avant d'être écrite.

## Étapes

| Fichier | Rôle |
|---|---|
| [`spec.ts`](spec.ts) | **Le contrat** : hypothèse, métrique, risque, diagnostic traçable, éditions ancrées |
| [`apply.ts`](apply.ts) | **La mécanique** : ancres `data-lpws` → nouvelles valeurs, sur les DEUX états (desktop + mobile) |
| [`run.ts`](run.ts) | Orchestration : appliquer, rendre, produire le delta visuel |

## Le delta : lire le bon signe

Le `delta.png` montre ce qui a bougé — et surtout que **rien d'autre n'a bougé**. Attention
au sens : chez le juge du clone, un ratio faible signifie *fidélité* ; ici il signifie
*chirurgie*. Une variante censée tester un libellé de bouton qui repeint 14 % de la page
n'est pas un test propre.

**Mais un ratio élevé n'est pas toujours une faute.** Un titre plus long passe de deux à
trois lignes, décale tout ce qui suit de 66 px, et le delta explose alors qu'une seule
phrase a changé (mesuré sur Jira). Le ratio global mesure la **cascade**, pas le changement.
Le delta par section ancré `data-lpws` (juge v2) réglera les deux côtés à la fois.

## Choix de conception

- **Ancre introuvable = échec franc.** Jamais d'édition silencieusement ignorée : une
  variante à moitié appliquée serait jugée comme si elle était complète.
- **Les deux états sont édités.** `capture.html` et `capture.mobile.html` partagent les
  mêmes ancres par construction (marquage avant sérialisation) — c'est exactement à ça que
  sert cette décision de `1_acquire`.
- **`textContent`, pas d'injection HTML.** Aucune balise ne peut entrer par une édition :
  la règle « jamais de réécriture libre » tient au niveau de la mécanique, pas de la
  bonne volonté du producteur de la spec.
- **Les assets restent dans `baseline/`.** Une variante ne duplique pas 5 Mo d'images pour
  un headline ; le rendu sert la variante d'abord, la baseline en repli.
- **Rendu en http local**, même raison que le juge : en `file://` l'origine est `null` et
  Chromium refuse les fonts locales par CORS.

## Limites connues

- Le delta global cascade (voir plus haut) — juge v2 par section à construire.
- Les éditions se limitent à texte / href / src / placeholder : pas de déplacement de bloc,
  pas d'ajout de section. Ça suffit pour les hypothèses de copy et d'offre ; une hypothèse
  structurelle (« remonter la preuve au-dessus du pli ») demandera un verbe de plus.
- Rien n'est déployé : `variant.html` est un fichier local. La famille `deploy` viendra.
