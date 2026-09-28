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
import { lancerNavigateur, neutraliserNom, servirDossiers } from "../../shared/navigateur.ts"
import { type Page } from "playwright"
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { visualDiff, type DiffResult } from "./diff.ts"
import { DESKTOP, MOBILE, autoScroll } from "../1_acquire/render.ts"
import { step, timed, fail } from "../../shared/log.ts"
import { estLance, lireArgs } from "../../shared/cli.ts"

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
  hauteurRendu: number           // scrollHeight du clone rendu
  screenshotTronque: boolean     // hauteur aberrante (scroll-jack déroulé) → preuve tronquée
}

type Verdict = {
  fidele: boolean
  seuil: number
  desktop: { diff: DiffResult; sante: Sante; screenshot: string }
  mobile: { diff: DiffResult; sante: Sante; screenshot: string }
}

// au-delà, Chromium ne sait plus capturer, et une telle hauteur est déjà un diagnostic :
// un scroll-jack sans JS déroule ses pistes scroll-driven en hauteur réelle (constaté sur
// Monday : 169 000px de rendu pour 12 000px de live)
const HAUTEUR_MAX_SCREENSHOT = 16_000

/** Métriques de santé, évaluées dans la page. Héritage direct du verify.cjs de LWS. */
function measureHealth(): Omit<Sante, "consoleErrors" | "hauteurRendu" | "screenshotTronque"> {
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

// le clone est rendu depuis une origine http synthétique (cf. servirDossiers), pas en file://
const ORIGIN = "http://clone.lpws"

async function inspect(page: Page, dir: string, file: string, shotPath: string): Promise<Sante & { screenshot: string }> {
  await neutraliserNom(page)
  const consoleErrors: string[] = []
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
  page.on("pageerror", (e) => consoleErrors.push(String(e)))
  await servirDossiers(page, ORIGIN, [dir])
  await page.goto(`${ORIGIN}/${file}`, { waitUntil: "load", timeout: 60_000 })
  await page.evaluate(autoScroll) // même rituel que l'acquisition : tout doit s'être rendu
  await page.waitForTimeout(2000) // laisse charger fonts locales + éventuel reliquat distant
  const sante = await page.evaluate(measureHealth)
  const hauteurRendu = await page.evaluate(() => document.documentElement.scrollHeight)
  const screenshotTronque = hauteurRendu > HAUTEUR_MAX_SCREENSHOT
  if (screenshotTronque) {
    step(SCOPE, `hauteur de rendu aberrante (${hauteurRendu}px) : scroll-jack probable — ` +
      `preuve tronquée à ${HAUTEUR_MAX_SCREENSHOT}px, verdict = échec expliqué`)
    await page.screenshot({ path: shotPath, fullPage: true,
      clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: HAUTEUR_MAX_SCREENSHOT } })
  } else {
    await page.screenshot({ path: shotPath, fullPage: true })
  }
  return { ...sante, consoleErrors, hauteurRendu, screenshotTronque, screenshot: shotPath }
}

export async function verifyBaseline(dir: string, seuil = SEUIL_DEFAUT): Promise<Verdict> {
  const capture = join(dir, "capture.html")
  if (!existsSync(capture)) fail(SCOPE, `${capture} introuvable — lancer l'acquisition d'abord`)

  const browser = await lancerNavigateur({ args: ["--hide-scrollbars"] })
  try {
    const out: Partial<Verdict> = { seuil }
    // desktop et mobile ne s'attendent pas : deux pages, un navigateur, la moitié du temps
    await Promise.all(([
      ["desktop", DESKTOP, "original.png"],
      ["mobile", MOBILE, "original.mobile.png"],
    ] as const).map(async ([label, viewport, ref]) => {
      const page = await browser.newPage({ viewport })
      const shot = join(dir, label === "desktop" ? "clone.png" : "clone.mobile.png")
      const file = label === "mobile" && existsSync(join(dir, "capture.mobile.html"))
        ? "capture.mobile.html" : "capture.html"
      const { screenshot, ...sante } = await timed(SCOPE, `rendu du clone (${label})`, () =>
        inspect(page, dir, file, shot))
      const diff = await visualDiff(join(dir, ref), shot,
        join(dir, label === "desktop" ? "diff.png" : "diff.mobile.png"))
      step(SCOPE, `${label} : diff ${(diff.ratio * 100).toFixed(2)}% · Δhauteur ${diff.heightDelta}px`)
      out[label] = { diff, sante: { ...sante, consoleErrors: sante.consoleErrors }, screenshot }
      await page.close()
    }))
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
if (estLance(import.meta.url)) {
  const args = lireArgs()
  const [dir] = args.libres
  const seuil = args.option("--seuil") ? Number(args.option("--seuil")) : SEUIL_DEFAUT
  if (!dir) fail(SCOPE, "usage : npm run verify -- <dossier-baseline> [--seuil 0.03]")
  verifyBaseline(dir, seuil).then((v) => {
    console.log(JSON.stringify({ fidele: v.fidele, desktop: v.desktop.diff.ratio, mobile: v.mobile.diff.ratio }, null, 2))
    process.exit(v.fidele ? 0 : 1)
  })
}
