/**
 * concordance.ts — UN SCORE CONTINU de concordance annonce → haut de page (feuille de route 2.4,
 * 3.3), déterministe : les mots achetés et promis par l'annonce se retrouvent-ils là où le
 * visiteur regarde en arrivant ?
 *
 * Ce n'est pas le jugement du brain (qui dit « la promesse est tenue » en lisant le sens) : c'est
 * un compteur, bon marché, qui se recalcule à chaque passage de la surveillance sans appel
 * modèle. Son rôle : voir qu'une annonce a changé et que la page n'a pas suivi.
 *
 *   score = 0,6 × part des mots-clés dont tous les mots sont en haut de page
 *         + 0,4 × part des mots du titre de l'annonce en haut de page
 *   (sans mots-clés : le titre seul)
 */
const VIDES = new Set(("a au aux avec ce ces dans de des du en et est la le les leur ou par pour sans sur un une vos votre "
  + "qui que ne pas plus il elle on nous se sa son ses ce cette tout tous enfin "
  + "the and for with your you our are from that this into to of in on at by or an is be get").split(" "))

const mots = (s: string): string[] => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .split(/[^a-z0-9%]+/).filter((m) => m.length > 1 && !VIDES.has(m))
  // pluriel et singulier se valent : « leads » = « lead »
  .map((m) => m.length > 3 && m.endsWith("s") ? m.slice(0, -1) : m)

export type Concordance = { score: number; motsClesPresents: string[]; motsClesAbsents: string[]; motsTitreAbsents: string[] }

export function concordance(annonce: { titre: string; description?: string; motsCles?: string[] }, hautDePage: string): Concordance {
  const page = new Set(mots(hautDePage))
  const titre = [...new Set(mots(annonce.titre))]
  const partTitre = titre.length ? titre.filter((m) => page.has(m)).length / titre.length : 0
  const mc = (annonce.motsCles ?? []).filter((k) => mots(k).length)
  const presents = mc.filter((k) => mots(k).every((m) => page.has(m)))
  const score = mc.length ? 0.6 * presents.length / mc.length + 0.4 * partTitre : partTitre
  return { score: Math.round(score * 100) / 100, motsClesPresents: presents, motsClesAbsents: mc.filter((k) => !presents.includes(k)), motsTitreAbsents: titre.filter((m) => !page.has(m)) }
}

/** L'accroche de la créa est reprise quand au moins un tiers de ses mots sont en haut de page ; null si elle n'en a aucun. */
export function accrocheReprise(accroche: string, hautDePage: string): boolean | null {
  const a = [...new Set(mots(accroche))], page = new Set(mots(hautDePage))
  return a.length ? a.filter((m) => page.has(m)).length * 3 >= a.length : null
}
