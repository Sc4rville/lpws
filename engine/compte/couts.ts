/**
 * couts.ts — CE QUE COÛTE UN DIAGNOSTIC, lu dans clients/couts.jsonl (écrit par modele.ts à
 * chaque appel). C'est la décision 2 du rapport business model : on ne fixe pas un plafond de
 * diagnostics par palier sans savoir ce qu'un diagnostic coûte.
 *
 * Un « diagnostic » = les appels d'une même page à moins de 15 minutes d'intervalle (jugement +
 * variantes, et leurs réessais).
 *
 * Usage : npm run couts
 */
import { readFile } from "node:fs/promises"
import { step } from "../shared/log.ts"
import { estLance } from "../shared/cli.ts"
import { JOURNAL_COUTS, type Cout } from "../shared/modele.ts"

export type BilanCouts = { appels: number; diagnostics: number; coutMoyenUsd: number | null; dureeMoyenneS: number | null; totalUsd: number; parScope: Record<string, { appels: number; coutMoyenUsd: number | null }> }

export async function lireCouts(f = JOURNAL_COUTS): Promise<Cout[]> {
  try { return (await readFile(f, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Cout) } catch { return [] }
}

const moyenne = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null

export function bilanCouts(cs: Cout[]): BilanCouts {
  const groupes: Cout[][] = []
  for (const c of [...cs].sort((a, b) => a.quand.localeCompare(b.quand))) {
    const g = [...groupes].reverse().find((x) => x[0].campagne === c.campagne)
    if (g && Date.parse(c.quand) - Date.parse(g.at(-1)!.quand) < 15 * 60_000) g.push(c)
    else groupes.push([c])
  }
  const coutG = groupes.map((g) => g.map((c) => c.coutUsd).filter((x): x is number => x !== null)).filter((x) => x.length).map((x) => x.reduce((s, y) => s + y, 0))
  const dureeG = groupes.map((g) => g.reduce((s, c) => s + (c.dureeMs ?? 0), 0) / 1000).filter((x) => x > 0)
  const parScope: BilanCouts["parScope"] = {}
  for (const s of new Set(cs.map((c) => c.scope))) {
    const x = cs.filter((c) => c.scope === s)
    parScope[s] = { appels: x.length, coutMoyenUsd: moyenne(x.map((c) => c.coutUsd).filter((y): y is number => y !== null)) }
  }
  return { appels: cs.length, diagnostics: groupes.length, coutMoyenUsd: moyenne(coutG), dureeMoyenneS: moyenne(dureeG),
    totalUsd: cs.reduce((s, c) => s + (c.coutUsd ?? 0), 0), parScope }
}

if (estLance(import.meta.url)) {
  const b = bilanCouts(await lireCouts())
  if (!b.appels) step("couts", `aucun appel modèle journalisé dans ${JOURNAL_COUTS} : lancez un diagnostic (npm run brain) d'abord`)
  else {
    step("couts", `${b.appels} appel(s), ${b.diagnostics} diagnostic(s) · coût moyen d'un diagnostic ${b.coutMoyenUsd === null ? "non rapporté" : b.coutMoyenUsd.toFixed(3) + " $"} · durée moyenne ${b.dureeMoyenneS?.toFixed(0) ?? "?"} s · total ${b.totalUsd.toFixed(2)} $`)
    for (const [s, x] of Object.entries(b.parScope)) step("couts", `  ${s.padEnd(20)} ${x.appels} appel(s) · ${x.coutMoyenUsd === null ? "?" : x.coutMoyenUsd.toFixed(3) + " $"} en moyenne`)
  }
}
