/**
 * check.ts — LE JUGE du tag, et le seul test de la machine qui se fait contre la VRAIE page.
 *
 * Tout le reste se juge contre une capture. Ici on juge contre le site tel qu'il est en ce
 * moment, que personne n'a marqué ni figé — c'est-à-dire la seule chose que le visiteur verra.
 *
 * Quatre scénarios, parce que ce sont les quatre promesses faites au media buyer :
 *   variante  l'empreinte retrouve la cible sur un DOM jamais capturé, et l'édition atterrit
 *             au bon endroit (on RELIT la page, on ne croit pas le tag sur parole)
 *   témoin    sans tag, la page est intacte — une variante qui fuit détruit la comparaison
 *   aperçu    `?lpws=<nom>` force la variante : le lien qu'il envoie à son client avant de
 *             dépenser un euro, même avec 0 % du trafic
 *   stop      `actif: false` coupe tout, sans republier le conteneur GTM
 *
 * La config est servie par interception : on prouve le chemin réseau du loader sans rien
 * héberger.
 *
 * Usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]
 */
import { chromium } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { buildTag } from "./build.ts"
import type { ConfigServie } from "./loader.ts"
import { VariantSpec } from "../../apply/spec.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "deploy/tag/check"
const BASE = "https://cfg.lpws.test"

type Vu = { version: string; applique: number; abandons: string[]; masqueMs: number; textes: string[] }

async function ouvrir(
  url: string, loader: string | null, cfg: ConfigServie | null, client: string, suffixe: string,
): Promise<Vu> {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  })
  if (cfg) {
    await page.route(`${BASE}/v/${client}.json`, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(cfg) }))
  }
  if (loader) await page.addInitScript({ content: loader })

  try {
    await page.goto(url + (url.includes("?") ? "&" : "?") + suffixe,
      { waitUntil: "domcontentloaded", timeout: 45_000 })
    await page.waitForTimeout(3_000)
    return await page.evaluate(() => {
      const w = window as unknown as {
        __lpws?: { version: string; applique: number; abandons: string[] }
        __lpwsMasque?: number
      }
      return {
        version: w.__lpws?.version ?? "aucun-tag",
        applique: w.__lpws?.applique ?? 0,
        abandons: w.__lpws?.abandons ?? [],
        masqueMs: w.__lpwsMasque ?? 0,
        textes: [...document.querySelectorAll("[data-lpws-edited],[data-lpws-added]")]
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)),
      }
    })
  } finally { await browser.close() }
}

export async function checkTag(baseline: string, specPaths: string[], urlLive?: string) {
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const url = urlLive ?? meta.source
  if (!url) fail(SCOPE, "pas d'URL live : passer --url <https://…>")

  // 100 % pour que le scénario « variante » tombe toujours du bon côté ; l'aperçu et le stop
  // sont testés séparément, eux, avec 0 %
  const { cfg, client, loader } = await buildTag(baseline, specPaths, { part: 100, base: BASE })
  const spec = VariantSpec.parse(JSON.parse(await readFile(specPaths[0], "utf8")))
  const attendus = spec.edits.map((e) => e.text).filter((t): t is string => !!t)

  step(SCOPE, `page vivante : ${url}`)
  const variante = await ouvrir(url, loader, cfg, client, "gclid=JUGE-1")
  const temoin = await ouvrir(url, null, null, client, "gclid=JUGE-2")
  const cfg0 = { ...cfg, variantes: cfg.variantes.map((v) => ({ ...v, part: 0 })) }
  const apercu = await ouvrir(url, loader, cfg0, client, `lpws=${spec.nom}`)
  const stop = await ouvrir(url, loader, { ...cfg, actif: false }, client, "gclid=JUGE-4")

  const vus = variante.textes.join(" | ")
  const poses = attendus.filter((t) => vus.includes(t))
  const fuites = attendus.filter((t) => temoin.textes.some((x) => x.includes(t)))

  const echecs: string[] = []
  if (variante.version === "aucun-tag") echecs.push("le loader ne s'est pas exécuté")
  if (variante.abandons.length > 0)
    echecs.push(`cibles non résolues sur la page vivante : ${variante.abandons.join(" · ")}`)
  if (poses.length !== attendus.length)
    echecs.push(`${attendus.length - poses.length}/${attendus.length} texte(s) attendus absents de la page rendue`)
  if (fuites.length > 0) echecs.push(`FUITE sur le témoin : ${fuites.join(", ")}`)
  if (variante.masqueMs > 1000) echecs.push(`page masquée ${variante.masqueMs} ms — trop long, ça coûte du LCP`)
  if (apercu.applique === 0) echecs.push("l'aperçu ?lpws=<nom> n'applique rien à 0 % — le lien de démo au client serait mort")
  if (stop.applique > 0) echecs.push("le bouton stop ne coupe pas — inacceptable, c'est la condition de confiance")

  const ok = echecs.length === 0
  step(SCOPE, `variante : ${variante.applique} édition(s) · masque ${variante.masqueMs} ms`)
  step(SCOPE, `témoin   : ${temoin.applique} édition(s) (doit être 0)`)
  step(SCOPE, `aperçu   : ${apercu.applique} édition(s) à 0 % de trafic (doit être > 0)`)
  step(SCOPE, `stop     : ${stop.applique} édition(s) (doit être 0)`)
  for (const e of echecs) step(SCOPE, `ÉCHEC : ${e}`)
  step(SCOPE, ok ? "TAG VALIDE sur la page vivante" : "tag REFUSÉ")
  return { ok, variante, temoin, apercu, stop, echecs }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/check.ts")) {
  const args = process.argv.slice(2)
  const i = args.indexOf("--url")
  const libres = args.filter((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"))
  const [baseline, ...specs] = libres
  if (!baseline || specs.length === 0)
    fail(SCOPE, "usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]")
  const r = await checkTag(baseline, specs, i >= 0 ? args[i + 1] : undefined)
  if (!r.ok) process.exit(1)
}
