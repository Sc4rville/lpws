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
  parTest?: Record<string, Fenetre>
  /** les lancements déjà remplacés (test relancé) dont GA4 n'a pas fini de compter, par `id@lanceLe` */
  archives?: Record<string, Fenetre>
}

type Fenetre = { depuis: string; jusqua: string; experience?: string; controle: { n: number; c: number } | null; variante: { n: number; c: number } | null }
type Lecteur = (depuis: string, jusqua: string, experience?: string) => Promise<LigneVersion[]>

export const cleLancement = (id: string, lanceLe: string) => `${id}@${lanceLe}`

/** Le délai de GA4 : un test arrêté n'a ses chiffres définitifs qu'ensuite. */
export const DELAI_GA4_MS = 48 * 3_600_000

/** `lireGa4` remplace la lecture de la propriété GA4 (tests) ; la réponse d'exemple, elle, ne touche jamais au journal. */
export async function mesurer(campagne: string, exemple = false, lireGa4?: Lecteur): Promise<Resultats> {
  const f = fichiersDe(campagne)
  const tests = await lireJson<Test[]>(f.tests, [])
  const vivants = tests.filter((t) => t.etat === "live" || t.etat === "stop" || t.etat === "gagnant")
  if (!vivants.length && !exemple) fail(SCOPE, `aucun test lancé dans ${campagne} : rien à mesurer`)
  const depuis = vivants.map((t) => t.lanceLe).filter((d): d is string => !!d).sort()[0]?.slice(0, 10)
    ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  let lignes: LigneVersion[]
  let lire: Lecteur
  if (lireGa4) {
    lire = lireGa4
    lignes = await lire(depuis, "today")
  } else if (exemple) {
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
    lire = (d, j, experience) => rapportParVersion(sa, m.propriete, d, j, experience)
    lignes = await lire(depuis, "today")
    step(SCOPE, `GA4 propriété ${m.propriete}, depuis le ${depuis} : ${lignes.length} version(s)`)
  }

  const versions: Resultats["versions"] = {}
  for (const l of lignes) versions[l.version] = { n: l.sessions, c: l.conversions }
  /* Chaque test se compare à l'original de SA période : des tests successifs ne partagent pas
   * le même contrôle cumulé, et un test relancé repart de son nouveau lancement. GA4 compte au
   * jour : le jour d'une bascule compte pour les deux tests qui se touchent. */
  const parTest: NonNullable<Resultats["parTest"]> = {}
  const archives: NonNullable<Resultats["archives"]> = {}
  const fenetres = new Map<string, Promise<LigneVersion[]>>()
  const fenetre = async (id: string, lanceLe: string, finLe: string | undefined, experience?: string, ciblage = false): Promise<Fenetre> => {
    const d = lanceLe.slice(0, 10), j = finLe?.slice(0, 10) ?? "today"
    if ((ciblage && !experience) || (exemple && experience))
      return { depuis: d, jusqua: j, ...(experience ? { experience } : {}), controle: null, variante: null }
    const cle = `${d}/${j}/${experience ?? ""}`
    if (!fenetres.has(cle)) fenetres.set(cle, lire(d, j, experience))
    const ls = await fenetres.get(cle)!
    const de = (v: string) => { const l = ls.find((x) => x.version === v); return l ? { n: l.sessions, c: l.conversions } : null }
    return { depuis: d, jusqua: j, ...(experience ? { experience } : {}), controle: de("controle"), variante: de(id) }
  }
  for (const t of vivants) if (t.lanceLe) parTest[t.id] = await fenetre(t.id, t.lanceLe, t.finLe, t.experience, !!t.ciblage)
  /* Un test arrêté a été archivé avec ce que GA4 savait à l'arrêt ; ses dernières conversions
   * arrivent jusqu'à 48 h plus tard. On ré-archive donc (même lancement : la ligne est mise à
   * jour, pas dupliquée) tout lancement terminé dont la lecture précède ce délai — y compris
   * celui dont l'écriture a échoué à l'arrêt, et celui qu'une relance a remplacé dans tests.json. */
  const journal = exemple ? [] : await lireJson<Experience[]>(f.experiences, [])
  const enAttente = (luLe: string | null, fin: string) => !luLe || new Date(luLe).getTime() < new Date(fin).getTime() + DELAI_GA4_MS
  const courants = new Set(vivants.filter((t) => t.lanceLe).map((t) => cleLancement(t.id, t.lanceLe!)))
  const aRelire = exemple ? [] : vivants.filter((t) => t.etat !== "live" && t.lanceLe && t.finLe && (() => {
    const e = journal.find((x) => x.test === t.id && x.lanceLe === t.lanceLe)
    return !e || enAttente(e.luLe, t.finLe!)
  })())
  const orphelins: Test[] = journal.filter((e) => e.lanceLe && !courants.has(cleLancement(e.test, e.lanceLe)) && enAttente(e.luLe, e.arreteLe))
    .map((e) => ({ id: e.test, titre: e.titre, teste: e.teste, pourquoi: e.pourquoi, edits: e.edits, part: e.part, etat: "stop",
      creeLe: e.lanceLe!, lanceLe: e.lanceLe, finLe: e.arreteLe, plan: e.plan, regle: e.regle, experience: e.experience, ciblage: e.ciblage }))
  // un lancement remplacé dont l'arrêt n'a jamais été écrit : tests.json en garde la fenêtre
  if (!exemple) for (const t of vivants) for (const a of t.anciens ?? [])
    if (!journal.some((x) => x.test === t.id && x.lanceLe === a.lanceLe))
      orphelins.push({ ...t, etat: "stop", lanceLe: a.lanceLe, finLe: a.finLe, part: a.part, plan: a.plan, experience: a.experience, anciens: undefined })
  for (const t of orphelins) archives[cleLancement(t.id, t.lanceLe!)] = await fenetre(t.id, t.lanceLe!, t.finLe, t.experience, !!t.ciblage)
  const res: Resultats = { luLe: new Date().toISOString(), depuis, source: exemple ? "exemple" : "ga4", versions, parTest, ...(orphelins.length ? { archives } : {}) }
  await ecrireJson(f.resultats, res)
  for (const e of await enregistrerExperiences(campagne, [...aRelire, ...orphelins]))
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
