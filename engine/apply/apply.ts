/**
 * apply.ts — la mécanique : éditions ancrées → HTML de variante.
 *
 * Purement déterministe. On charge le DOM capturé, on retrouve chaque ancre `data-lpws`,
 * on écrit la nouvelle valeur, on resérialise. Aucun LLM ici : le jugement a eu lieu en
 * amont (la VariantSpec), la mécanique se contente de l'exécuter fidèlement.
 *
 * Deux exigences non négociables :
 *  - **Ancre introuvable = échec franc.** Jamais d'édition silencieusement ignorée : une
 *    variante à moitié appliquée serait jugée comme si elle était complète.
 *  - **Les DEUX états sont édités** (desktop + mobile). Ils partagent les mêmes ancres par
 *    construction (marquage avant sérialisation, cf. 1_acquire) — c'est précisément à ça
 *    que sert cette décision.
 *
 * Le texte est posé via textContent : pas d'injection de balises, donc pas de HTML libre
 * qui contournerait la règle des ancres.
 */
import { chromium, type Browser } from "playwright"
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Edit } from "./spec.ts"
import { step } from "../shared/log.ts"

const SCOPE = "apply"

export type ApplyReport = { fichier: string; appliquees: number }

/** Applique les éditions dans la page ouverte. Retourne les ancres introuvables. */
function applyInPage(edits: Edit[]): string[] {
  const manquantes: string[] = []
  for (const e of edits) {
    const el = document.querySelector(`[data-lpws="${e.anchor}"]`)
    if (!el) { manquantes.push(e.anchor); continue }
    if (e.text !== undefined) {
      // un <input> n'a pas de texte : sa "valeur affichée" est son placeholder/value
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = e.text
      else el.textContent = e.text
    }
    if (e.placeholder !== undefined) el.setAttribute("placeholder", e.placeholder)
    if (e.href !== undefined) el.setAttribute("href", e.href)
    if (e.src !== undefined) el.setAttribute("src", e.src)
    el.setAttribute("data-lpws-edited", "")
  }
  return manquantes
}

/**
 * Écrit variant.html (+ variant.mobile.html) dans `outDir` à partir de la baseline.
 * Réseau coupé : on édite un DOM déjà self-contained, rien ne doit partir dehors.
 */
export async function applyEdits(
  baselineDir: string, outDir: string, edits: Edit[],
): Promise<ApplyReport[]> {
  const browser: Browser = await chromium.launch({ args: ["--no-sandbox"] })
  const rapports: ApplyReport[] = []
  try {
    for (const [source, cible] of [
      ["capture.html", "variant.html"],
      ["capture.mobile.html", "variant.mobile.html"],
    ] as const) {
      const src = join(baselineDir, source)
      if (!existsSync(src)) continue
      const page = await browser.newPage()
      // cf. note __name dans 1_acquire/render.ts
      await page.addInitScript({ content: "window.__name = (f) => f" })
      await page.route("**/*", (r) =>
        r.request().url().startsWith("file://") ? r.continue() : r.abort())
      await page.goto("file://" + resolve(src), { waitUntil: "domcontentloaded", timeout: 60_000 })

      const manquantes = await page.evaluate(applyInPage, edits)
      if (manquantes.length > 0)
        throw new Error(
          `ancres introuvables dans ${source} : ${manquantes.join(", ")} — ` +
          "la variante n'est pas applicable sur cette baseline (recapturer ou corriger la spec)")

      await writeFile(join(outDir, cible), await page.content())
      await page.close()
      rapports.push({ fichier: cible, appliquees: edits.length })
      step(SCOPE, `${cible} : ${edits.length} édition(s) appliquée(s)`)
    }
  } finally {
    await browser.close()
  }
  if (rapports.length === 0) throw new Error(`aucune capture trouvée dans ${baselineDir}`)
  return rapports
}
