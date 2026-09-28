/**
 * stats.ts — LE DROIT DE CONCLURE (feuille de route 4.2).
 *
 * Un écart précoce se retourne souvent : regarder la certitude chaque jour et s'arrêter dès
 * qu'elle passe 95 % fabrique des faux gagnants. On fait donc ce que font les équipes
 * d'expérimentation sérieuses, sans jargon pour le buyer :
 *
 *   1. un HORIZON fixé avant de regarder : le nombre de visiteurs par version qui permet de
 *      voir une hausse donnée (l'effet minimal détectable, `mde`) avec 80 % de puissance ;
 *   2. un verdict ordinaire (p < 0,05) seulement une fois l'horizon ET une semaine pleine
 *      atteints — une semaine, parce que le lundi ne convertit pas comme le samedi ;
 *   3. un arrêt anticipé réservé aux écarts écrasants (|z| ≥ 3, règle de Haybittle–Peto),
 *      qui laisse le risque d'erreur global quasiment intact ;
 *   4. un garde-fou de répartition (SRM) : si la part observée s'écarte de la part réglée,
 *      la balise ou le trafic ont un problème et aucun résultat n'est fiable ;
 *   5. l'aveu « ce test ne conclura pas » quand, au rythme observé, l'horizon dépasse huit
 *      semaines : mieux vaut un changement plus franc qu'un test qui ne dira rien.
 *
 * Le taux de conversion de base qui sert à l'horizon est ré-estimé sur le taux GLOBAL
 * (les deux versions confondues) dès qu'il y a assez de conversions : cette ré-estimation
 * « à l'aveugle » ne regarde pas l'écart et ne biaise pas le test.
 *
 * Aucune importation : ce fichier s'exécute aussi dans le navigateur (ui/index.html l'embarque
 * sous le nom global STATS) — le serveur et l'écran rendent exactement le même verdict.
 */

export type Branche = { n: number; c: number }

export const REGLES = {
  alpha: 0.05,
  puissance: 0.8,
  /** |z| au-delà duquel on peut s'arrêter avant l'horizon (≈ p < 0,003) */
  zArret: 3,
  joursMin: 7,
  /** au-delà de huit semaines, un test ne conclura pas en pratique (saisons, pages qui changent) */
  joursMax: 56,
  /** sous ce nombre de conversions sur la version la moins servie, l'approximation normale ment */
  convMin: 25,
  /** seuil habituel du test de répartition : très strict, on ne crie pas au loup */
  srmP: 0.001,
  tauxDefaut: 0.03,
} as const

const Z_ALPHA = 1.959964
const Z_BETA = 0.841621

/** fonction de répartition de la loi normale (Abramowitz & Stegun 7.1.26) */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** L'effet minimal détectable qu'on vise, selon le trafic : peu de visiteurs → changements francs. */
export function mdePour(visiteursMois?: number | null): number {
  if (!visiteursMois) return 0.15
  return visiteursMois < 200_000 ? 0.2 : 0.1
}

/** Visiteurs nécessaires par version pour voir une hausse relative `mde` d'un taux `p`, `part` sur la variante. */
export function nParBranche(p: number, mde: number, part = 0.5): { controle: number; variante: number } {
  if (!(p > 0 && p < 1 && mde > 0 && part > 0 && part < 1)) return { controle: Infinity, variante: Infinity }
  const p2 = Math.min(0.9999, p * (1 + mde))
  const total = (Z_ALPHA + Z_BETA) ** 2 * (p * (1 - p) / (1 - part) + p2 * (1 - p2) / part) / (p2 - p) ** 2
  return { controle: Math.ceil(total * (1 - part)), variante: Math.ceil(total * part) }
}

export type Plan = {
  tauxBase: number
  /** le taux de base est une hypothèse (aucune donnée ni chiffre donné par le buyer) */
  tauxSuppose: boolean
  mde: number
  part: number
  controle: number
  variante: number
  visiteursJour: number | null
  jours: number | null
  faisable: boolean | null
  /** la plus petite hausse détectable en huit semaines à ce trafic */
  mdeEnHuitSemaines: number | null
}

