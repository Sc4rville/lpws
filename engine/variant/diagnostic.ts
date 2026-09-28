/**
 * diagnostic.ts — LA JOINTURE : signaux + contexte → constats classés. Aucun modèle ici.
 *
 * Chaque règle est évaluée une fois. Trois issues, et on les distingue toujours : déclenchée,
 * non déclenchée, non évaluable (un signal manquait). Une règle non évaluable n'est pas
 * « fausse » : elle est listée comme telle, avec ce qui manquait, pour que le buyer sache ce
 * qu'il gagnerait à répondre à une question de plus.
 *
 * Le classement est un calcul (impact × preuve × pertinence ÷ risque), sauf pour les règles
 * stratégiques qui passent devant : les grilles sous-notent les changements audacieux.
 *
 * Deux sorties, jamais mélangées : les TESTS qu'on sait exécuter avec nos verbes, et les
 * CONSEILS à transmettre au client. Plus le régime de test que le volume impose.
 */
import { REGLES, score, type Regle, type Signaux } from "./regles.ts"
import type { Contexte } from "./contexte.ts"

export type Constat = {
  id: string; famille: Regle["famille"]; sortie: Regle["sortie"]; score: number; strategique: boolean
  signal: string; pourquoi: string; action: string; sources: string[]
  test?: Regle["test"]
}

export type Diagnostic = {
  faitLe: string
  regime: "gros-changements" | "chirurgical" | "inconnu"
  tests: Constat[]
  conseils: Constat[]
  methode: Constat[]
  nonEvaluables: { id: string; signal: string }[]
  calmes: string[]
  /** constats déclenchés mais pas re-proposés : la mémoire du client dit qu'ils ont déjà perdu ou été refusés */
  ecartes?: { id: string; raison: string }[]
}

const versConstat = (r: Regle, c: Contexte): Constat => ({
  id: r.id, famille: r.famille, sortie: r.sortie, score: score(r, c), strategique: !!r.strategique,
  signal: r.signal, pourquoi: r.pourquoi, action: r.action, sources: r.sources, test: r.test,
})

const parPriorite = (a: Constat, b: Constat) =>
  Number(b.strategique) - Number(a.strategique) || b.score - a.score

export function diagnostiquer(s: Signaux, c: Contexte): Diagnostic {
  const tests: Constat[] = [], conseils: Constat[] = [], methode: Constat[] = []
  const nonEvaluables: Diagnostic["nonEvaluables"] = [], calmes: string[] = []

  for (const r of REGLES) {
    let v: boolean | null
    try { v = r.quand(s, c) } catch { v = null }
    if (v === null) { nonEvaluables.push({ id: r.id, signal: r.signal }); continue }
    if (!v) { calmes.push(r.id); continue }
    const k = versConstat(r, c)
    ;(r.sortie === "test" ? tests : r.sortie === "conseil" ? conseils : methode).push(k)
  }
  tests.sort(parPriorite); conseils.sort(parPriorite); methode.sort(parPriorite)

  const regime = c.visiteursMois === undefined ? "inconnu" : c.visiteursMois < 200_000 ? "gros-changements" : "chirurgical"
  return { faitLe: new Date().toISOString(), regime, tests, conseils, methode, nonEvaluables, calmes }
}
