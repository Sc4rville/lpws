/**
 * relink.ts — RE-LIER les ancres d'une capture à celles de la suivante.
 *
 * Le problème que ce fichier existe pour régler : les ancres sont des rangs. Le client
 * ajoute une bannière, tout se décale d'un cran, et une variante écrite hier vise
 * aujourd'hui le mauvais élément — sans erreur, sans bruit. Le pire mode d'échec possible.
 *
 * Ici on rapproche deux jeux d'empreintes (cf. fingerprint.ts) et on dit honnêtement, pour
 * chaque ancre d'hier : retrouvée (et sous quelle ancre aujourd'hui), perdue, ou ambiguë.
 * Une ambiguïté n'est JAMAIS tranchée au hasard : elle est rapportée comme telle, et l'aval
 * refuse d'éditer dessus.
 *
 * Aucun navigateur, aucun réseau, aucun import node : pur calcul sur deux jeux d'empreintes.
 * C'est volontaire deux fois — c'est la pièce qu'on doit pouvoir tester à la main, et c'est
 * la même qui part dans le navigateur du visiteur avec le tag (cf. deploy/tag/).
 * Le CLI vit à côté, dans relink-cli.ts.
 */
import type { Empreinte } from "./fingerprint.ts"

/** En dessous, aucun candidat n'est crédible (le maximum atteignable est ~122). */
const SEUIL = 45
/** Un point d'ossature doit être franc : c'est lui qui contraindra tout son voisinage. */
const SEUIL_SUR = 70
/** Entre deux points sûrs, l'ordre fait la moitié du travail : on peut exiger moins. */
const SEUIL_FENETRE = 30
/** Écart minimal avec le deuxième candidat : en dessous, on déclare l'ambiguïté. */
const MARGE = 8

export type Lien = {
  avant: string
  apres: string
  score: number
  /** l'ancre a changé de numéro : c'est exactement le décalage qui cassait tout en silence */
  deplace: boolean
}

export type Rapport = {
  retrouves: Lien[]
  ambigus: { avant: string; candidats: { apres: string; score: number }[] }[]
  perdus: { avant: string; role: string; text: string }[]
  /** éléments de la nouvelle capture que rien de l'ancienne ne réclame (ajouts du client) */
  nouveaux: string[]
  stats: { avant: number; apres: number; retrouves: number; deplaces: number; ambigus: number; perdus: number }
}

const jaccard = (a: string[], b: string[]): number => {
  if (a.length === 0 && b.length === 0) return 0
  const A = new Set(a), B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

const mots = (t: string): string[] => t.split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 2)

/** Le suffixe commun de deux chemins de balises : un wrapper ajouté n'annule pas la parenté. */
const suffixeCommun = (a: string, b: string): number => {
  const A = a.split(">"), B = b.split(">")
  let n = 0
  while (n < A.length && n < B.length && A[A.length - 1 - n] === B[B.length - 1 - n]) n++
  return n / Math.max(A.length, B.length, 1)
}

/**
 * Ce que deux empreintes ont en commun, en points. Le texte domine volontairement : c'est
 * le seul signal qu'un rebuild du site ne détruit pas. Les classes pèsent peu (CSS-in-JS),
 * le rang encore moins (c'est lui qu'on ne veut plus croire).
 */
export function score(a: Empreinte, b: Empreinte): number {
  if (a.role !== b.role) return 0

  let s = 0
  const ta = a.text, tb = b.text
  if (ta && tb) {
    if (ta === tb) s += 50
    else if (ta.length >= 8 && tb.length >= 8 && (ta.includes(tb) || tb.includes(ta))) s += 30
    else s += Math.round(25 * jaccard(mots(ta), mots(tb)))
  } else if (!ta && !tb) {
    s += 8 // deux éléments sans texte (image, bande) : ni preuve ni contre-preuve
  }

  if (a.cible && a.cible === b.cible) s += 25
  if (a.sect && a.sect === b.sect) s += 10
  if (a.rang === b.rang) s += 6
  s += a.path === b.path ? 12 : Math.round(6 * suffixeCommun(a.path, b.path))
  s += Math.round(15 * jaccard(a.cls, b.cls))
  if (a.tag === b.tag) s += 4

  return s
}

/** La plus longue sous-suite croissante : garde l'ossature cohérente, jette les croisements. */
function sousSuiteCroissante<T extends { j: number }>(items: T[]): T[] {
  if (items.length === 0) return []
  const queues: number[] = [], pred: number[] = new Array(items.length).fill(-1), fins: number[] = []
  for (let k = 0; k < items.length; k++) {
    let lo = 0, hi = queues.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (items[fins[m]].j < items[k].j) lo = m + 1; else hi = m }
    if (lo > 0) pred[k] = fins[lo - 1]
    fins[lo] = k
    if (lo === queues.length) queues.push(k); else queues[lo] = k
  }
  const out: T[] = []
  for (let k = fins[queues.length - 1]; k >= 0; k = pred[k]) out.unshift(items[k])
  return out
}

