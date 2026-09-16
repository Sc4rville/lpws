/**
 * verify.ts — LE JUGE : un clone n'est "fini" que s'il passe ici.
 *
 * Trois familles de preuves, écrites dans verify.json à côté du clone :
 *
 *  1. FIDÉLITÉ (le verdict) — diff visuel pixel à pixel clone vs screenshots du LIVE
 *     (original.png / original.mobile.png, pris par 1_acquire au même moment que le DOM).
 *     `fidele` = ratio ≤ seuil sur desktop ET mobile. C'est LE critère bloquant.
 *
 *  2. SANTÉ (diagnostic) — métriques héritées du juge LWS (éprouvées) : overflow
 *     horizontal, images cassées, blocs restés invisibles (reveal figé), titres rognés,
 *     erreurs console. Non bloquantes seules (l'original peut lui-même déborder), mais
 *     elles DISENT POURQUOI un diff est mauvais.
 *
 *  3. PREUVES — clone.png / clone.mobile.png / diff.png : à REGARDER, pas seulement à
 *     lire. Un ratio peut mentir (page presque vide → diff faible) ; l'œil non.
 *
 * Usage : npm run verify -- <dossier-baseline> [--seuil 0.03]
 * Export : verifyBaseline(dir, seuil)
 */
import { chromium, type Page } from "playwright"
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { visualDiff, type DiffResult } from "./diff.ts"
import { DESKTOP, MOBILE } from "../1_acquire/render.ts"
import { step, timed, fail } from "../../shared/log.ts"

const SCOPE = "clone/5_verify"
export const SEUIL_DEFAUT = 0.03 // 3% de pixels différents tolérés (fonts/antialiasing)

type Sante = {
  overflowX: boolean
  scrollW: number
  innerW: number
  consoleErrors: string[]
  brokenImages: number
  stuckHidden: number            // blocs conséquents restés invisibles (reveal non déclenché)
  clippedHeadings: { t: string; tag: string }[] // titres dont le texte déborde une boîte overflow:hidden
}

type Verdict = {
  fidele: boolean
  seuil: number
  desktop: { diff: DiffResult; sante: Sante; screenshot: string }
  mobile: { diff: DiffResult; sante: Sante; screenshot: string }
}

/** Métriques de santé, évaluées dans la page. Héritage direct du verify.cjs de LWS. */
function measureHealth(): Omit<Sante, "consoleErrors"> {
  const de = document.documentElement
  const imgs = [...document.images]
  const broken = imgs.filter((im) => im.complete && im.naturalWidth === 0).length
  const stuck = [...document.querySelectorAll("section,figure,article,picture,[data-reveal]")].filter((el) => {
    const r = el.getBoundingClientRect()
    if (r.width * r.height < 50_000) return false
    const cs = getComputedStyle(el)
    // <0.15 attrape le "opacity:.001" qui rend la capture blanche
    return parseFloat(cs.opacity) < 0.15 || cs.visibility === "hidden" || /inset\(\s*100%/.test(cs.clipPath || "")
  }).length
  const clipped = [...document.querySelectorAll('h1,h2,h3,[class*="title" i],[class*="heading" i]')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 40 || r.height < 14 || !el.textContent?.trim()) return false
      const cs = getComputedStyle(el)
      const hid = (v: string) => v === "hidden" || v === "clip"
      const clipV = (hid(cs.overflowY) || hid(cs.overflow)) && el.scrollHeight > el.clientHeight + 6
      const clipH = (hid(cs.overflowX) || hid(cs.overflow)) && el.scrollWidth > el.clientWidth + 2
      return clipV || clipH
    })
    .map((el) => ({ t: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48), tag: el.tagName.toLowerCase() }))
  return {
    overflowX: de.scrollWidth > window.innerWidth + 1,
    scrollW: de.scrollWidth,
    innerW: window.innerWidth,
    brokenImages: broken,
    stuckHidden: stuck,
    clippedHeadings: clipped,
  }
}

async function inspect(page: Page, file: string, shotPath: string): Promise<Sante & { screenshot: string }> {
  // cf. note __name dans 1_acquire/render.ts
  await page.addInitScript({ content: "window.__name = (f) => f" })
  const consoleErrors: string[] = []
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
  page.on("pageerror", (e) => consoleErrors.push(String(e)))
  await page.goto("file://" + resolve(file), { waitUntil: "load", timeout: 60_000 })
  await page.waitForTimeout(2000) // laisse charger images + fonts distantes
  const sante = await page.evaluate(measureHealth)
  await page.screenshot({ path: shotPath, fullPage: true })
  return { ...sante, consoleErrors, screenshot: shotPath }
}

export async function verifyBaseline(dir: string, seuil = SEUIL_DEFAUT): Promise<Verdict> {
  const capture = join(dir, "capture.html")
  if (!existsSync(capture)) fail(SCOPE, `${capture} introuvable — lancer l'acquisition d'abord`)

  const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    const out: Partial<Verdict> = { seuil }
    for (const [label, viewport, ref] of [
      ["desktop", DESKTOP, "original.png"],
      ["mobile", MOBILE, "original.mobile.png"],
    ] as const) {
      const page = await browser.newPage({ viewport })
      const shot = join(dir, label === "desktop" ? "clone.png" : "clone.mobile.png")
      const { screenshot, ...sante } = await timed(SCOPE, `rendu du clone (${label})`, () =>
        inspect(page, capture, shot))
      const diff = await visualDiff(join(dir, ref), shot,
        join(dir, label === "desktop" ? "diff.png" : "diff.mobile.png"))
      step(SCOPE, `${label} : diff ${(diff.ratio * 100).toFixed(2)}% · Δhauteur ${diff.heightDelta}px`)
      out[label] = { diff, sante: { ...sante, consoleErrors: sante.consoleErrors }, screenshot }
      await page.close()
    }
    const verdict: Verdict = {
      ...(out as Verdict),
      fidele: out.desktop!.diff.ratio <= seuil && out.mobile!.diff.ratio <= seuil,
    }
    await writeFile(join(dir, "verify.json"), JSON.stringify(verdict, null, 2))
    return verdict
  } finally {
    await browser.close()
  }
}

/* CLI */
if (process.argv[1]?.endsWith("verify.ts")) {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith("--"))
  const seuil = args.includes("--seuil") ? Number(args[args.indexOf("--seuil") + 1]) : SEUIL_DEFAUT
  if (!dir) fail(SCOPE, "usage : npm run verify -- <dossier-baseline> [--seuil 0.03]")
  verifyBaseline(dir, seuil).then((v) => {
    console.log(JSON.stringify({ fidele: v.fidele, desktop: v.desktop.diff.ratio, mobile: v.mobile.diff.ratio }, null, 2))
    process.exit(v.fidele ? 0 : 1)
  })
}
