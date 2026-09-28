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
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { lancerNavigateur, nouvellePage, servirDossiers } from "../shared/navigateur.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { lireValide } from "../shared/json.ts"
import { VariantSpec } from "./spec.ts"
import { applyEdits } from "./apply.ts"
import { visualDiff, type Bande } from "../clone/5_verify/diff.ts"
import { DESKTOP, MOBILE, autoScroll } from "../clone/1_acquire/render.ts"
import { bandesDuRendu } from "../clone/1_acquire/mark.ts"
import { bandesTouchees, deltaParSection, type DeltaSections } from "./delta.ts"
import { variantDir } from "../shared/paths.ts"
import { step, timed, fail } from "../shared/log.ts"

const SCOPE = "apply"

// même origine synthétique que le juge (cf. servirDossiers)
const ORIGIN = "http://variant.lpws"

/**
 * Rend la variante et la capture. Les assets restent dans baseline/ (une variante ne
 * duplique pas 5 Mo d'images pour un headline) : la route sert d'abord le dossier de la
 * variante, puis la baseline en repli.
 */
export async function shoot(
  vdir: string, bdir: string, fichier: string,
  viewport: { width: number; height: number }, out: string, ancres: string[] = [],
): Promise<{ positions: Record<string, number>; bandes: Bande[]; touchees: string[] }> {
  const browser = await lancerNavigateur({ args: ["--hide-scrollbars"] })
  try {
    const page = await nouvellePage(browser, { viewport })
    await servirDossiers(page, ORIGIN, [vdir, bdir])
    await page.goto(`${ORIGIN}/${fichier}`, { waitUntil: "load", timeout: 60_000 })
    await page.evaluate(autoScroll)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: out, fullPage: true })
    // les positions se relèvent ICI, sur la page complètement rendue : mesurées pendant
    // l'édition (images pas encore chargées) elles étaient fausses de plusieurs milliers
    // de pixels, et le « clique pour t'y rendre » du cockpit tombait à côté
    const positions = await page.evaluate((as: string[]) => {
      const out: Record<string, number> = {}
      for (const a of as) {
        const el = document.querySelector(`[data-lpws="${a}"]`)
        if (el) out[a] = Math.round(el.getBoundingClientRect().y + window.scrollY)
      }
      return out
    }, ancres)
    const bandes = await page.evaluate(bandesDuRendu)
    const touchees = await page.evaluate(bandesTouchees, { bandes: bandes.map((b) => b.anchor), ancres })
    return { positions, bandes, touchees }
  } finally {
    await browser.close()
  }
}

export async function applyVariant(baseline: string, specPath: string) {
  if (!existsSync(join(baseline, "capture.html")))
    fail(SCOPE, `${baseline}/capture.html introuvable — cloner la page d'abord`)

  // le contrat d'abord : une spec invalide ne produit aucun fichier
  const spec = await lireValide(VariantSpec, specPath).catch((e: Error) => fail(SCOPE, e.message))

  const vdir = await variantDir(baseline, spec.nom)
  step(SCOPE, `${spec.nom} → ${vdir}`)
  step(SCOPE, `hypothèse : ${spec.hypothese}`)

  // le journal desktop fait foi pour l'affichage (le mobile applique les mêmes éditions)
  const rapports = await applyEdits(baseline, vdir, spec.edits)
  const journal = rapports[0].journal

  const deltas: Record<string, { ratio: number; heightDelta: number }> = {}
  const sections: Partial<Record<"desktop" | "mobile", DeltaSections>> = {}
  await timed(SCOPE, "rendu + delta vs baseline", async () => {
    for (const [label, fichier, viewport, ref, rapport] of [
      ["desktop", "variant.html", DESKTOP, "clone.png", rapports[0]],
      ["mobile", "variant.mobile.html", MOBILE, "clone.mobile.png", rapports[1] ?? rapports[0]],
    ] as const) {
      if (!existsSync(join(vdir, fichier))) continue
      const shot = join(vdir, label === "desktop" ? "variant.png" : "variant.mobile.png")
      const ancres = [...new Set(rapport.journal.flatMap((j) => [j.anchor, j.dans ?? ""]).filter(Boolean))]
      const { positions, bandes, touchees } = await shoot(vdir, baseline, fichier, viewport, shot, ancres)
      // le desktop fait foi pour l'affichage du journal
      if (label === "desktop")
        for (const j of journal) if (positions[j.anchor] != null) j.y = positions[j.anchor]
      if (!existsSync(join(baseline, ref))) continue
      const d = await visualDiff(join(baseline, ref), shot,
        join(vdir, label === "desktop" ? "delta.png" : "delta.mobile.png"))
      deltas[label] = { ratio: d.ratio, heightDelta: d.heightDelta }
      const s = sections[label] = await deltaParSection(join(baseline, ref), shot, bandes, touchees)
      step(SCOPE, `${label} : ${(d.ratio * 100).toFixed(2)}% de pixels changés · Δhauteur ${d.heightDelta}px · ` +
        `${s.changees.length} section(s) changée(s), ${s.touchees.length} touchée(s)` +
        (s.debordements.length ? ` · DÉBORDEMENT : ${s.debordements.join(", ")} changée(s) sans édition` : ""))
    }
  })

  // propre = rien n'a bougé hors des sections éditées ; null = pas de baseline pour le dire
  const vues = Object.values(sections)
  const propre = vues.length ? vues.every((s) => s.debordements.length === 0) : null
  await writeFile(join(vdir, "variant.json"),
    JSON.stringify({ ...spec, journal, deltas, sections, propre, baseline }, null, 2))
  return { vdir, spec, journal, deltas, sections, propre }
}

/* CLI */
if (estLance(import.meta.url)) {
  const [baseline, spec] = lireArgs().libres
  if (!baseline || !spec) fail(SCOPE, "usage : npm run apply -- <dossier-baseline> <spec.json>")
  applyVariant(baseline, spec).then((r) => {
    console.log(JSON.stringify({ variante: r.vdir, hypothese: r.spec.hypothese,
      metrique: r.spec.metrique, deltas: r.deltas, propre: r.propre,
      debordements: Object.fromEntries(Object.entries(r.sections).map(([v, s]) => [v, s.debordements])) }, null, 2))
  }).catch((e) => fail(SCOPE, String(e?.message ?? e)))
}
