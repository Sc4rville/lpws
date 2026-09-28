/**
 * puissance.ts — « PEUT-ON CONCLURE ? » : la taille d'échantillon avant de lancer, et le droit
 * de trancher après (feuille de route 4.2).
 *
 * Quatre tests sur cinq ne concluent pas franchement (19 % de gagnants significatifs sur 2 288
 * tests audités, docs/business-model-rapport.md §3). Le dire AVANT de lancer est rare sur le
 * marché, et c'est un argument : « avec votre trafic, ce test ne conclura pas avant 9 semaines,
 * en voici un plus gros ».
 *
 * Test bilatéral sur deux proportions, α = 5 %, puissance 80 %, écart RELATIF (une hausse de
 * 20 % sur 3 % de conversion = 3,6 %). La même formule que l'interface (ui/index.html), ici
 * pour que le serveur, le CLI et le rapport disent la même chose.
 *
 * Usage : npm run conclure -- --taux 3 --visiteurs 800 [--hausse 20] [--part 50]
 *         npm run conclure -- clients/<client>/<campagne>     (les tests de la campagne, avec GA4)
 */
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { lireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import type { Resultats } from "./run.ts"

const SCOPE = "measure/conclure"
const Z_ALPHA = 1.959964 // bilatéral, 5 %
const Z_BETA = 0.841621 // puissance 80 %
/** au-delà, le test ne conclura « jamais » à l'échelle d'une campagne */
export const JOURS_MAX = 56
/** un cycle hebdomadaire complet : lundi et samedi ne convertissent pas pareil */
export const JOURS_MIN = 7
/** en dessous, un taux n'est pas une mesure */
export const CONVERSIONS_MIN = 25

/** Visiteurs par version pour détecter un écart relatif `hausse` sur un taux `p`. */
export function nParVersion(p: number, hausse: number): number {
  if (!(p > 0 && p < 1 && hausse > 0)) return Infinity
  return Math.ceil(2 * (Z_ALPHA + Z_BETA) ** 2 * p * (1 - p) / (p * hausse) ** 2)
}

/** L'écart relatif le plus petit que `n` visiteurs par version peuvent voir. */
export function hausseDetectable(p: number, n: number): number {
  if (!(p > 0 && p < 1 && n > 0)) return Infinity
  return (Z_ALPHA + Z_BETA) * Math.sqrt(2 * p * (1 - p) / n) / p
}

export type Plan = {
  /** taux de conversion actuel, 0-1 */
  taux: number
  /** visiteurs par jour sur la page, toutes versions confondues */
  visiteursJour: number
  /** part du trafic envoyée à la variante, 0-1 */
  part: number
  /** écart relatif visé, 0-1 */
  hausse: number
  nParVersion: number
  jours: number
  /** la hausse qu'on peut espérer voir en JOURS_MAX jours à ce trafic */
  hausseEn8Semaines: number
  conclura: boolean
  phrase: string
}

const pc = (x: number, d = 0) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`
const fr = (x: number) => Math.round(x).toLocaleString("fr-FR")

/** Le plan d'un test : combien de visiteurs, combien de jours, et s'il a une chance de conclure. */
export function planifier(o: { taux: number; visiteursJour: number; part?: number; hausse?: number }): Plan {
  const part = Math.min(0.99, Math.max(0.01, o.part ?? 0.5))
  const hausse = o.hausse ?? 0.2
  const n = nParVersion(o.taux, hausse)
  // la version la moins servie dicte la durée : à 20 % (ou 80 %) de part, l'une des deux ne reçoit que 20 % du trafic
  const parJourMin = o.visiteursJour * Math.min(part, 1 - part)
  const jours = Math.max(JOURS_MIN, Math.ceil(n / parJourMin))
  const hausseEn8Semaines = hausseDetectable(o.taux, parJourMin * JOURS_MAX)
  const conclura = Number.isFinite(jours) && jours <= JOURS_MAX
  const phrase = !Number.isFinite(n) ? "Il faut un taux de conversion actuel et une hausse visée pour estimer la durée."
    : conclura ? `Avec ${fr(o.visiteursJour)} visiteurs par jour et ${pc(o.taux, 1)} de conversion, une hausse de ${pc(hausse)} se voit en ~${fr(jours)} jours (${fr(n)} visiteurs par version, variante à ${pc(part)}).`
    : `À ce trafic, une hausse de ${pc(hausse)} ne se verra pas avant ${fr(jours)} jours : ce test ne conclura pas. En 8 semaines, seule une hausse d'au moins ${pc(hausseEn8Semaines)} serait visible : testez un changement plus gros (structure, offre), pas un mot.`
  return { taux: o.taux, visiteursJour: o.visiteursJour, part, hausse, nParVersion: n, jours, hausseEn8Semaines, conclura, phrase }
}

/* ---------- après : a-t-on le droit de trancher ? ---------- */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1; x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))
}
const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

export type Bilan = {
  k: "attendre" | "gagnant" | "perdant" | "neutre" | "jamais" | "repartition"
  phrase: string
  lift: number
  certitude: number
  /** l'intervalle à 95 % de l'écart relatif */
  fourchette: [number, number]
  gardes: string[]
}

/**
 * Le verdict d'un test, avec ses garde-fous :
 * - pas avant un cycle hebdomadaire complet ni avant CONVERSIONS_MIN par version ;
 * - un « gagnant » avant l'échantillon prévu est signalé comme précoce (le risque du coup d'œil) ;
 * - répartition anormale (SRM) : si la variante reçoit nettement plus ou moins que sa part, le
 *   test mesure un défaut de répartition, pas la page — aucun verdict.
 */
