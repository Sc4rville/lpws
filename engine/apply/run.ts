/**
 * run.ts — orchestrateur de la famille APPLY : une VariantSpec → une variante visible et prouvée.
 *
 *   spec (hypothèse + éditions ancrées)  →  variant.html(.mobile)  →  captures  →  delta vs baseline
 *
 * Le delta est la preuve qui compte : il montre CE QUI A BOUGÉ, et surtout que **rien d'autre
 * n'a bougé**. Une variante censée tester un headline qui décale toute la page n'est pas un
 * test propre — c'est une autre page. Le ratio est donc attendu FAIBLE et LOCALISÉ ;
 * c'est l'inverse du juge du clone, où un ratio faible signifie fidélité.
 *
 * Usage : npm run apply -- <dossier-baseline> <spec.json>
 * Sortie : clients/<client>/<campagne>/variants/<nom>/ + résumé sur stdout.
 */
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright"
import { VariantSpec } from "./spec.ts"
import { applyEdits } from "./apply.ts"
import { visualDiff } from "../clone/5_verify/diff.ts"
import { DESKTOP, MOBILE, autoScroll } from "../clone/1_acquire/render.ts"
import { variantDir } from "../shared/paths.ts"
import { step, timed, fail } from "../shared/log.ts"

const SCOPE = "apply"

// même origine synthétique que le juge : en file:// les fonts locales sont refusées (CORS)
const ORIGIN = "http://variant.lpws"
const MIME: Record<string, string> = {
  html: "text/html", css: "text/css",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", json: "application/json",
}

/**
 * Rend la variante et la capture. Les assets restent dans baseline/ (une variante ne
 * duplique pas 5 Mo d'images pour un headline) : la route sert d'abord le dossier de la
 * variante, puis la baseline en repli.
 */
async function shoot(vdir: string, bdir: string, fichier: string, viewport: { width: number; height: number }, out: string) {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    const page = await browser.newPage({ viewport })
    await page.addInitScript({ content: "window.__name = (f) => f" })
    await page.route(`${ORIGIN}/**`, async (route) => {
      const chemin = decodeURIComponent(new URL(route.request().url()).pathname)
      const ext = chemin.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? ""
      for (const base of [vdir, bdir]) {
        if (chemin.includes("..")) break
        try {
          const body = await readFile(join(base, "." + chemin))
          await route.fulfill({ body, contentType: MIME[ext] ?? "application/octet-stream" })
          return
        } catch { /* pas ici → on tente la baseline */ }
      }
      await route.fulfill({ status: 404, body: "" })
    })
    await page.goto(`${ORIGIN}/${fichier}`, { waitUntil: "load", timeout: 60_000 })
    await page.evaluate(autoScroll)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: out, fullPage: true })
  } finally {
    await browser.close()
  }
}

export async function applyVariant(baseline: string, specPath: string) {
  if (!existsSync(join(baseline, "capture.html")))
    fail(SCOPE, `${baseline}/capture.html introuvable — cloner la page d'abord`)

  // le contrat d'abord : une spec invalide ne produit aucun fichier
  const parsed = VariantSpec.safeParse(JSON.parse(await readFile(specPath, "utf8")))
  if (!parsed.success)
    fail(SCOPE, `spec invalide (${specPath}) :\n` +
      parsed.error.issues.map((i) => `  · ${i.path.join(".")} — ${i.message}`).join("\n"))
  const spec = parsed.data

  const vdir = await variantDir(baseline, spec.nom)
  step(SCOPE, `${spec.nom} → ${vdir}`)
  step(SCOPE, `hypothèse : ${spec.hypothese}`)

  // le journal desktop fait foi pour l'affichage (le mobile applique les mêmes éditions)
  const rapports = await applyEdits(baseline, vdir, spec.edits)
  const journal = rapports[0].journal

  const deltas: Record<string, { ratio: number; heightDelta: number }> = {}
  await timed(SCOPE, "rendu + delta vs baseline", async () => {
    for (const [label, fichier, viewport, ref] of [
      ["desktop", "variant.html", DESKTOP, "clone.png"],
      ["mobile", "variant.mobile.html", MOBILE, "clone.mobile.png"],
    ] as const) {
      if (!existsSync(join(vdir, fichier))) continue
      const shot = join(vdir, label === "desktop" ? "variant.png" : "variant.mobile.png")
      await shoot(vdir, baseline, fichier, viewport, shot)
      if (!existsSync(join(baseline, ref))) continue
      const d = await visualDiff(join(baseline, ref), shot,
        join(vdir, label === "desktop" ? "delta.png" : "delta.mobile.png"))
      deltas[label] = { ratio: d.ratio, heightDelta: d.heightDelta }
      step(SCOPE, `${label} : ${(d.ratio * 100).toFixed(2)}% de pixels changés · Δhauteur ${d.heightDelta}px`)
    }
  })

  await writeFile(join(vdir, "variant.json"),
    JSON.stringify({ ...spec, journal, deltas, baseline }, null, 2))
  return { vdir, spec, journal, deltas }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("apply/run.ts")) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const [baseline, spec] = args
  if (!baseline || !spec) fail(SCOPE, "usage : npm run apply -- <dossier-baseline> <spec.json>")
  applyVariant(baseline, spec).then((r) => {
    console.log(JSON.stringify({ variante: r.vdir, hypothese: r.spec.hypothese,
      metrique: r.spec.metrique, deltas: r.deltas }, null, 2))
  }).catch((e) => fail(SCOPE, String(e?.message ?? e)))
}
