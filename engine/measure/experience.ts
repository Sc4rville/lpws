/**
 * experience.ts — LE JOURNAL DES EXPÉRIENCES : ce qu'un test a donné, gardé quand il s'arrête,
 * et la mémoire qu'on en tire pour le client (feuille de route 4.1, 4.3, 4.5).
 *
 * `resultats.json` est un instantané que la mesure suivante écrase, et `tests.json` ne garde que
 * l'état courant : sans ce journal, un test arrêté ne laisse aucune trace de ce qu'il a montré.
 * Chaque arrêt (ou déploiement du gagnant) écrit une ligne dans `experiences.json` : les éditions,
 * la règle du brain, l'horizon fixé au lancement, l'échantillon lu dans GA4, la fourchette de la
 * hausse et la conclusion, y compris « non concluant » et « trop tôt ». Une ligne par lancement
 * (test + date de lancement) : ré-archiver le même lancement la met à jour.
 *
 * La conclusion est celle de `stats.ts`, jugée contre l'horizon fixé au lancement : un écart vu
 * avant l'horizon reste « trop tôt », même s'il paraît net.
 *
 * `aEviter` lit toutes les pages d'un client et rend les règles à ne plus reproposer : celles
 * dont la variante a PERDU, et celles que le buyer a refusées. Le brain les écarte et le dit.
 */
import { existsSync } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { campagne as fichiersDe, Experience, type Test } from "../shared/campagne.ts"
import { lireJson, ecrireJson } from "../shared/json.ts"
import { juger, mdePour, planifier, type Issue, type Verdict } from "./stats.ts"
import type { Resultats } from "./run.ts"

type Compte = { n: number; c: number }
type Ctx = { visiteursMois?: number; tauxConversion?: number } | null

const Z95 = 1.96

/** L'intervalle à 95 % de la hausse relative de la variante, ou null si l'original n'a rien converti. */
function hausse(o: Compte | null, v: Compte | null): Experience["hausse"] {
  if (!o || !v || o.n <= 0 || v.n <= 0) return null
  const p1 = o.c / o.n, p2 = v.c / v.n
  if (p1 <= 0) return null
  const se = Math.sqrt(p1 * (1 - p1) / o.n + p2 * (1 - p2) / v.n)
  return { lo: (p2 - p1 - Z95 * se) / p1, mid: (p2 - p1) / p1, hi: (p2 - p1 + Z95 * se) / p1 }
}

const CONCLUSION: Record<Issue, Experience["conclusion"]> = {
  attente: "sans données", collecte: "trop tôt", jamais: "trop tôt",
  gagnant: "gagnant", perdant: "perdant", nul: "non concluant", srm: "répartition faussée",
}

const joursEntre = (a: string, b: string) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))
const visiteursJour = (ctx: Ctx) => ctx?.visiteursMois ? ctx.visiteursMois / 30.4 : null

/** L'horizon d'un test, fixé au lancement à partir de ce que le buyer a dit de la campagne. */
export async function planAuLancement(dir: string, part: number): Promise<NonNullable<Test["plan"]>> {
  const ctx = await lireJson<Ctx>(fichiersDe(dir).contexte, null)
  const p = planifier({ tauxBase: ctx?.tauxConversion ? ctx.tauxConversion / 100 : null, mde: mdePour(ctx?.visiteursMois), part, visiteursJour: visiteursJour(ctx) })
  return { tauxBase: p.tauxBase, tauxSuppose: p.tauxSuppose, mde: p.mde, part, controle: p.controle, variante: p.variante, jours: p.jours }
}

/** L'original et la variante d'un test, comptés sur sa fenêtre quand la mesure l'a fournie. */
export function comptes(res: Resultats | null, id: string): { o: Compte | null; v: Compte | null } {
  const p = res?.parTest?.[id]
  if (p) return { o: p.controle, v: p.variante }
  return { o: res?.versions?.controle ?? null, v: res?.versions?.[id] ?? null }
}

/** Le verdict d'un test à partir des fichiers de la campagne : le même au serveur et au journal. */
export async function verdictDe(dir: string, t: Test, maintenant = new Date().toISOString()): Promise<{ verdict: Verdict; o: Compte | null; v: Compte | null; res: Resultats | null }> {
  const f = fichiersDe(dir)
  const res = await lireJson<Resultats | null>(f.resultats, null)
  const ctx = await lireJson<Ctx>(f.contexte, null)
  const { o, v } = comptes(res, t.id)
  const verdict = juger({
    o, v, jours: t.lanceLe ? joursEntre(t.lanceLe, t.finLe ?? maintenant) : 0,
    // la part pendant la collecte : celle du plan, pas les 100 % d'un gagnant déployé
    part: t.plan?.part ?? (t.part > 0 && t.part < 100 ? t.part / 100 : 0.5),
    tauxBase: t.plan && !t.plan.tauxSuppose ? t.plan.tauxBase : ctx?.tauxConversion ? ctx.tauxConversion / 100 : null,
    mde: t.plan?.mde ?? mdePour(ctx?.visiteursMois),
    visiteursJour: visiteursJour(ctx),
    cible: t.plan ? { controle: t.plan.controle, variante: t.plan.variante } : null,
  })
  return { verdict, o, v, res }
}