export function planifier(e: { tauxBase?: number | null; mde?: number | null; part: number; visiteursJour?: number | null }): Plan {
  const tauxSuppose = !(e.tauxBase && e.tauxBase > 0 && e.tauxBase < 1)
  const tauxBase = tauxSuppose ? REGLES.tauxDefaut : e.tauxBase!
  const mde = e.mde && e.mde > 0 ? e.mde : 0.15
  const n = nParBranche(tauxBase, mde, e.part)
  const vj = e.visiteursJour && e.visiteursJour > 0 ? e.visiteursJour : null
  const jours = vj && Number.isFinite(n.controle) ? Math.max(REGLES.joursMin, Math.ceil((n.controle + n.variante) / vj)) : null
  let mdeEnHuitSemaines: number | null = null
  if (vj) {
    const budget = vj * REGLES.joursMax
    let lo = 0.001, hi = 20
    if ((() => { const x = nParBranche(tauxBase, hi, e.part); return x.controle + x.variante > budget })()) mdeEnHuitSemaines = null
    else {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        const x = nParBranche(tauxBase, mid, e.part)
        if (x.controle + x.variante > budget) lo = mid; else hi = mid
      }
      mdeEnHuitSemaines = hi
    }
  }
  return { tauxBase, tauxSuppose, mde, part: e.part, ...n, visiteursJour: vj, jours, faisable: jours === null ? null : jours <= REGLES.joursMax, mdeEnHuitSemaines }
}

export type Comparaison = {
  p1: number
  p2: number
  /** hausse relative de la variante sur l'original */
  lift: number
  z: number
  pValeur: number
  /** 1 − p : ce que l'écran appelle « certitude » */
  conf: number
  /** intervalle à 95 % de la hausse relative */
  ic: { lo: number; hi: number; mid: number }
}

export function comparer(o: Branche, v: Branche): Comparaison {
  const p1 = o.c / o.n, p2 = v.c / v.n, p = (o.c + v.c) / (o.n + v.n)
  const se0 = Math.sqrt(p * (1 - p) * (1 / o.n + 1 / v.n))
  const z = se0 > 0 ? (p2 - p1) / se0 : 0
  const pValeur = 2 * (1 - normCdf(Math.abs(z)))
  const se = Math.sqrt(p1 * (1 - p1) / o.n + p2 * (1 - p2) / v.n)
  const rel = (x: number) => p1 > 0 ? x / p1 : 0
  return { p1, p2, lift: rel(p2 - p1), z, pValeur, conf: 1 - pValeur,
    ic: { lo: rel(p2 - p1 - Z_ALPHA * se), hi: rel(p2 - p1 + Z_ALPHA * se), mid: rel(p2 - p1) } }
}

export type Repartition = { attendue: number; observee: number; pValeur: number; alerte: boolean }

/** Sample ratio mismatch : χ² à un degré de liberté entre la part réglée et la part servie. */
export function repartition(o: Branche, v: Branche, part: number): Repartition {
  const n = o.n + v.n
  const eo = n * (1 - part), ev = n * part
  const chi2 = eo > 0 && ev > 0 ? (o.n - eo) ** 2 / eo + (v.n - ev) ** 2 / ev : 0
  const pValeur = 2 * (1 - normCdf(Math.sqrt(chi2)))
  return { attendue: part, observee: n ? v.n / n : 0, pValeur, alerte: n >= 200 && pValeur < REGLES.srmP }
}

export type Issue = "attente" | "collecte" | "gagnant" | "perdant" | "nul" | "jamais" | "srm"

export type Verdict = {
  k: Issue
  /** la phrase courte, en gras */
  titre: string
  /** ce qu'il faut faire, en une phrase */
  detail: string
  jalons: { conv: boolean; vol: boolean; duree: boolean; net: boolean }
  /** avancement vers l'horizon, de 0 à 1 */
  progression: number
  joursRestants: number | null
  anticipe: boolean
  stats: Comparaison | null
  plan: Plan
  srm: Repartition | null
}

const pc = (x: number, d = 0) => (x * 100).toLocaleString("fr-FR", { maximumFractionDigits: d }) + " %"
const signe = (x: number) => (x >= 0 ? "+" : "−") + pc(Math.abs(x))
const nombre = (x: number) => Math.round(x).toLocaleString("fr-FR")
const semaines = (j: number) => j >= 14 ? `${Math.round(j / 7)} semaines` : `${j} jours`

export type EntreeVerdict = {
  o?: Branche | null
  v?: Branche | null
  /** part sur la variante, de 0 à 1 */
  part: number
  /** jours depuis le lancement */
  jours: number
  /** taux de conversion de la page avant le test, s'il est connu */
  tauxBase?: number | null
  mde?: number | null
  /** trafic attendu avant d'avoir des données (visiteurs par mois / 30) */
  visiteursJour?: number | null
  /** l'échantillon par version figé au lancement : s'il est là, c'est lui qui donne le volume */
  cible?: { controle: number; variante: number } | null
}

