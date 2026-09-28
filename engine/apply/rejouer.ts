/**
 * rejouer.ts — rejouer une variante écrite sur une ancienne capture, sur la nouvelle.
 *
 *   captures/<date>/anchors.json  +  baseline/anchors.json  →  relier()  →  spec traduite
 *
 * Les ancres sont des rangs : le client ajoute une bannière et `e231` ne désigne plus le titre.
 * `apply` le voit déjà (témoin `attendu`) et refuse ; ici on fait le pas suivant : traduire chaque
 * ancre par le rapport de re-liage, et REFUSER tout ce qui n'est pas retrouvé franchement. Une
 * ancre ambiguë ou perdue n'est jamais devinée : la spec entière est refusée, avec la raison.
 *
 * Les ancres que la spec fabrique elle-même se traduisent à part : `c-<nom>` (compose) n'existe
 * dans aucune capture, et `e42-b` (copie par duplicate) se traduit par `e42`.
 *
 * Usage : npm run rejouer -- <dossier-baseline> <spec.json> [--depuis <captures/date>]
 * Sans --depuis : la capture archivée la plus récente. La spec traduite remplace l'ancienne,
 * qui est gardée dans le dossier de la capture d'origine (specs/).
 */
import { copyFile, mkdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { relier, type Rapport } from "../clone/1_acquire/relink.ts"
import type { Empreinte } from "../clone/1_acquire/fingerprint.ts"
import { capturesArchivees } from "../clone/captures.ts"
import { VariantSpec } from "./spec.ts"
import { ecrireJson, lireValide } from "../shared/json.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { step, fail } from "../shared/log.ts"

const SCOPE = "apply/rejouer"

export type Traduction = {
  spec: VariantSpec
  /** ancres dont le numéro a changé */
  changees: Array<{ avant: string; apres: string }>
  /** ce qui empêche de rejouer — vide = la spec traduite est sûre */
  refus: string[]
}

export function traduire(spec: VariantSpec, rapport: Rapport, apres: Empreinte[]): Traduction {
  const lien = new Map(rapport.retrouves.map((l) => [l.avant, l.apres]))
  const ambigu = new Map(rapport.ambigus.map((x) => [x.avant, x.candidats.map((c) => c.apres)]))
  const perdu = new Map(rapport.perdus.map((x) => [x.avant, x.text]))
  const parAncre = new Map(apres.map((e) => [e.a, e]))
  const composees = new Set(spec.edits.filter((e) => e.op === "compose").map((e) => "c-" + e.as))
  const suffixes = new Set(spec.edits.filter((e) => e.op === "duplicate").map((e) => "-" + e.as))
  const refus: string[] = [], changees: Traduction["changees"] = []
  const vus = new Map<string, string>()

  /** l'ancre de la nouvelle capture, ou null (et la raison dans refus) */
  const t = (a: string): string | null => {
    if (vus.has(a)) return vus.get(a)!
    if (composees.has(a) || [...composees].some((c) => a.startsWith(c + "-"))) return a
    const suffixe = [...suffixes].find((s) => a.endsWith(s) && lien.has(a.slice(0, -s.length)))
    const base = suffixe ? a.slice(0, -suffixe.length) : a
    const b = lien.get(base)
    if (!b) {
      refus.push(ambigu.has(base) ? `${base} : ambiguë (${ambigu.get(base)!.join(", ")})`
        : perdu.has(base) ? `${base} : perdue (« ${perdu.get(base)} »)`
        : `${base} : absente de l'ancienne capture`)
      return null
    }
    const r = b + (suffixe ?? "")
    if (r !== a) changees.push({ avant: a, apres: r })
    vus.set(a, r)
    return r
  }

  const edits = spec.edits.map((e) => {
    const x = { ...e }
    if (e.anchor) {
      const a = t(e.anchor)
      if (a) {
        x.anchor = a
        // l'identité vient d'être prouvée par le re-liage : le témoin est celui d'aujourd'hui
        const base = [...suffixes].find((s) => a.endsWith(s)) ? a.replace(/-[a-z0-9]+$/, "") : a
        const emp = parAncre.get(base)
        if (emp) x.attendu = { role: emp.role, text: emp.text }
      }
    }
    if (e.before) x.before = t(e.before) ?? e.before
    if (e.after) x.after = t(e.after) ?? e.after
    if (e.with) x.with = t(e.with) ?? e.with
    return x
  })
  return { spec: { ...spec, edits }, changees, refus }
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs()
  const [baseline, specPath] = args.libres
  if (!baseline || !specPath) fail(SCOPE, "usage : npm run rejouer -- <dossier-baseline> <spec.json> [--depuis <captures/date>]")
  const depuis = args.option("--depuis") ?? (await capturesArchivees(baseline))[0]
  if (!depuis) fail(SCOPE, `aucune capture archivée pour ${baseline} : la spec a été écrite sur la capture actuelle, rien à traduire`)
  const lire = async (d: string): Promise<Empreinte[]> =>
    JSON.parse(await readFile(join(d, "anchors.json"), "utf8").catch(() => fail(SCOPE, `pas d'anchors.json dans ${d}`)))
  const spec = await lireValide(VariantSpec, specPath).catch((e: Error) => fail(SCOPE, e.message))
  const apres = await lire(baseline)
  const r = traduire(spec, relier(await lire(depuis), apres), apres)
  if (r.refus.length) fail(SCOPE, `« ${spec.nom} » ne se rejoue pas sur la nouvelle capture :\n  ${r.refus.join("\n  ")}\n  → réécrire ces éditions sur la capture actuelle`)
  const garde = join(depuis, "specs")
  await mkdir(garde, { recursive: true })
  await copyFile(specPath, join(garde, basename(specPath)))
  await ecrireJson(specPath, r.spec)
  step(SCOPE, `« ${spec.nom} » traduite depuis ${depuis} : ${r.changees.length ? r.changees.map((c) => `${c.avant} → ${c.apres}`).join(", ") : "aucune ancre n'a bougé"}`)
}
