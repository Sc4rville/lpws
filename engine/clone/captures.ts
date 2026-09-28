/**
 * captures.ts — l'historique des captures d'une page : on archive l'identité, on n'écrase plus.
 *
 * Recapturer écrasait baseline/ : avec anchors.json disparaissait la seule trace de ce que
 * désignait chaque ancre, et une variante écrite sur l'ancienne capture ne pouvait plus être
 * traduite (cf. apply/rejouer.ts). Avant chaque recapture, l'identité de la capture sortante
 * (empreintes, méta, verdict) part dans `captures/<date>/`, à côté de baseline/. Pas les assets :
 * le re-liage n'a besoin que des empreintes, et une page pèse des mégaoctets.
 */
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

const GARDES = ["anchors.json", "meta.json", "verify.json"] as const

/** baseline = clients/<client>/<campagne>/baseline → clients/<client>/<campagne>/captures */
export const capturesDe = (baseline: string) => join(baseline, "..", "captures")

/** Archive l'identité de la capture en place ; null s'il n'y a rien à archiver (première capture). */
export async function archiverCapture(baseline: string): Promise<string | null> {
  if (!existsSync(join(baseline, "anchors.json"))) return null
  const meta = await readFile(join(baseline, "meta.json"), "utf8").then((t) => JSON.parse(t) as { capturedAt?: string }).catch(() => null)
  const date = (meta?.capturedAt ?? new Date().toISOString()).replace(/[:.]/g, "-")
  const dir = join(capturesDe(baseline), date)
  await mkdir(dir, { recursive: true })
  for (const f of GARDES) if (existsSync(join(baseline, f))) await copyFile(join(baseline, f), join(dir, f))
  return dir
}

/** Les captures archivées, la plus récente d'abord. */
export async function capturesArchivees(baseline: string): Promise<string[]> {
  const d = capturesDe(baseline)
  if (!existsSync(d)) return []
  return (await readdir(d)).filter((x) => existsSync(join(d, x, "anchors.json"))).sort().reverse().map((x) => join(d, x))
}