export function juger(e: EntreeVerdict): Verdict {
  const part = e.part > 0 && e.part < 1 ? e.part : 0.5
  const { o, v } = e
  const fige = (p: Plan): Plan => e.cible ? { ...p, controle: e.cible.controle, variante: e.cible.variante } : p
  const planInitial = fige(planifier({ tauxBase: e.tauxBase, mde: e.mde, part, visiteursJour: e.visiteursJour }))
  const vide = { jalons: { conv: false, vol: false, duree: false, net: false }, progression: 0, joursRestants: planInitial.jours, anticipe: false, stats: null, plan: planInitial, srm: null }
  if (!o || !v || o.n <= 0 || v.n <= 0)
    return { k: "attente", titre: "En attente des premières données", detail: "Les conversions arrivent de GA4, en général le lendemain", ...vide }

  const s = comparer(o, v)
  const srm = repartition(o, v, part)
  const jours = Math.max(0, e.jours)
  const convTotal = o.c + v.c
  // sans plan figé (test d'avant les plans) : ré-estimation à l'aveugle, le taux global, jamais l'écart
  const tauxBase = !e.cible && convTotal >= REGLES.convMin ? convTotal / (o.n + v.n) : e.tauxBase
  const vjObs = jours >= 1 ? (o.n + v.n) / jours : e.visiteursJour ?? null
  const plan = fige(planifier({ tauxBase, mde: e.mde, part, visiteursJour: vjObs }))
  const progression = Math.min(1, o.n / plan.controle, v.n / plan.variante)
  const conv = Math.min(o.c, v.c) >= REGLES.convMin
  const vol = progression >= 1
  const duree = jours >= REGLES.joursMin
  const anticipe = Math.abs(s.z) >= REGLES.zArret && conv && duree && !vol
  const net = (vol && s.pValeur < REGLES.alpha) || Math.abs(s.z) >= REGLES.zArret
  const jalons = { conv, vol, duree, net }
  const base = { jalons, progression, anticipe, stats: s, plan, srm }

  if (srm.alerte)
    return { k: "srm", titre: "Répartition faussée : ne concluez pas",
      detail: `${pc(srm.observee)} des visiteurs ont vu la variante au lieu de ${pc(part)} : une balise bloquée, une redirection ou des robots faussent le test. Trouvez la cause avant de lire les chiffres`,
      joursRestants: null, ...base }

  if ((vol && duree && conv) || anticipe) {
    const avance = anticipe ? " (écart écrasant : conclusion anticipée)" : ""
    if (s.pValeur < REGLES.alpha && s.lift > 0)
      return { k: "gagnant", titre: "La variante gagne", detail: `${signe(s.lift)} de conversions${avance} : vous pouvez la déployer`, joursRestants: 0, ...base }
    if (s.pValeur < REGLES.alpha && s.lift < 0)
      return { k: "perdant", titre: "L’original gagne", detail: `La variante fait ${signe(s.lift)}${avance} : arrêtez-la, on n’en reproposera pas l’idée chez ce client`, joursRestants: 0, ...base }
    return { k: "nul", titre: "Pas de différence mesurable",
      detail: `Le test a eu son volume : s’il existe un écart, il est sous ${pc(plan.mde)}. Gardez l’original (moins de risque) ou testez un changement plus franc`,
      joursRestants: 0, ...base }
  }

  const rythme = vjObs && vjObs > 0 ? vjObs : null
  const restants = rythme
    ? Math.max(REGLES.joursMin - jours, Math.ceil(Math.max(0, plan.controle - o.n) / (rythme * (1 - part))), Math.ceil(Math.max(0, plan.variante - v.n) / (rythme * part)), 0)
    : null
  if (restants !== null && jours + restants > REGLES.joursMax && jours >= 3)
    return { k: "jamais", titre: "Ce test ne pourra pas conclure",
      detail: `À ~${nombre(rythme!)} visiteurs par jour, il faudrait encore ${semaines(restants)}. Arrêtez-le et testez un changement plus franc${plan.mdeEnHuitSemaines ? ` : en huit semaines, seule une hausse d’au moins ${pc(plan.mdeEnHuitSemaines)} se voit` : ""}`,
      joursRestants: restants, ...base }

  const sens = s.lift >= 0 ? `Avantage variante ${signe(s.lift)}` : `Avantage original (${signe(s.lift)})`
  const attente = restants === null ? "encore quelques jours" : restants <= 0 ? "encore quelques conversions" : `encore ~${semaines(restants)}`
  return { k: "collecte", titre: `${sens}, pas encore concluant`,
    detail: `Il faut ${attente} au rythme actuel. Ne tranchez pas avant : un écart précoce se retourne souvent`,
    joursRestants: restants, ...base }
}
