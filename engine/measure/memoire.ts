/**
 * memoire.ts — LA MÉMOIRE DU CLIENT : chaque test, gagné, perdu, non concluant ou refusé, reste
 * (feuille de route 4.1 et 4.3, docs/business-model-rapport.md §6 « mémoire du client »).
 *
 * Aujourd'hui, un test arrêté disparaît dans tests.json d'une page. Or « on a déjà testé ça en
 * mars » est ce qu'un buyer perd le plus souvent quand il change de client, de campagne ou de
 * freelance. La mémoire est donc au niveau du CLIENT (clients/<client>/memoire.json), toutes
 * pages confondues, et elle sert à deux choses :
 *
 *   1. le brain ne re-propose pas une hypothèse déjà perdue ou déjà refusée (`ecarter`) ;
 *   2. chaque règle de la knowledge base accumule ses résultats réels (`bilanDesRegles`) : la
 *      confiance d'une règle se lit sur ce qu'elle a produit, pas sur ce qu'elle promet.
 *
 * `consigner` est idempotent : il relit tests.json, resultats.json et propositions.json d'une
 * campagne et met à jour les expériences qui en viennent. Le serveur l'appelle à l'arrêt d'un
 * test et au refus d'une proposition ; `npm run measure` et le brain l'appellent aussi.
 *
 * Aucun chiffre n'est inventé : un test arrêté sans résultats GA4 est consigné « sans mesure ».
 *
 * Usage : npm run memoire -- clients/<client>/<campagne>   (consigne, puis affiche la mémoire du client)
 */
