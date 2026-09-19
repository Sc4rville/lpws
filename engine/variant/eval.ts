/**
 * eval.ts — le jugement contre des pages annotées à la main (feuille de route 2.7).
 *
 * Pour chaque fichier de annotations/ : signaux (cache ou recomptés), texte de la page, huit
 * questions posées au modèle, puis comparaison valeur par valeur avec ce qu'un humain a décidé.
 * Sortie : accord par question, par page, désaccords en clair, dernier-resultat.json.
 *
 * Usage : npm run brain:eval [-- --refaire]
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { Contexte } from "./contexte.ts"
import { SignauxMecaniques, extraireSignaux } from "./signaux.ts"
import { juger, corpsDe, type SignauxJuges } from "./jugement.ts"
import { step } from "../shared/log.ts"

const SCOPE = "variant/eval"
const ROOT = resolve(import.meta.dirname, "../..")
const DOSSIER = join(ROOT, "engine", "variant", "annotations")
const refaire = process.argv.includes("--refaire")
const QUESTIONS = ["promesseDansTitre", "titreType", "cadreDeReference", "niveauLecture", "objectionsTraitees", "preuveAligneeCible", "ctaAligneVente", "risquePercuEleve"] as const

type Annotation = { page: string; contexte: unknown; attendu: Record<string, unknown>; justifications?: Record<string, string> }

const fichiers = (await readdir(DOSSIER)).filter((f) => f.endsWith(".json") && f !== "dernier-resultat.json").sort()
const resultats: Array<{ page: string; accord: number; details: Record<string, { attendu: unknown; obtenu: unknown; confiance: number; ok: boolean }> }> = []
const parQuestion: Record<string, { ok: number; total: number }> = Object.fromEntries(QUESTIONS.map((q) => [q, { ok: 0, total: 0 }]))

for (const f of fichiers) {
  const a: Annotation = JSON.parse(await readFile(join(DOSSIER, f), "utf8"))
  const dossier = join(ROOT, a.page), base = join(dossier, "baseline")
  const ctx = Contexte.parse(a.contexte)
  const fSig = join(dossier, "signaux.json")
  let m: SignauxMecaniques
  const cache = !refaire && existsSync(fSig) ? SignauxMecaniques.safeParse(JSON.parse(await readFile(fSig, "utf8"))) : null
  if (cache?.success) m = cache.data
  else { m = await extraireSignaux(base); await writeFile(fSig, JSON.stringify(m, null, 2)) }
  const corps = corpsDe(await readFile(join(base, "capture.html"), "utf8"))
  const j: SignauxJuges | null = await juger(m, ctx, corps)
  const details: (typeof resultats)[number]["details"] = {}
  let ok = 0
  for (const q of QUESTIONS) {
    const obtenu = j ? (j[q] as { valeur: unknown; confiance: number }).valeur : null
    const confiance = j ? (j[q] as { confiance: number }).confiance : 0
    const bon = obtenu === a.attendu[q]
    details[q] = { attendu: a.attendu[q], obtenu, confiance, ok: bon }
    parQuestion[q].total++
    if (bon) { ok++; parQuestion[q].ok++ }
  }
  resultats.push({ page: f.replace(".json", ""), accord: ok / QUESTIONS.length, details })
  step(SCOPE, `${f.replace(".json", "").padEnd(11)} ${ok}/${QUESTIONS.length}  ${QUESTIONS.map((q) => (details[q].ok ? "✓" : "✗")).join(" ")}`)
  for (const q of QUESTIONS) if (!details[q].ok)
    step(SCOPE, `    ✗ ${q} : attendu ${JSON.stringify(details[q].attendu)}, obtenu ${JSON.stringify(details[q].obtenu)} (confiance ${details[q].confiance}) · ${a.justifications?.[q] ?? ""}`)
}

const total = resultats.reduce((s, r) => s + r.accord, 0) / Math.max(resultats.length, 1)
step(SCOPE, `accord global : ${(total * 100).toFixed(0)} % sur ${resultats.length} pages`)
for (const q of QUESTIONS) step(SCOPE, `  ${q.padEnd(20)} ${parQuestion[q].ok}/${parQuestion[q].total}`)
await writeFile(join(DOSSIER, "dernier-resultat.json"), JSON.stringify({ date: new Date().toISOString(), accord: total, parQuestion, pages: resultats }, null, 2))
