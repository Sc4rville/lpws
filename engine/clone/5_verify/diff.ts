/**
 * diff.ts — comparaison visuelle pixel à pixel (clone vs live).
 *
 * pixelmatch exige deux images de mêmes dimensions ; un clone statique peut différer de
 * quelques pixels de hauteur (police en cours de chargement au moment du shot, etc.) →
 * on compare la zone commune et on REPORTE l'écart de dimensions dans le résultat :
 * un gros écart de hauteur est en soi un signal d'infidélité.
 */
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import { readFile, writeFile } from "node:fs/promises"

export type DiffResult = {
  ratio: number          // pixels différents / pixels comparés (0 = identique)
  width: number
  height: number         // zone comparée
  heightDelta: number    // |h(clone) − h(live)| en px — gros delta = sections manquantes
  diffPath: string
}

/** Recadre une image sur la zone (0,0,w,h). */
function crop(img: PNG, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h })
  PNG.bitblt(img, out, 0, 0, w, h, 0, 0)
  return out
}

export async function visualDiff(livePath: string, clonePath: string, diffPath: string): Promise<DiffResult> {
  const live = PNG.sync.read(await readFile(livePath))
  const clone = PNG.sync.read(await readFile(clonePath))

  const width = Math.min(live.width, clone.width)
  const height = Math.min(live.height, clone.height)
  const a = crop(live, width, height)
  const b = crop(clone, width, height)

  const diff = new PNG({ width, height })
  const differing = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
  await writeFile(diffPath, PNG.sync.write(diff))

  return {
    ratio: differing / (width * height),
    width,
    height,
    heightDelta: Math.abs(live.height - clone.height),
    diffPath,
  }
}

/* ——— le juge par section ———
 * Le ratio de page entière punit un décalage : un titre qui passe à trois lignes pousse tout le
 * reste de 40 px, et chaque section en dessous « diffère » alors qu'elle est parfaite. Ici chaque
 * section de haut niveau (ancrée, relevée sur le clone rendu) est d'abord RECALÉE verticalement sur le
 * live, puis comparée seule : le décalage est rapporté, il n'est plus compté comme casse.
 *
 * Recalage : une signature par ligne (luminance moyenne de 16 colonnes), cherchée autour du
 * décalage de la section précédente (la dérive s'accumule vers le bas de la page). Pas de
 * position du live nécessaire : le screenshot suffit, même pour une capture ancienne. */

export type Bande = { anchor: string; y: number; h: number; titre: string }
export type DiffSection = Bande & {
  /** y(live) − y(clone) retenu pour la comparaison */
  decalage: number
  ratio: number
  fidele: boolean
}
export type DiffSections = {
  sections: DiffSection[]
  /** ratio pondéré par la surface des sections, décalages neutralisés */
  ratioAligne: number | null
  /** sections hors de la preuve (screenshot tronqué, bande hors image) */
  nonJugees: string[]
}

const COLONNES = 16

function signature(img: PNG): Float32Array {
  const s = new Float32Array(img.height * COLONNES)
  const larg = img.width / COLONNES
  for (let y = 0; y < img.height; y++) {
    for (let k = 0; k < COLONNES; k++) {
      let t = 0, n = 0
      for (let x = Math.floor(k * larg); x < Math.floor((k + 1) * larg); x += 2) {
        const i = (y * img.width + x) * 4
        t += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; n++
      }
      s[y * COLONNES + k] = n ? t / n : 0
    }
  }
  return s
}

// une ligne sans vis-à-vis dans le live coûte comme une ligne franchement différente : sans ça,
// rogner la bande jusqu'à sa partie répétitive (aplats, grilles) « gagne » toujours
const COUT_ABSENTE = 48 * COLONNES
// à peu près égales, on garde la position la plus proche de la dérive déjà constatée
const COUT_ECART = 0.02 * COLONNES

/** le décalage d dans [centre − marge, centre + marge] qui rapproche le plus la bande du live */
function recaler(sc: Float32Array, sl: Float32Array, hLive: number, y0: number, y1: number, centre: number, marge: number): number {
  let meilleur = centre, cout = Infinity
  const lignes = Math.ceil((y1 - y0) / 2)
  for (let d = centre - marge; d <= centre + marge; d++) {
    const a = Math.max(y0, -d), b = Math.min(y1, hLive - d)
    if (b <= a) continue
    let e = 0, vues = 0
    for (let y = a; y < b; y += 2, vues++) {
      const ic = y * COLONNES, il = (y + d) * COLONNES
      for (let k = 0; k < COLONNES; k++) e += Math.abs(sc[ic + k] - sl[il + k])
    }
    e = (e + Math.max(0, lignes - vues) * COUT_ABSENTE) / lignes + Math.abs(d - centre) * COUT_ECART
    if (e < cout) { cout = e; meilleur = d }
  }
  return meilleur
}

export async function diffParSection(livePath: string, clonePath: string, bandes: Bande[], seuil: number, marge = 600): Promise<DiffSections> {
  const live = PNG.sync.read(await readFile(livePath))
  const clone = PNG.sync.read(await readFile(clonePath))
  const width = Math.min(live.width, clone.width)
  const sl = signature(crop(live, width, live.height)), sc = signature(crop(clone, width, clone.height))
  const sections: DiffSection[] = [], nonJugees: string[] = []
  let centre = 0, px = 0, diff = 0
  for (const b of [...bandes].sort((x, y) => x.y - y.y)) {
    const y0 = Math.max(0, b.y), y1 = Math.min(clone.height, b.y + b.h)
    if (y1 - y0 < 20) { nonJugees.push(b.anchor); continue }
    const d = recaler(sc, sl, live.height, y0, y1, centre, marge)
    const a = Math.max(y0, -d), z = Math.min(y1, live.height - d)
    const h = z - a
    let ratio = 1
    if (h > 0) {
      const pa = new PNG({ width, height: h }), pb = new PNG({ width, height: h })
      PNG.bitblt(live, pa, 0, a + d, width, h, 0, 0)
      PNG.bitblt(clone, pb, 0, a, width, h, 0, 0)
      // la part de la bande sans vis-à-vis dans le live compte comme différente
      ratio = (pixelmatch(pa.data, pb.data, undefined, width, h, { threshold: 0.1 }) + (y1 - y0 - h) * width) / ((y1 - y0) * width)
    }
    sections.push({ ...b, decalage: d, ratio, fidele: ratio <= seuil })
    px += (y1 - y0) * width; diff += ratio * (y1 - y0) * width
    centre = d
  }
  return { sections, ratioAligne: px ? diff / px : null, nonJugees }
}
