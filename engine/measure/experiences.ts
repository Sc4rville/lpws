/**
 * experiences.ts — LA MÉMOIRE (feuille de route 4.1, 4.3, 4.5).
 *
 * Un test qui s'arrête devient une expérience : ce qui a été testé, par quelle règle du brain,
 * sur quel horizon, avec quels chiffres, et son issue — y compris « pas de différence » et
 * « interrompu avant l'horizon ». Un test sans résultat publié reste une information : il dit
 * ce qu'on a déjà essayé chez ce client.
 *
 * `experiences.json`, par campagne, n'est jamais réécrit de zéro : on ajoute ou on met à jour
 * l'expérience d'un lancement (id + date de lancement), rien d'autre.
 *
 * `aEviter` lit toutes les pages d'un client et rend les règles à ne plus reproposer : celles
 * dont la variante a PERDU, et celles que le buyer a refusées. Le brain les écarte et le dit.
 */
import { existsSync } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { lireJson, ecrireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import { juger, mdePour, planifier, type Branche, type Issue } from "./stats.ts"

const Branche_ = z.object({ n: z.number(), c: z.number() })

export const Experience = z.object({
  id: z.string(),
  titre: z.string(),
  teste: z.string(),
  /** la règle du brain qui a produit la variante (absente pour un test écrit à la main) */
  regle: z.string().optional(),
  lanceLe: z.string(),
  finLe: z.string(),
  part: z.number(),
  mde: z.number(),
  controle: Branche_.nullable(),
  variante: Branche_.nullable(),
  /** l'issue au moment de l'arrêt ; « interrompu » = arrêté avant d'avoir le droit de conclure */
  issue: z.enum(["gagnant", "perdant", "nul", "interrompu", "sans-donnees", "srm"]),
  verdict: z.string(),
  deploye: z.boolean(),
  source: z.enum(["ga4", "exemple", "aucune"]),
})
export type Experience = z.infer<typeof Experience>

type Resultats = { luLe: string; source?: string; versions: Record<string, Branche> }

const issueDe = (k: Issue): Experience["issue"] =>
  k === "attente" ? "sans-donnees" : k === "collecte" || k === "jamais" ? "interrompu" : k

const joursEntre = (a: string, b: string) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))

/** Le verdict d'un test, à partir des fichiers de la campagne : le même partout (serveur, archive). */
export async function verdictDe(dir: string, t: Test, maintenant = new Date().toISOString()) {
  const f = fichiersDe(dir)
  const res = await lireJson<Resultats | null>(f.resultats, null)
  const ctx = await lireJson<{ visiteursMois?: number; tauxConversion?: number } | null>(f.contexte, null)
  const o = res?.versions?.controle ?? null, v = res?.versions?.[t.id] ?? null
  const jours = t.lanceLe ? joursEntre(t.lanceLe, t.finLe ?? maintenant) : 0
  // la part pendant la collecte : celle du plan, pas les 100 % d'un gagnant déployé
  const part = t.plan?.part ?? (t.part > 0 && t.part < 100 ? t.part / 100 : 0.5)
  const verdict = juger({
    o, v, part, jours,
    tauxBase: t.plan && !t.plan.tauxSuppose ? t.plan.tauxBase : ctx?.tauxConversion ? ctx.tauxConversion / 100 : null,
    mde: t.plan?.mde ?? mdePour(ctx?.visiteursMois),
    visiteursJour: ctx?.visiteursMois ? ctx.visiteursMois / 30.4 : null,
  })
  return { verdict, o, v, source: (res ? res.source ?? "ga4" : "aucune") as Experience["source"] }
}

/** L'horizon d'un test, fixé au lancement à partir de ce que le buyer a dit de la campagne. */
export async function planAuLancement(dir: string, part: number): Promise<NonNullable<Test["plan"]>> {
  const ctx = await lireJson<{ visiteursMois?: number; tauxConversion?: number } | null>(fichiersDe(dir).contexte, null)
  const p = planifier({ tauxBase: ctx?.tauxConversion ? ctx.tauxConversion / 100 : null, mde: mdePour(ctx?.visiteursMois), part,
    visiteursJour: ctx?.visiteursMois ? ctx.visiteursMois / 30.4 : null })
  return { tauxBase: p.tauxBase, tauxSuppose: p.tauxSuppose, mde: p.mde, part, controle: p.controle, variante: p.variante, jours: p.jours }
}

/** Archive l'expérience d'un test qui cesse de collecter (arrêt ou déploiement du gagnant). */
export async function archiver(dir: string, t: Test, deploye: boolean): Promise<Experience | null> {
  if (!t.lanceLe) return null
  const f = fichiersDe(dir)
  const finLe = t.finLe ?? new Date().toISOString()
  const { verdict, o, v, source } = await verdictDe(dir, { ...t, finLe })
  const spec = await lireJson<{ diagnostic?: { regle?: string } } | null>(f.spec(t.id), null)
  const regle = spec?.diagnostic?.regle ?? (await lireJson<Array<{ nom: string; regle?: string }>>(f.propositions, [])).find((p) => p.nom === t.id)?.regle
  const e: Experience = {
    id: t.id, titre: t.titre, teste: t.teste, regle,
    lanceLe: t.lanceLe, finLe, part: Math.round((t.plan?.part ?? t.part / 100) * 100), mde: verdict.plan.mde,
    controle: o, variante: v, issue: issueDe(verdict.k), verdict: `${verdict.titre}. ${verdict.detail}.`,
    deploye, source,
  }
  const toutes = await lireJson<Experience[]>(f.experiences, [])
  const i = toutes.findIndex((x) => x.id === e.id && x.lanceLe === e.lanceLe)
  // remettre l'original après un déploiement ne réécrit pas l'histoire : il a été déployé
  if (i >= 0) toutes[i] = { ...e, deploye: e.deploye || toutes[i].deploye }; else toutes.push(e)
  await ecrireJson(f.experiences, toutes)
  return e
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
    if (e.regle && e.issue === "perdant") m.set(e.regle, `déjà testée chez ce client (${e.campagne}) : l’original a gagné le ${date(e.finLe)}`)
  for (const r of h.refus)
    if (!m.has(r.regle)) m.set(r.regle, `refusée par le buyer${r.le ? " le " + date(r.le) : ""}${r.raison ? ` : « ${r.raison} »` : ""}`)
  return m
}
