/**
 * run.ts — orchestrateur de la famille CLONE : URL → baseline vérifiée.
 *
 * Enchaîne les étapes construites, dit franchement celles qui ne le sont pas encore
 * (cf. readme.md de la famille pour la généalogie complète) :
 *
 *   1_acquire    ✅  rendu headless + marquage data-lpws + screenshots + octets rapatriés
 *   2_styles     ✅  CSS/fonts self-contained (références réécrites vers assets/)
 *   3_assets     ✅  images/vidéos locales, <base> retirée → clone autonome
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
import { localizeStyles } from "./2_styles/localize.ts"
import { localizeAssets } from "./3_assets/localize.ts"
import { verifyBaseline, SEUIL_DEFAUT } from "./5_verify/verify.ts"
import { baselineDir, marque, slugify } from "../shared/paths.ts"
import { archiverCapture } from "./captures.ts"
import { step, fail } from "../shared/log.ts"
import { lireArgs } from "../shared/cli.ts"

const SCOPE = "clone"

async function main() {
  const args = lireArgs()
  const arg = args.option
  const url = args.libres.find((a) => a.startsWith("http"))
  if (!url) fail(SCOPE, "usage : npm run clone -- <url> [--client x] [--campaign y] [--seuil 0.03] [--auth user:pass] [--cookie \"a=1; b=2\"]")

  // par défaut, le dossier porte la MARQUE du client ("atlassian"), pas l'hôte ni un lot
  const client = arg("--client") ?? marque(url)
  // défaut : le chemin de l'URL ("/products/marketing" → "products-marketing") — deux LP
  // du même client ne s'écrasent pas ; page racine → "campagne-1"
  const campaign = arg("--campaign") ?? (slugify(new URL(url).pathname) || "campagne-1")
  const seuil = arg("--seuil") ? Number(arg("--seuil")) : SEUIL_DEFAUT

  const dir = await baselineDir(client, campaign)
  step(SCOPE, `${url} → ${dir}`)

  // 0 · l'identité de la capture sortante est gardée : sans elle, ses variantes ne se rejouent plus
  const archive = await archiverCapture(dir)
  if (archive) step(SCOPE, `capture précédente archivée → ${archive}`)

  // 1 · acquisition
  const meta = await acquire(url, dir, { auth: arg("--auth") ?? process.env.LPWS_AUTH, cookies: arg("--cookie") ?? process.env.LPWS_COOKIES })

  // 2-3 · localisation : le clone devient self-contained (ou dit ce qui lui manque)
  const styles = await localizeStyles(dir)
  const assets = await localizeAssets(dir)
  step(SCOPE, "étape 4_structure : pas encore construite (le schéma est posé)")

  // 5 · le juge
  const verdict = await verifyBaseline(dir, seuil)

  const distantes = [
    ...styles.distantes.feuilles, ...styles.distantes.fonts, ...styles.distantes.autres,
    ...assets.distants,
  ]
  await writeFile(join(dir, "meta.json"), JSON.stringify({
    ...meta,
    client, campaign,
    fidele: verdict.fidele,
    diff: { desktop: verdict.desktop.diff.ratio, mobile: verdict.mobile.diff.ratio },
    styles, assets,
    honnetete: [
      "js retiré : interactions inertes (état visuel final conservé via styles inline sérialisés)",
      distantes.length === 0
        ? "self-contained : css, fonts et images rapatriés — le clone se rend sans réseau"
        : `self-contained partiel : ${distantes.length} ressource(s) encore distante(s) ` +
          "(détail dans styles/assets ci-dessus)",
      ...(verdict.desktop.sante.screenshotTronque || verdict.mobile.sante.screenshotTronque
        ? ["scroll-jack détecté : sans JS, les pistes scroll-driven se déroulent en hauteur " +
           "réelle (hauteur de rendu aberrante) — clone non exploitable en l'état, limite connue"]
        : []),
      ...(assets.srcsetNonCaptures > 0
        ? [`${assets.srcsetNonCaptures} candidat(s) srcset d'autres viewports restés distants ` +
           "(jamais chargés à la capture — sans effet aux viewports du juge)"]
        : []),
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
