/**
 * run.ts — orchestrateur de la famille CLONE : URL → baseline vérifiée.
 *
 * Enchaîne les étapes construites, dit franchement celles qui ne le sont pas encore
 * (cf. readme.md de la famille pour la généalogie complète) :
 *
 *   1_acquire    ✅  rendu headless + marquage data-lpws + screenshots de référence
 *   2_styles     🔜  CSS self-contained (en attendant : <base> → refs distantes)
 *   3_assets     🔜  images/fonts/palette rapatriées (idem)
 *   4_structure  🔜  page.json (le schéma est déjà posé : 4_structure/schema.ts)
 *   5_verify     ✅  le juge : diff visuel vs live + santé + preuves
 *
 * Usage : npm run clone -- <url> [--client acme] [--campaign printemps] [--seuil 0.03]
 * Sortie : clients/<client>/<campagne>/baseline/ + verdict sur stdout.
 * Exit 0 si le clone est fidèle, 1 sinon.
 */
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { acquire } from "./1_acquire/render.ts"
import { verifyBaseline, SEUIL_DEFAUT } from "./5_verify/verify.ts"
import { baselineDir, slugify } from "../shared/paths.ts"
import { step, fail } from "../shared/log.ts"

const SCOPE = "clone"

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.argv.slice(2).find((a) => a.startsWith("http"))
  if (!url) fail(SCOPE, "usage : npm run clone -- <url> [--client x] [--campaign y] [--seuil 0.03]")

  const client = arg("--client") ?? slugify(new URL(url).hostname)
  // défaut : le chemin de l'URL ("/products/marketing" → "products-marketing") — deux LP
  // du même client ne s'écrasent pas ; page racine → "campagne-1"
  const campaign = arg("--campaign") ?? (slugify(new URL(url).pathname) || "campagne-1")
  const seuil = arg("--seuil") ? Number(arg("--seuil")) : SEUIL_DEFAUT

  const dir = await baselineDir(client, campaign)
  step(SCOPE, `${url} → ${dir}`)

  // 1 · acquisition
  const meta = await acquire(url, dir)
  step(SCOPE, "étapes 2_styles / 3_assets / 4_structure : pas encore construites — " +
    "le clone référence les ressources du site source via <base> (pas self-contained)")

  // 5 · le juge
  const verdict = await verifyBaseline(dir, seuil)

  await writeFile(join(dir, "meta.json"), JSON.stringify({
    ...meta,
    client, campaign,
    fidele: verdict.fidele,
    diff: { desktop: verdict.desktop.diff.ratio, mobile: verdict.mobile.diff.ratio },
    honnetete: [
      "js retiré : interactions inertes (état visuel final conservé via styles inline sérialisés)",
      "ressources encore distantes (<base>) : nécessite le réseau, pas self-contained",
      "tracking non capturé (repéré dans resources.json, réinjection à venir)",
    ],
  }, null, 2))

  console.log(JSON.stringify({
    baseline: dir,
    fidele: verdict.fidele,
    diff: { desktop: verdict.desktop.diff.ratio, mobile: verdict.mobile.diff.ratio },
    aRegarder: [join(dir, "clone.png"), join(dir, "diff.png")],
  }, null, 2))
  process.exit(verdict.fidele ? 0 : 1)
}

main().catch((e) => fail(SCOPE, String(e?.stack ?? e)))
