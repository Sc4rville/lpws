/**
 * diagnostic.ts — LA JOINTURE : signaux + contexte → constats classés. Aucun modèle ici.
 *
 * Chaque règle est évaluée une fois. Trois issues, et on les distingue toujours : déclenchée,
 * non déclenchée, non évaluable (un signal manquait). Une règle non évaluable n'est pas
 * « fausse » : elle est listée comme telle, avec ce qui manquait, pour que le buyer sache ce
 * qu'il gagnerait à répondre à une question de plus.
 *
 * Un constat CITE la page : sa phrase (`signal`) est écrite à partir des signaux, avec le texte
 * exact et l'ancre data-lpws des éléments en cause (citation.ts) ; la phrase générale de la
 * règle reste à part (`principe`). Une règle qui se déclenche hors de ses niches déclarées
 * (une règle d'achat sur un SaaS) n'est pas un constat : elle est rangée dans `horsNiche`.
 *
 * Le classement est un calcul (impact × preuve ÷ risque), sauf pour les règles
 * stratégiques qui passent devant : les grilles sous-notent les changements audacieux.
 * Le bilan de la règle (ce qu'elle a donné dans nos tests) corrige ce calcul, borné, et
 * seulement à partir de deux tests tranchés : un seul résultat est une anecdote.
 *
 * Deux sorties, jamais mélangées : les TESTS qu'on sait exécuter avec nos verbes, et les
 * CONSEILS à transmettre au client. Plus le régime de test que le volume impose.
 */
import { pourNiche, REGLES, score, type Regle, type Signaux } from "./regles.ts"
import { type Contexte, type Niche } from "./contexte.ts"
import { citer, type ElementCite } from "./citation.ts"
import type { Bilan } from "../measure/experience.ts"

export type Constat = {
  id: string; famille: Regle["famille"]; sortie: Regle["sortie"]; score: number; strategique: boolean
  /** ce qu'on a vu sur CETTE page, texte exact et ancre des éléments cités */
  signal: string; pourquoi: string; action: string; sources: string[]
  test?: Regle["test"]
  /** la règle en général, telle que regles.json la décrit : jamais présentée comme un constat */
  principe?: string
  /** les éléments de la page que le constat cite : rôle, texte exact, ancre data-lpws */
  elements?: ElementCite[]
  /** 1 = le premier à regarder, dans sa liste (tests, conseils ou méthode). Le score n'est
   *  qu'un ingrédient du classement : les règles stratégiques passent devant */
  rang?: number
  /** ce que la règle a donné dans nos tests tranchés, quand on en a */
  bilan?: Bilan
}

export type Diagnostic = {
  faitLe: string
  regime: "gros-changements" | "chirurgical" | "inconnu"
  /** tests retirés par la mémoire du client (perdus chez lui, ou refusés par le buyer) */
  ecartes: Array<{ id: string; signal: string; raison: string }>
  tests: Constat[]
  conseils: Constat[]
  methode: Constat[]
  nonEvaluables: { id: string; signal: string }[]
  calmes: string[]
  /** déclenchées, mais hors des niches que la règle déclare : ni test ni conseil */
  horsNiche: Array<{ id: string; niches: Niche[]; signal: string }>
  /** le bilan de l'écriture des variantes (variantes.ts), une fois les propositions écrites */
  ecriture?: BilanEcriture
}

export type BilanEcriture = {
  /** combien de propositions on visait, combien sont sorties */
  objectif: number; produites: number
  /** pistes testables du diagnostic, et celles qui ont été tentées */
  pistes: number; tentees: string[]
  /** combien d'appels au modèle */
  appels: number
  /** au moins une proposition change plusieurs éléments au service de la même hypothèse */
  multiElements: boolean
  /** en clair, pourquoi il y en a moins que l'objectif (absent si l'objectif est atteint) */
  manque?: string
}

/** Un facteur de confiance tiré du bilan : (gagnés + 1) ÷ (perdus + 1), borné à [½, 1,5]. */
export function confiance(b: Bilan | undefined): number {
  if (!b || b.gagnes + b.perdus < 2) return 1
  return Math.min(1.5, Math.max(0.5, (b.gagnes + 1) / (b.perdus + 1)))
}

const versConstat = (r: Regle, s: Signaux, c: Contexte, b: Bilan | undefined): Constat => {
  const { signal, elements } = citer(r.id, s, c)
  return {
    id: r.id, famille: r.famille, sortie: r.sortie, score: Math.round(score(r) * confiance(b)), strategique: !!r.strategique,
    signal, principe: r.signal, elements, pourquoi: r.pourquoi, action: r.action, sources: r.sources, test: r.test,
    ...(b ? { bilan: b } : {}),
  }
}

export const parPriorite = (a: Constat, b: Constat) =>
  Number(b.strategique) - Number(a.strategique) || b.score - a.score

/** Classe une liste et lui donne son rang : 1 = le premier à regarder. */
export function numeroter(ks: Constat[]): Constat[] {
  ks.sort(parPriorite)
  ks.forEach((k, i) => { k.rang = i + 1 })
  return ks
}

export function diagnostiquer(s: Signaux, c: Contexte, bilans: Map<string, Bilan> = new Map()): Diagnostic {
  const tests: Constat[] = [], conseils: Constat[] = [], methode: Constat[] = []
  const nonEvaluables: Diagnostic["nonEvaluables"] = [], calmes: string[] = [], horsNiche: Diagnostic["horsNiche"] = []

  for (const r of REGLES) {
    let v: boolean | null
    try { v = r.quand(s, c) } catch { v = null }
    if (v === null) { nonEvaluables.push({ id: r.id, signal: r.signal }); continue }
    if (!v) { calmes.push(r.id); continue }
    if (!pourNiche(r, c)) { horsNiche.push({ id: r.id, niches: r.niches, signal: citer(r.id, s, c).signal }); continue }
    const k = versConstat(r, s, c, bilans.get(r.id))
    ;(r.sortie === "test" ? tests : r.sortie === "conseil" ? conseils : methode).push(k)
  }
  numeroter(tests); numeroter(conseils); numeroter(methode)

  const regime = c.visiteursMois === undefined ? "inconnu" : c.visiteursMois < 200_000 ? "gros-changements" : "chirurgical"
  return { faitLe: new Date().toISOString(), regime, ecartes: [], tests, conseils, methode, nonEvaluables, calmes, horsNiche }
}
