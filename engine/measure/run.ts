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
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { rapportParVersion, lireRapport, type CompteDeService, type LigneVersion } from "./ga4.ts"
import { step, fail } from "../shared/log.ts"

const SCOPE = "measure"

type Mesure = { propriete: string; compteDeService: string }
type Test = { id: string; etat: string; lanceLe?: string }

export type Resultats = {
  luLe: string
  depuis: string
  source: "ga4" | "exemple"
  versions: Record<string, { n: number; c: number }>
}

export async function mesurer(campagne: string, exemple = false): Promise<Resultats> {
  const tests: Test[] = JSON.parse(await readFile(join(campagne, "tests.json"), "utf8").catch(() => "[]"))
  const vivants = tests.filter((t) => t.etat === "live" || t.etat === "stop" || t.etat === "gagnant")
  if (!vivants.length && !exemple) fail(SCOPE, `aucun test lancé dans ${campagne} : rien à mesurer`)
  const depuis = vivants.map((t) => t.lanceLe).filter((d): d is string => !!d).sort()[0]?.slice(0, 10)
    ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  let lignes: LigneVersion[]
  if (exemple) {
    lignes = lireRapport(JSON.parse(await readFile(new URL("./exemple-reponse.json", import.meta.url), "utf8")))
    step(SCOPE, `réponse GA4 d'exemple rejouée (${lignes.length} versions)`)
  } else {
    const f = join(campagne, "mesure.json")
    if (!existsSync(f))
      fail(SCOPE, `${f} manquant. Il faut : { "propriete": "<id numérique GA4>", "compteDeService": "<chemin du JSON du compte de service> " }\n` +
        `  → le buyer ajoute l'adresse du compte de service en LECTEUR sur la propriété GA4 du client,\n` +
        `    et crée la dimension personnalisée lpws_variante (portée UTILISATEUR) dans Admin → Définitions personnalisées.`)
    const m: Mesure = JSON.parse(await readFile(f, "utf8"))
    const sa: CompteDeService = JSON.parse(await readFile(m.compteDeService, "utf8"))
    lignes = await rapportParVersion(sa, m.propriete, depuis)
    step(SCOPE, `GA4 propriété ${m.propriete}, depuis le ${depuis} : ${lignes.length} version(s)`)
  }

  const versions: Resultats["versions"] = {}
  for (const l of lignes) versions[l.version] = { n: l.sessions, c: l.conversions }
  const res: Resultats = { luLe: new Date().toISOString(), depuis, source: exemple ? "exemple" : "ga4", versions }
  await writeFile(join(campagne, "resultats.json"), JSON.stringify(res, null, 2))
  for (const [v, x] of Object.entries(versions))
    step(SCOPE, `  ${v.padEnd(28)} ${String(x.n).padStart(6)} sessions  ${String(x.c).padStart(5)} conversions`)
  return res
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("measure/run.ts")) {
  const args = process.argv.slice(2)
  const campagne = args.find((a) => !a.startsWith("--"))
  if (!campagne) fail(SCOPE, "usage : npm run measure -- clients/<client>/<campagne> [--exemple]")
  await mesurer(campagne, args.includes("--exemple"))
}
