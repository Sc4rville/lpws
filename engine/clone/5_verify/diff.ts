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