import { basename } from "node:path"
import { z } from "zod"
import { lireJson, ecrireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import { bilan, type Bilan } from "./puissance.ts"
import type { Resultats } from "./run.ts"
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"

export const Verdict = z.enum(["gagnant", "perdant", "neutre", "jamais", "repartition", "attendre", "sans-mesure", "refusee"])
export type Verdict = z.infer<typeof Verdict>

export const Experience = z.object({
  /** `<campagne>/<test>` : unique pour le client */
  id: z.string(),
  campagne: z.string(),
  test: z.string(),
  titre: z.string(),
  hypothese: z.string(),
  /** la règle de la knowledge base, ou « media-buyer » pour un test écrit à la main */
  regle: z.string(),
  /** les ancres touchées et le texte essayé : pour reconnaître le même test sous un autre nom */
  edits: z.array(z.object({ anchor: z.string(), text: z.string() })),
  lanceLe: z.string().optional(),
  finLe: z.string().optional(),
  jours: z.number().optional(),
  part: z.number().optional(),
  mesure: z.object({ o: z.object({ n: z.number(), c: z.number() }), v: z.object({ n: z.number(), c: z.number() }), source: z.string() }).optional(),
  lift: z.number().optional(),
  certitude: z.number().optional(),
  verdict: Verdict,
  phrase: z.string(),
  raison: z.string().optional(),
  consigneLe: z.string(),
})
export type Experience = z.infer<typeof Experience>

export async function lireMemoire(campagneDir: string): Promise<Experience[]> {
  const brut = await lireJson<unknown[]>(fichiersDe(campagneDir).memoire, [])
  return brut.flatMap((x) => { const r = Experience.safeParse(x); return r.success ? [r.data] : [] })
}

type Proposition = { nom: string; titre: string; teste: string; pourquoi?: string; regle: string; refusee?: boolean; refuseeLe?: string; raison?: string; fichier?: string }

/** Met à jour la mémoire du client avec ce que cette campagne a appris. Rend la mémoire complète. */
export async function consigner(campagneDir: string): Promise<Experience[]> {
  const f = fichiersDe(campagneDir)
  const camp = basename(campagneDir)
  const tests = await lireJson<Test[]>(f.tests, [])
  const res = await lireJson<Resultats | null>(f.resultats, null)
  const props = await lireJson<Proposition[]>(f.propositions, [])
  const memoire = new Map((await lireMemoire(campagneDir)).map((e) => [e.id, e]))
  const maintenant = new Date().toISOString()

  for (const t of tests) {
    if (t.etat !== "stop" && t.etat !== "gagnant") continue
    if (!t.lanceLe) continue // arrêté avant d'avoir été lancé : rien n'a été appris
    const fin = t.finLe ?? maintenant
    const jours = Math.max(0, Math.floor((Date.parse(fin) - Date.parse(t.lanceLe)) / 86_400_000))
    const o = res?.versions.controle, v = res?.versions[t.id]
    const b: Bilan | null = o && v ? bilan(o, v, { jours, part: (t.part || 50) / 100, plan: t.plan }) : null
    const verdict: Verdict = b ? b.k : "sans-mesure"
    memoire.set(`${camp}/${t.id}`, {
      id: `${camp}/${t.id}`, campagne: camp, test: t.id, titre: t.titre, hypothese: t.teste || t.pourquoi,
      regle: t.regle ?? "media-buyer", edits: t.edits.map((e) => ({ anchor: e.anchor, text: e.text })),
      lanceLe: t.lanceLe, finLe: fin, jours, part: t.part,
      mesure: o && v ? { o, v, source: res!.source } : undefined,
      lift: b?.lift, certitude: b?.certitude, verdict,
      phrase: b ? b.phrase : "Arrêté sans résultats GA4 : on sait qu'il a tourné, pas ce qu'il a donné.",
      consigneLe: maintenant,
    })
  }
  for (const p of props) {
    if (!p.refusee) continue
    const id = `${camp}/${p.nom}`
    if (memoire.has(id) && memoire.get(id)!.verdict !== "refusee") continue
    memoire.set(id, {
      id, campagne: camp, test: p.nom, titre: p.titre, hypothese: p.teste, regle: p.regle, edits: [],
      verdict: "refusee", phrase: "Refusée par le buyer avant d'être testée.", raison: p.raison || undefined,
      consigneLe: p.refuseeLe ?? maintenant,
    })
  }
  const tout = [...memoire.values()].sort((a, b) => (b.finLe ?? b.consigneLe).localeCompare(a.finLe ?? a.consigneLe))
  await ecrireJson(f.memoire, tout)
  return tout
}

/** Ce qui ferme une piste : perdue, non concluante à échantillon atteint, ou refusée par le buyer. */
const FERME: Verdict[] = ["perdant", "neutre", "jamais", "refusee"]

/**
 * Les constats du brain qu'on ne re-propose pas, et pourquoi.
 * Une règle perdue ou non concluante est écartée pour TOUTES les pages du client (le public est
 * le même) ; une proposition refusée ne l'est que pour la page où elle a été refusée (le buyer a
 * peut-être refusé la formulation, pas l'idée).
 */
export function ecarter<K extends { id: string }>(constats: K[], memoire: Experience[], campagne: string): { gardes: K[]; ecartes: Array<{ id: string; raison: string }> } {
  const gardes: K[] = [], ecartes: Array<{ id: string; raison: string }> = []
  for (const k of constats) {
    const e = memoire.find((x) => x.regle === k.id && FERME.includes(x.verdict) && (x.verdict !== "refusee" || x.campagne === campagne))
    if (!e) { gardes.push(k); continue }
    const quand = (e.finLe ?? e.consigneLe).slice(0, 10)
    ecartes.push({ id: k.id, raison: e.verdict === "refusee"
      ? `refusée par le buyer le ${quand}${e.raison ? ` (« ${e.raison} »)` : ""}`
      : `déjà testée le ${quand} sur ${e.campagne} (« ${e.titre} ») : ${e.verdict === "perdant" ? "l'original a gagné" : "non concluant"}` })
  }
  return { gardes, ecartes }
}

export type BilanRegle = { regle: string; tests: number; gagnants: number; perdants: number; neutres: number; refusees: number; sansMesure: number; liftMoyen: number | null }

/** Ce que chaque règle a réellement produit chez ce client. */
export function bilanDesRegles(memoire: Experience[]): BilanRegle[] {
  const par = new Map<string, BilanRegle & { lifts: number[] }>()
  for (const e of memoire) {
    const b = par.get(e.regle) ?? { regle: e.regle, tests: 0, gagnants: 0, perdants: 0, neutres: 0, refusees: 0, sansMesure: 0, liftMoyen: null, lifts: [] }
    if (e.verdict === "refusee") b.refusees++
    else {
      b.tests++
      if (e.verdict === "gagnant") b.gagnants++
      else if (e.verdict === "perdant") b.perdants++
      else if (e.verdict === "sans-mesure") b.sansMesure++
      else b.neutres++
      if (e.lift !== undefined && e.verdict !== "repartition") b.lifts.push(e.lift)
    }
    par.set(e.regle, b)
  }
  return [...par.values()].map(({ lifts, ...b }) => ({ ...b, liftMoyen: lifts.length ? lifts.reduce((s, x) => s + x, 0) / lifts.length : null }))
    .sort((a, b) => b.tests + b.refusees - a.tests - a.refusees)
}

/* CLI */
if (estLance(import.meta.url)) {
  const [dir] = lireArgs().libres
  if (!dir) fail("measure/memoire", "usage : npm run memoire -- clients/<client>/<campagne>")
  const m = await consigner(dir)
  for (const e of m) step("measure/memoire", `${(e.finLe ?? e.consigneLe).slice(0, 10)} · ${e.campagne} · ${e.regle} · ${e.verdict}${e.lift !== undefined ? ` (${(e.lift * 100).toFixed(1)} %)` : ""} · ${e.titre}`)
  for (const b of bilanDesRegles(m)) step("measure/memoire", `règle ${b.regle} : ${b.tests} test(s), ${b.gagnants} gagnant(s), ${b.perdants} perdant(s), ${b.refusees} refus`)
  if (!m.length) step("measure/memoire", "aucune expérience encore")
}
