/**
 * run.ts — orchestrateur de la famille MEASURE : GA4 → resultats.json → le verdict à l'écran.
 *
 * Pour une campagne, lit `mesure.json` (la propriété GA4 et le compte de service que le buyer a
 * ajouté en lecteur), interroge GA4 depuis la date de lancement du premier test vivant, et écrit
 * `resultats.json` : par version, combien de sessions et combien de conversions. L'interface lit
 * ce fichier et rend le verdict que le buyer attend (« pas encore assez de données », « gagnant
 * probable, certitude 96 % »).
 *
 * `--exemple` rejoue une réponse GA4 enregistrée (exemple-reponse.json) : le chemin complet
 * jusqu'à l'écran se vérifie sans propriété GA4 ni compte de service.
 *
 * Usage : npm run measure -- clients/<client>/<campagne> [--exemple]
 */
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { rapportParVersion, lireRapport, type CompteDeService, type LigneVersion } from "./ga4.ts"
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { ecrireJson, lireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test, type Experience } from "../shared/campagne.ts"
import { enregistrerExperiences } from "./experience.ts"

const SCOPE = "measure"

type Mesure = { propriete: string; compteDeService: string }

export type Resultats = {
  luLe: string
  depuis: string
  source: "ga4" | "exemple"
  versions: Record<string, { n: number; c: number }>
  /** par test, l'original et la variante comptés sur SA fenêtre (lancement → arrêt) */
  parTest?: Record<string, { depuis: string; jusqua: string; controle: { n: number; c: number } | null; variante: { n: number; c: number } | null }>
}

/** Le délai de GA4 : un test arrêté n'a ses chiffres définitifs qu'ensuite. */
export const DELAI_GA4_MS = 48 * 3_600_000

export async function mesurer(campagne: string, exemple = false): Promise<Resultats> {
  const f = fichiersDe(campagne)
  const tests = await lireJson<Test[]>(f.tests, [])
  const vivants = tests.filter((t) => t.etat === "live" || t.etat === "stop" || t.etat === "gagnant")
  if (!vivants.length && !exemple) fail(SCOPE, `aucun test lancé dans ${campagne} : rien à mesurer`)
  const depuis = vivants.map((t) => t.lanceLe).filter((d): d is string => !!d).sort()[0]?.slice(0, 10)
    ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  let lignes: LigneVersion[]
  let lire: (depuis: string, jusqua: string) => Promise<LigneVersion[]>
  if (exemple) {
    lignes = lireRapport(JSON.parse(await readFile(new URL("./exemple-reponse.json", import.meta.url), "utf8")))
    lire = async () => lignes
    step(SCOPE, `réponse GA4 d'exemple rejouée (${lignes.length} versions)`)
  } else {
    if (!existsSync(f.mesure))
      fail(SCOPE, `${f.mesure} manquant. Il faut : { "propriete": "<id numérique GA4>", "compteDeService": "<chemin du JSON du compte de service> " }\n` +
        `  → le buyer ajoute l'adresse du compte de service en LECTEUR sur la propriété GA4 du client,\n` +
        `    et crée la dimension personnalisée lpws_variante (portée UTILISATEUR) dans Admin → Définitions personnalisées.`)
    const m: Mesure = JSON.parse(await readFile(f.mesure, "utf8"))
    const sa: CompteDeService = JSON.parse(await readFile(m.compteDeService, "utf8"))
    lire = (d, j) => rapportParVersion(sa, m.propriete, d, j)
    lignes = await lire(depuis, "today")
    step(SCOPE, `GA4 propriété ${m.propriete}, depuis le ${depuis} : ${lignes.length} version(s)`)
  }

  const versions: Resultats["versions"] = {}
  for (const l of lignes) versions[l.version] = { n: l.sessions, c: l.conversions }
  /* Chaque test se compare à l'original de SA période : des tests successifs ne partagent pas
   * le même contrôle cumulé, et un test relancé repart de son nouveau lancement. GA4 compte au
   * jour : le jour d'une bascule compte pour les deux tests qui se touchent. */
  const parTest: NonNullable<Resultats["parTest"]> = {}
  const fenetres = new Map<string, Promise<LigneVersion[]>>()
  for (const t of vivants) {
    if (!t.lanceLe) continue
    const d = t.lanceLe.slice(0, 10), j = t.finLe?.slice(0, 10) ?? "today"
    if (!fenetres.has(`${d}/${j}`)) fenetres.set(`${d}/${j}`, lire(d, j))
    const ls = await fenetres.get(`${d}/${j}`)!
    const de = (v: string) => { const l = ls.find((x) => x.version === v); return l ? { n: l.sessions, c: l.conversions } : null }
    parTest[t.id] = { depuis: d, jusqua: j, controle: de("controle"), variante: de(t.id) }
  }
  const res: Resultats = { luLe: new Date().toISOString(), depuis, source: exemple ? "exemple" : "ga4", versions, parTest }
  await ecrireJson(f.resultats, res)
  /* Un test arrêté a été archivé avec ce que GA4 savait à l'arrêt ; ses dernières conversions
   * arrivent jusqu'à 48 h plus tard. Tant que la lecture archivée précède ce délai, on le
   * ré-archive (même lancement : la ligne est mise à jour, pas dupliquée). */
  const journal = await lireJson<Experience[]>(f.experiences, [])
  const aRelire = vivants.filter((t) => t.etat !== "live" && t.lanceLe && t.finLe && journal.some((e) =>
    e.test === t.id && e.lanceLe === t.lanceLe && (!e.luLe || new Date(e.luLe).getTime() < new Date(t.finLe!).getTime() + DELAI_GA4_MS)))
  for (const e of await enregistrerExperiences(campagne, aRelire))
    step(SCOPE, `  journal relu : « ${e.titre} » — ${e.conclusion}`)
  for (const [v, x] of Object.entries(versions))
    step(SCOPE, `  ${v.padEnd(28)} ${String(x.n).padStart(6)} sessions  ${String(x.c).padStart(5)} conversions`)
  return res
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs(["--exemple"])
  const [campagne] = args.libres
  if (!campagne) fail(SCOPE, "usage : npm run measure -- clients/<client>/<campagne> [--exemple]")
  await mesurer(campagne, args.drapeau("--exemple"))
}
