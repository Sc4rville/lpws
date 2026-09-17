/**
 * check.ts — LE JUGE du tag, et le seul test qui compte vraiment : sur la VRAIE page live.
 *
 * Tout le reste de la machine se juge contre une capture. Ici on juge contre le site tel
 * qu'il est en ce moment, que personne n'a marqué ni figé — c'est-à-dire la seule chose que
 * le visiteur verra. Trois questions :
 *
 *   1. l'empreinte retrouve-t-elle la cible sur un DOM qu'on n'a pas capturé ?
 *   2. l'édition atterrit-elle sur le BON élément (on relit le texte, on ne croit pas le tag) ?
 *   3. combien de temps la page reste-t-elle masquée ? (le clignotement se mesure, pas se devine)
 *
 * Et la question de contrôle, aussi importante : un visiteur du groupe témoin voit-il la page
 * INTACTE ? Une variante qui fuit sur le témoin détruit la comparaison.
 *
 * Usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]
 */
import { chromium } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { buildTag } from "./build.ts"
import { VariantSpec } from "../../apply/spec.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "deploy/tag/check"

type Vu = {
  version: string
  applique: number
  abandons: string[]
  masqueMs: number
  textes: Record<string, string>
}

async function ouvrir(url: string, tag: string | null, gclid: string): Promise<Vu> {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  })
  if (tag) await page.addInitScript({ content: tag })

  try {
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}gclid=${gclid}`,
      { waitUntil: "domcontentloaded", timeout: 45_000 })
    await page.waitForTimeout(2_500)
    return await page.evaluate(() => {
      const w = window as unknown as {
        __lpws?: { version: string; applique: number; abandons: string[] }
        __lpwsMasque?: number
      }
      const textes: Record<string, string> = {}
      document.querySelectorAll("[data-lpws-edited],[data-lpws-added]").forEach((el, i) => {
        textes[`touche${i}`] = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
      })
      return {
        version: w.__lpws?.version ?? "aucun-tag",
        applique: w.__lpws?.applique ?? 0,
        abandons: w.__lpws?.abandons ?? [],
        masqueMs: w.__lpwsMasque ?? 0,
        textes,
      }
    })
  } finally { await browser.close() }
}

export async function checkTag(baseline: string, specPath: string, urlLive?: string) {
  const spec = VariantSpec.parse(JSON.parse(await readFile(specPath, "utf8")))
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const url = urlLive ?? meta.source
  if (!url) fail(SCOPE, "pas d'URL live : passer --url <https://…>")

  // 100 % pour que le juge voie toujours la variante ; la répartition est testée à part
  const { fichier } = await buildTag(baseline, specPath, 100, 1500)
  const tag = await readFile(fichier, "utf8")

  step(SCOPE, `page vivante : ${url}`)
  const variante = await ouvrir(url, tag, "JUGE-LPWS-1")
  const temoin = await ouvrir(url, null, "JUGE-LPWS-2")

  // le contrôle : ce que la spec demandait d'écrire doit être VU, et seulement là
  const attendus = spec.edits.map((e) => e.text).filter((t): t is string => !!t)
  const vus = Object.values(variante.textes).join(" | ")
  const poses = attendus.filter((t) => vus.includes(t))
  const fuites = attendus.filter((t) => Object.values(temoin.textes).some((x) => x.includes(t)))

  const echecs: string[] = []
  if (variante.version === "aucun-tag") echecs.push("le tag ne s'est pas exécuté")
  if (variante.abandons.length > 0)
    echecs.push(`cibles non résolues sur la page vivante : ${variante.abandons.join(" · ")}`)
  if (poses.length !== attendus.length)
    echecs.push(`${attendus.length - poses.length}/${attendus.length} texte(s) attendus absents de la page rendue`)
  if (fuites.length > 0) echecs.push(`FUITE sur le témoin : ${fuites.join(", ")} — la comparaison serait détruite`)
  if (variante.masqueMs > 1000) echecs.push(`page masquée ${variante.masqueMs} ms — trop long, ça coûte du LCP`)

  const ok = echecs.length === 0
  step(SCOPE, `variante : ${variante.applique} édition(s) posée(s) · masque ${variante.masqueMs} ms`)
  step(SCOPE, `témoin   : ${temoin.applique} édition(s) (doit être 0)`)
  for (const e of echecs) step(SCOPE, `ÉCHEC : ${e}`)
  step(SCOPE, ok ? "TAG VALIDE sur la page vivante" : "tag REFUSÉ")
  return { ok, variante, temoin, echecs }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/check.ts")) {
  const args = process.argv.slice(2)
  const [baseline, spec] = args.filter((a) => !a.startsWith("--") && !a.startsWith("http"))
  const i = args.indexOf("--url")
  if (!baseline || !spec) fail(SCOPE, "usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]")
  const r = await checkTag(baseline, spec, i >= 0 ? args[i + 1] : undefined)
  if (!r.ok) process.exit(1)
}
