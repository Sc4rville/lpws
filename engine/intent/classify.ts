/**
 * classify.ts — range un terme de recherche dans une des sept intentions, par MOTIFS.
 *
 * Mécanique, pas réflexion : des expressions régulières FR/EN, dans un ordre de priorité
 * qui dit ce qui compte le plus pour un media buyer. « jira pricing » est un signal PRIX
 * avant d'être un signal MARQUE ; « jira alternative » est ALTERNATIVE avant tout.
 *
 * Chaque classement dit son indice (le motif qui a décidé) et sa confiance. Le défaut —
 * « catégorie générique », confiance basse — n'est pas une réponse : c'est la liste de ce
 * qu'un skill devra revoir. On préfère un « je ne sais pas » rangé à part qu'un faux rangé
 * avec les autres.
 */
import type { Classement, Intention } from "./schema.ts"

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim()

/** motifs par intention, du plus décisif au moins décisif */
const MOTIFS: Array<[Intention, "haute" | "moyenne", RegExp]> = [
  ["transaction", "haute", /\b(free trial|essai gratuit|trial|demo|sign ?up|register|inscription|s'inscrire|buy|acheter|commander|subscribe|s'abonner|get started|try (it|now|for free)|commencer)\b/],
  ["alternative", "haute", /\b(alternatives?|vs\.?|versus|instead of|au lieu de|a la place de|similar to|similaire a|concurrents?|competitors?|remplacer|replace|switch(ing)? from|migrer|migrate|migration)\b/],
  ["prix", "haute", /\b(pricing|prices?|costs?|cheap(est)?|affordable|free|gratuits?|gratuites?|tarifs?|prix|pas cher|budget|plans?|abonnements?|subscription|discount|promo|coupon|per (user|month|seat))\b/],
  ["comparaison", "moyenne", /\b(best|top( \d+)?|meilleurs?|meilleures?|compar\w*|reviews?|avis|ratings?|ranked|ranking|classement|which|quels?|quelles?)\b/],
  ["information", "haute", /\b(how (to|do|does|can)|what (is|are)|why|guide|tutorials?|tutoriels?|examples?|exemples?|templates?|modeles?|definition|comment|qu'est-ce|c'est quoi|pourquoi|meaning|explained|learn|apprendre|formation|courses?|cours|certification)\b/],
]
/** requêtes de navigation : n'ont de sens que si la marque est là (« jira login », pas « app ») */
const NAVIGATION = /\b(log ?in|sign in|connexion|se connecter|download|telecharger|app|application|support|help|aide|status|api|docs?|documentation|integrations?|plugins?|extensions?|updates?|mise a jour|release notes)\b/

export function classer(terme: string, marques: string[] = []): Classement {
  const t = norm(terme)
  const marque = marques.map(norm).find((m) => m && new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))
  for (const [intention, confiance, re] of MOTIFS) {
    const m = t.match(re)
    if (m) return { terme, intention, confiance, indice: m[0] }
  }
  if (marque) {
    const nav = t.match(NAVIGATION)
    return { terme, intention: "marque", confiance: "haute", indice: nav ? `${marque} + ${nav[0]}` : marque }
  }
  return { terme, intention: "categorie", confiance: "basse", indice: "aucun motif — à revoir" }
}