export function bilan(o: { n: number; c: number }, v: { n: number; c: number }, opts: { jours: number; part: number; plan?: Plan }): Bilan {
  const p1 = o.n ? o.c / o.n : 0, p2 = v.n ? v.c / v.n : 0
  const p = (o.c + v.c) / Math.max(1, o.n + v.n)
  const se0 = Math.sqrt(p * (1 - p) * (1 / Math.max(1, o.n) + 1 / Math.max(1, v.n)))
  const z = se0 > 0 ? (p2 - p1) / se0 : 0
  const certitude = 2 * normCdf(Math.abs(z)) - 1
  const lift = p1 > 0 ? (p2 - p1) / p1 : 0
  const se = Math.sqrt(p1 * (1 - p1) / Math.max(1, o.n) + p2 * (1 - p2) / Math.max(1, v.n))
  const fourchette: [number, number] = p1 > 0 ? [(p2 - p1 - Z_ALPHA * se) / p1, (p2 - p1 + Z_ALPHA * se) / p1] : [0, 0]
  const gardes: string[] = []
  const base = { lift, certitude, fourchette, gardes }

  // SRM : khi-deux à un degré de liberté, seuil p < 0,001 (celui d'Optimizely, de Microsoft)
  const total = o.n + v.n
  if (total >= 200) {
    const attenduV = total * opts.part, attenduO = total - attenduV
    const khi2 = (v.n - attenduV) ** 2 / attenduV + (o.n - attenduO) ** 2 / attenduO
    if (khi2 > 10.83)
      return { ...base, k: "repartition", phrase: `La variante a reçu ${pc(v.n / total)} des visiteurs au lieu de ${pc(opts.part)} : la répartition est faussée (bloqueur, redirection, balise absente sur une partie du trafic). Aucun verdict tant que ce n'est pas corrigé.`, gardes: ["répartition anormale"] }
  }
  const minConv = Math.min(o.c, v.c)
  if (opts.jours < JOURS_MIN) gardes.push(`moins de ${JOURS_MIN} jours : un cycle de semaine complet est nécessaire`)
  if (minConv < CONVERSIONS_MIN) gardes.push(`il manque ${CONVERSIONS_MIN - minConv} conversions sur la version la moins vue`)
  const prevu = opts.plan?.nParVersion
  const atteint = prevu && Number.isFinite(prevu) ? Math.min(o.n, v.n) >= prevu : true
  if (!atteint) gardes.push(`échantillon prévu non atteint (${fr(Math.min(o.n, v.n))} / ${fr(prevu!)} par version)`)

  if (opts.plan && !opts.plan.conclura && opts.jours >= JOURS_MAX && certitude < 0.95)
    return { ...base, k: "jamais", phrase: `Après ${opts.jours} jours, l'écart n'est pas net et ce trafic ne le rendra pas net : arrêtez et testez un changement plus gros.` }
  if (opts.jours < JOURS_MIN || minConv < CONVERSIONS_MIN)
    return { ...base, k: "attendre", phrase: `Pas encore assez de données : ${gardes.join(" ; ")}.` }
  if (certitude >= 0.95) {
    const precoce = !atteint ? " Attention : gagnant précoce, avant l'échantillon prévu : un écart vu trop tôt est souvent exagéré. Laissez courir jusqu'au bout avant de déployer." : ""
    return lift > 0
      ? { ...base, k: "gagnant", phrase: `La variante fait mieux : ${lift >= 0 ? "+" : ""}${pc(lift, 1)}, certitude ${pc(certitude)}.${precoce}` }
      : { ...base, k: "perdant", phrase: `L'original fait mieux : ${pc(lift, 1)}, certitude ${pc(certitude)}. Remettez l'original et testez autre chose.${precoce}` }
  }
  if (atteint) return { ...base, k: "neutre", phrase: `Échantillon atteint, écart non significatif (${lift >= 0 ? "+" : ""}${pc(lift, 1)}, certitude ${pc(certitude)}) : non concluant. C'est un résultat : on l'enregistre, et on ne re-proposera pas ce test.` }
  return { ...base, k: "attendre", phrase: `Écart pas encore net (${lift >= 0 ? "+" : ""}${pc(lift, 1)}, certitude ${pc(certitude)}) : ${gardes.join(" ; ")}.` }
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs()
  const [dir] = args.libres
  if (dir) {
    const f = fichiersDe(dir)
    const tests = await lireJson<Test[]>(f.tests, [])
    const res = await lireJson<Resultats | null>(f.resultats, null)
    if (!tests.length) fail(SCOPE, `aucun test dans ${dir}`)
    for (const t of tests) {
      const o = res?.versions.controle, v = res?.versions[t.id]
      const jours = t.lanceLe ? Math.floor((Date.now() - Date.parse(t.lanceLe)) / 86_400_000) : 0
      if (t.plan) step(SCOPE, `${t.id} · plan : ${t.plan.phrase}`)
      if (o && v) step(SCOPE, `${t.id} · ${bilan(o, v, { jours, part: (t.part || 50) / 100, plan: t.plan }).phrase}`)
      else step(SCOPE, `${t.id} · pas encore de résultats GA4`)
    }
  } else {
    const taux = Number(args.option("--taux")) / 100, visiteurs = Number(args.option("--visiteurs"))
    if (!(taux > 0) || !(visiteurs > 0)) fail(SCOPE, "usage : npm run conclure -- --taux <%> --visiteurs <par jour> [--hausse 20] [--part 50]  |  npm run conclure -- clients/<client>/<campagne>")
    const plan = planifier({ taux, visiteursJour: visiteurs, hausse: args.option("--hausse") ? Number(args.option("--hausse")) / 100 : undefined, part: args.option("--part") ? Number(args.option("--part")) / 100 : undefined })
    step(SCOPE, plan.phrase)
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n")
  }
}