/** Écrit au journal de la campagne une expérience par test qui a cessé de collecter ; renvoie ce qui a été écrit. */
export async function enregistrerExperiences(dir: string, arretes: Test[], arreteLe = new Date().toISOString()): Promise<Experience[]> {
  if (!arretes.length) return []
  const f = fichiersDe(dir)
  const journal = await lireJson<Experience[]>(f.experiences, [])
  const propositions = await lireJson<Array<{ nom: string; regle?: string }>>(f.propositions, [])
  const nouvelles: Experience[] = []
  for (const t of arretes) {
    const fin = t.finLe ?? arreteLe
    const { verdict, o, v, res } = await verdictDe(dir, { ...t, finLe: fin })
    const spec = await lireJson<{ diagnostic?: { regle?: string } } | null>(f.spec(t.id), null)
    const i = journal.findIndex((x) => x.test === t.id && x.lanceLe === t.lanceLe)
    const e = Experience.parse({
      test: t.id, titre: t.titre, teste: t.teste, pourquoi: t.pourquoi, edits: t.edits,
      part: Math.round((t.plan?.part ?? t.part / 100) * 100),
      lanceLe: t.lanceLe, arreteLe: fin, controle: o, variante: v,
      luLe: res?.luLe ?? null, source: res ? res.source ?? "ga4" : null,
      hausse: hausse(o, v), conclusion: CONCLUSION[verdict.k],
      regle: spec?.diagnostic?.regle ?? propositions.find((p) => p.nom === t.id)?.regle,
      plan: t.plan, verdict: `${verdict.titre}. ${verdict.detail}.`,
      // remettre l'original après un déploiement ne réécrit pas l'histoire : il a été déployé
      deploye: t.etat === "gagnant" || (i >= 0 && journal[i].deploye === true),
    })
    if (i >= 0) journal[i] = e; else journal.push(e)
    nouvelles.push(e)
  }
  await ecrireJson(f.experiences, journal)
  return nouvelles
}

/** Un test déjà arrêté puis déployé : seul le drapeau change, ses chiffres restent ceux de l'arrêt. */
export async function marquerDeploye(dir: string, t: Test): Promise<boolean> {
  const f = fichiersDe(dir)
  const journal = await lireJson<Experience[]>(f.experiences, [])
  const e = journal.find((x) => x.test === t.id && x.lanceLe === t.lanceLe)
  if (!e) return false
  e.deploye = true
  await ecrireJson(f.experiences, journal)
  return true
}

/** Un arrêt annulé : le test reprend, son expérience n'est pas finie. */
export async function retirerExperience(dir: string, t: Test): Promise<void> {
  const f = fichiersDe(dir)
  const journal = await lireJson<Experience[]>(f.experiences, [])
  const reste = journal.filter((x) => !(x.test === t.id && x.lanceLe === t.lanceLe))
  if (reste.length !== journal.length) await ecrireJson(f.experiences, reste)
}

export type Refus = { regle: string; raison: string; le?: string }

/** Tout ce qu'on sait déjà d'un client, toutes pages confondues. */
export async function historique(clientDir: string): Promise<{ experiences: Array<Experience & { campagne: string }>; refus: Refus[] }> {
  const experiences: Array<Experience & { campagne: string }> = [], refus: Refus[] = []
  if (!existsSync(clientDir)) return { experiences, refus }
  for (const camp of await readdir(clientDir)) {
    const d = join(clientDir, camp)
    if (!(await stat(d)).isDirectory()) continue
    const f = fichiersDe(d)
    for (const x of await lireJson<unknown[]>(f.experiences, [])) {
      const e = Experience.safeParse(x)
      if (e.success) experiences.push({ ...e.data, campagne: camp })
    }
    for (const p of await lireJson<Array<{ regle?: string; refusee?: boolean; raison?: string; refuseeLe?: string }>>(f.propositions, []))
      if (p.refusee && p.regle) refus.push({ regle: p.regle, raison: p.raison ?? "", le: p.refuseeLe })
  }
  return { experiences, refus }
}

/** Les règles à ne plus reproposer chez ce client, avec la raison que le brain affichera. */
export function aEviter(h: Awaited<ReturnType<typeof historique>>): Map<string, string> {
  const m = new Map<string, string>()
  const date = (iso?: string) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""
  for (const e of h.experiences)
    if (e.regle && e.conclusion === "perdant") m.set(e.regle, `déjà testée chez ce client (${e.campagne}) : l’original a gagné le ${date(e.arreteLe)}`)
  for (const r of h.refus)
    if (!m.has(r.regle)) m.set(r.regle, `refusée par le buyer${r.le ? " le " + date(r.le) : ""}${r.raison ? ` : « ${r.raison} »` : ""}`)
  return m
}
