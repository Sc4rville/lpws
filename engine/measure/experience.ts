/**
 * experience.ts — LE JOURNAL DES EXPÉRIENCES : ce qu'un test a donné, gardé quand il s'arrête.
 *
 * `resultats.json` est un instantané que la mesure suivante écrase, et `tests.json` ne garde que
 * l'état courant : sans ce journal, un test arrêté ne laisse aucune trace de ce qu'il a montré.
 * Chaque arrêt ajoute une ligne à `experiences.json` : les éditions, l'échantillon lu dans GA4,
 * la fourchette de la hausse et la conclusion, y compris quand elle est « non concluant ».
 *
 * La conclusion suit l'interface : moins de 25 conversions sur la version la moins vue, c'est
 * trop tôt ; sinon l'intervalle à 95 % de la hausse relative tranche, ou pas.
 */
import { campagne as fichiersDe, Experience, type Test } from "../shared/campagne.ts"
import { lireJson, ecrireJson } from "../shared/json.ts"
import type { Resultats } from "./run.ts"

type Compte = { n: number; c: number }

export const CONVERSIONS_MIN = 25
const Z95 = 1.96

/** Ce qu'on a le droit de conclure d'un contrôle et d'une variante. */
export function conclure(o: Compte | null, v: Compte | null): Pick<Experience, "hausse" | "conclusion"> {
  if (!o || !v || o.n <= 0 || v.n <= 0) return { hausse: null, conclusion: "sans données" }
  const p1 = o.c / o.n, p2 = v.c / v.n
  const hausse = p1 > 0
    ? (() => {
        const se = Math.sqrt(p1 * (1 - p1) / o.n + p2 * (1 - p2) / v.n)
        return { lo: (p2 - p1 - Z95 * se) / p1, mid: (p2 - p1) / p1, hi: (p2 - p1 + Z95 * se) / p1 }
      })()
    : null
  if (Math.min(o.c, v.c) < CONVERSIONS_MIN || !hausse) return { hausse, conclusion: "trop tôt" }
  return { hausse, conclusion: hausse.lo > 0 ? "gagnant" : hausse.hi < 0 ? "perdant" : "non concluant" }
}

/** Ajoute au journal de la campagne une expérience par test arrêté ; renvoie ce qui a été écrit. */
export async function enregistrerExperiences(dir: string, arretes: Test[], arreteLe = new Date().toISOString()): Promise<Experience[]> {
  if (!arretes.length) return []
  const f = fichiersDe(dir)
  const res = await lireJson<Resultats | null>(f.resultats, null)
  const journal = await lireJson<Experience[]>(f.experiences, [])
  const nouvelles = arretes.map((t) => {
    const controle = res?.versions?.controle ?? null, variante = res?.versions?.[t.id] ?? null
    return Experience.parse({
      test: t.id, titre: t.titre, teste: t.teste, pourquoi: t.pourquoi, edits: t.edits, part: t.part,
      lanceLe: t.lanceLe, arreteLe, controle, variante,
      luLe: res?.luLe ?? null, source: res?.source ?? null,
      ...conclure(controle, variante),
    })
  })
  await ecrireJson(f.experiences, [...journal, ...nouvelles])
  return nouvelles
}