export function relier(avant: Empreinte[], apres: Empreinte[]): Rapport {
  const paires: { i: number; j: number; s: number }[] = []
  for (let i = 0; i < avant.length; i++) {
    for (let j = 0; j < apres.length; j++) {
      if (avant[i].role !== apres[j].role) continue
      const s = score(avant[i], apres[j])
      if (s >= SEUIL) paires.push({ i, j, s })
    }
  }
  paires.sort((x, y) => y.s - x.s)

  const meilleurs = new Map<number, { j: number; s: number }[]>()
  for (const p of paires) {
    const liste = meilleurs.get(p.i) ?? []
    liste.push({ j: p.j, s: p.s })
    meilleurs.set(p.i, liste)
  }

  const prisA = new Set<number>(), prisB = new Set<number>()
  const retrouves: Rapport["retrouves"] = []
  const pose = (i: number, j: number, s: number) => {
    prisA.add(i); prisB.add(j)
    retrouves.push({ avant: avant[i].a, apres: apres[j].a, score: s, deplace: avant[i].a !== apres[j].a })
  }

  /* ——— passe 1 : les points sûrs (texte ou cible propre, sans concurrent sérieux) ——— */
  const surs: { i: number; j: number; s: number }[] = []
  for (const p of paires) {
    if (p.s < SEUIL_SUR) continue
    if (prisA.has(p.i) || prisB.has(p.j)) continue
    const concurrents = (meilleurs.get(p.i) ?? []).filter((c) => !prisB.has(c.j))
    if (concurrents.length > 1 && concurrents[0].s - concurrents[1].s < MARGE) continue
    prisA.add(p.i); prisB.add(p.j)
    surs.push(p)
  }

  // l'ordre du document ne s'inverse pas : un point sûr qui croise les autres est une erreur
  surs.sort((x, y) => x.i - y.i)
  const ossature = sousSuiteCroissante(surs)
  const rejetes = surs.filter((p) => !ossature.includes(p))
  for (const p of rejetes) { prisA.delete(p.i); prisB.delete(p.j) }
  for (const p of ossature) pose(p.i, p.j, p.s)

  /* ——— passe 2 : entre deux points sûrs, l'ordre contraint le reste ———
   * Un élément sans texte (image, carte, lien d'icône) ne se distingue pas de son voisin
   * par son empreinte seule. Mais entre deux ancres sûres, l'ordre du document suffit :
   * c'est ce qui débloque les pages à composants répétés. */
  const bornes = [{ i: -1, j: -1 }, ...ossature.map((p) => ({ i: p.i, j: p.j })),
                  { i: avant.length, j: apres.length }]
  for (let k = 0; k < bornes.length - 1; k++) {
    const iA = [], jA = []
    for (let i = bornes[k].i + 1; i < bornes[k + 1].i; i++) if (!prisA.has(i)) iA.push(i)
    for (let j = bornes[k].j + 1; j < bornes[k + 1].j; j++) if (!prisB.has(j)) jA.push(j)
    if (iA.length === 0 || jA.length === 0) continue

    const locales: { i: number; j: number; s: number }[] = []
    for (const i of iA) for (const j of jA) {
      if (avant[i].role !== apres[j].role) continue
      const s = score(avant[i], apres[j])
      if (s >= SEUIL_FENETRE) locales.push({ i, j, s })
    }
    // à score égal, la paire la plus proche de la diagonale : un menu dupliqué (desktop + mobile)
    // donne deux copies au même score, et le signe seul choisissait la copie croisée
    locales.sort((x, y) => y.s - x.s || Math.abs(x.i - x.j) - Math.abs(y.i - y.j))
    const retenues: { i: number; j: number; s: number }[] = []
    const vuA = new Set<number>(), vuB = new Set<number>()
    for (const p of locales) {
      if (vuA.has(p.i) || vuB.has(p.j)) continue
      vuA.add(p.i); vuB.add(p.j); retenues.push(p)
    }
    retenues.sort((x, y) => x.i - y.i)
    for (const p of sousSuiteCroissante(retenues)) pose(p.i, p.j, p.s)
  }

  const ambigus: Rapport["ambigus"] = []
  const perdus: Rapport["perdus"] = []
  for (let i = 0; i < avant.length; i++) {
    if (prisA.has(i)) continue
    const cands = (meilleurs.get(i) ?? []).filter((c) => !prisB.has(c.j)).slice(0, 3)
      .map((c) => ({ apres: apres[c.j].a, score: c.s }))
    if (cands.length > 0) ambigus.push({ avant: avant[i].a, candidats: cands })
    else perdus.push({ avant: avant[i].a, role: avant[i].role, text: avant[i].text.slice(0, 60) })
  }

  const nouveaux = apres.filter((_, j) => !prisB.has(j)).map((e) => e.a)

  return {
    retrouves, ambigus, perdus, nouveaux,
    stats: {
      avant: avant.length,
      apres: apres.length,
      retrouves: retrouves.length,
      deplaces: retrouves.filter((r) => r.deplace).length,
      ambigus: ambigus.length,
      perdus: perdus.length,
    },
  }
}
