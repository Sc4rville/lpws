/**
 * relink-cli.ts — la ligne de commande du re-liage.
 *
 * Séparé de relink.ts pour que le calcul reste pur : le même code de rapprochement part
 * dans le navigateur du visiteur avec le tag (cf. deploy/tag/), et un navigateur n'a ni
 * `node:fs` ni `process`.
 *
 * Usage : npm run relink -- <baseline-avant> <baseline-apres>
 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { step, fail } from "../../shared/log.ts"
import { lireArgs } from "../../shared/cli.ts"
import { relier } from "./relink.ts"
import type { Empreinte } from "./fingerprint.ts"

const SCOPE = "clone/1_acquire/relink"

const [a, b] = lireArgs().libres
if (!a || !b) fail(SCOPE, "usage : npm run relink -- <baseline-avant> <baseline-apres>")
const lire = async (d: string): Promise<Empreinte[]> => {
  try { return JSON.parse(await readFile(join(d, "anchors.json"), "utf8")) }
  catch { return fail(SCOPE, `pas d'anchors.json dans ${d} — capture trop ancienne, la recapturer`) }
}
const r = relier(await lire(a), await lire(b))
const s = r.stats
step(SCOPE, `${s.retrouves}/${s.avant} retrouvées · ${s.deplaces} déplacées · ${s.ambigus} ambiguës · ${s.perdus} perdues`)
console.log(JSON.stringify(r, null, 2))
