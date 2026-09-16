/**
 * render.ts — acquisition : URL live → DOM post-JS fidèle + screenshots de référence.
 *
 * Charge la page dans un vrai Chromium (le JS s'exécute), démonte les overlays qui masquent
 * tout (preloaders, bandeaux cookies), scrolle toute la page (lazy-load + reveals), marque le
 * DOM (data-lpws, cf. mark.ts), puis sérialise.
 *
 * Héritage LWS/templatize (logique éprouvée, réécrite ici) :
 *  - démonter les overlays AVANT de scroller (les sites scroll-jackés bloquent le scroll tant
 *    que le loader couvre la page), PUIS de nouveau après (loaders à minuterie, toasts tardifs) ;
 *  - ne JAMAIS forcer la visibilité globale : le JS tourne, les reveals se déclenchent
 *    naturellement au scroll — forcer dé-cacherait aussi les méga-menus.
 *
 * Différence assumée avec templatize : on GARDE la marque et les vrais assets (c'est la page
 * du client d'un media buyer mandaté), on ne tokenise rien.
 *
 * Limite de cette étape (assumée, cf. readme famille) : le JS est retiré du clone — rejouer le
 * JS d'un framework sur un DOM sérialisé casse l'hydratation. Les styles inline posés par le JS
 * (GSAP & co) sont sérialisés avec le DOM → l'état VISUEL final est conservé. La réinjection
 * sélective (formulaires, tracking) est une étape ultérieure.
 *
 * Sorties dans <dir> :
 *   capture.html            DOM post-JS, marqué, sans <script>, <base> injectée
 *   original.png(.mobile)   screenshots pleine page du site LIVE = référence du juge
 *   resources.json          toutes les ressources chargées par le live (la vérité réseau,
 *                           consommée par 2_styles et 3_assets pour ne rien deviner)
 *   meta.json               source, date, stats, notes d'honnêteté
 */
import { chromium, type Page } from "playwright"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { markDom } from "./mark.ts"
import { step, timed } from "../../shared/log.ts"

const SCOPE = "clone/1_acquire"
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

export const DESKTOP = { width: 1440, height: 900 }
export const MOBILE = { width: 390, height: 844 }

export type Resource = { url: string; type: string; status: number; contentType: string }

export type AcquireResult = {
  source: string
  capturedAt: string
  marked: number
  htmlBytes: number
  resources: Record<string, number> // compte par type (stylesheet, image, font, script…)
}

/* ————— code injecté dans la page ————— */

/** Démonte cookies/preloaders plein écran. Conservateur : ne touche pas aux menus. */
function dismantleOverlays(): void {
  const cookieSel = [
    "#onetrust-consent-sdk", "#onetrust-banner-sdk",
    "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay",
    "#usercentrics-root", "#cookiescript_injected", "#cookie-law-info-bar",
    ".cky-consent-container", ".cky-overlay", ".cookie-overlay",
    '[class*="cookie-consent" i]', '[class*="cookie-banner" i]',
    '[class*="cookie-notice" i]', '[id*="cookie-banner" i]',
    '[aria-label*="cookie" i]', '[class*="consent" i][class*="banner" i]',
  ]
  document.querySelectorAll(cookieSel.join(",")).forEach((e) => e.remove())

  const vw = window.innerWidth, vh = window.innerHeight
  // toasts cookies non standard : fixe, petit/moyen, texte qui parle de cookies
  const COOKIE_TXT =
    /accept all|accept cookies|we use cookies|cookie policy|nous utilisons des cookies|accepter (les )?cookies/i
  document.querySelectorAll("div,section,aside").forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== "fixed" && cs.position !== "sticky") return
    const t = el.textContent || ""
    if (t.length < 400 && COOKIE_TXT.test(t)) el.remove()
  })
  // preloaders / intros plein écran, au nom évocateur
  const LOADER =
    /loader|preloader|pre-load|loading|intro-screen|introscreen|splash|page-transition|page-loader|curtain|overlay-?load|site-?intro/i
  document.querySelectorAll("div,section,aside").forEach((el) => {
    const id = (el.id || "") + " " + (el.getAttribute("class") || "")
    if (!LOADER.test(id)) return
    const cs = getComputedStyle(el)
    if (cs.position !== "fixed" && cs.position !== "absolute") return
    const r = el.getBoundingClientRect()
    if (r.width >= vw * 0.8 && r.height >= vh * 0.8) el.remove()
  })
  // si un loader bloquait le scroll, on le rend
  document.documentElement.style.overflow = ""
  document.body.style.overflow = ""
}

/** Scrolle toute la page par crans → lazy-load + reveals, puis remonte en haut. */
async function autoScroll(): Promise<void> {
  await new Promise<void>((resolve) => {
    let y = 0
    const t = setInterval(() => {
      window.scrollBy(0, 600)
      y += 600
      if (y >= document.body.scrollHeight) {
        clearInterval(t)
        resolve()
      }
    }, 80)
  })
  window.scrollTo(0, 0)
}

/**
 * Prépare le DOM pour la sérialisation :
 *  - retire les <script> (cf. limite en tête de fichier) + hints de préchargement de JS ;
 *  - retire les handlers inline on* (du JS résiduel qui référencerait des fonctions mortes) ;
 *  - retire les <meta> CSP (bloqueraient les ressources distantes en ouverture locale) ;
 *  - injecte <base href> pour que les URLs relatives résolvent vers le site source
 *    (provisoire : 2_styles/3_assets rapatrieront tout en local).
 */
function sanitizeForCapture(baseHref: string): void {
  document.querySelectorAll("script, link[rel='preload'][as='script'], link[rel='modulepreload']")
    .forEach((e) => e.remove())
  document.querySelectorAll("meta[http-equiv='Content-Security-Policy' i]").forEach((e) => e.remove())
  document.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) if (a.name.startsWith("on")) el.removeAttribute(a.name)
  })
  if (!document.querySelector("base")) {
    const base = document.createElement("base")
    base.href = baseHref
    document.head.prepend(base)
  }
}

/* ————— pilotage ————— */

export async function acquire(url: string, dir: string): Promise<AcquireResult> {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    const page: Page = await browser.newPage({ viewport: DESKTOP, userAgent: UA })
    // tsx/esbuild enveloppe les fonctions d'un helper __name ; il n'existe pas dans la page
    // → on le neutralise avant toute évaluation (chaîne brute : non transformée par esbuild)
    await page.addInitScript({ content: "window.__name = (f) => f" })

    // la vérité réseau : tout ce que le live charge réellement (aucune devinette en aval)
    const seen = new Map<string, Resource>()
    page.on("response", (res) => {
      const req = res.request()
      seen.set(res.url(), {
        url: res.url(),
        type: req.resourceType(),
        status: res.status(),
        contentType: res.headers()["content-type"] ?? "",
      })
    })

    await timed(SCOPE, `chargement ${url}`, async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
      await page.waitForTimeout(1500) // laisse le preloader/intro démarrer
    })

    await page.evaluate(dismantleOverlays) // AVANT le scroll (sites scroll-jackés)
    await timed(SCOPE, "scroll complet (lazy-load + reveals)", async () => {
      await page.evaluate(autoScroll)
      await page.waitForTimeout(1500)
    })
    await page.evaluate(dismantleOverlays) // APRÈS (loaders à minuterie, toasts tardifs)

    // screenshots de référence du LIVE — c'est contre eux que le juge compare le clone
    await timed(SCOPE, "screenshots de référence (desktop + mobile)", async () => {
      await page.screenshot({ path: join(dir, "original.png"), fullPage: true })
      await page.setViewportSize(MOBILE)
      await page.waitForTimeout(800)
      await page.evaluate(autoScroll)
      await page.waitForTimeout(800)
      await page.screenshot({ path: join(dir, "original.mobile.png"), fullPage: true })
      await page.setViewportSize(DESKTOP)
      await page.waitForTimeout(400)
    })

    // marquage (les ancres data-lpws) puis nettoyage, puis sérialisation
    const marked = await page.evaluate(markDom)
    step(SCOPE, `${marked} éléments marqués data-lpws`)
    await page.evaluate(sanitizeForCapture, url)
    const html = await page.content()
    if (html.length < 500) throw new Error("document vide après rendu — acquisition échouée")

    await writeFile(join(dir, "capture.html"), html)
    const resources = [...seen.values()]
    await writeFile(join(dir, "resources.json"), JSON.stringify(resources, null, 2))

    const byType: Record<string, number> = {}
    for (const r of resources) byType[r.type] = (byType[r.type] ?? 0) + 1

    return {
      source: url,
      capturedAt: new Date().toISOString(),
      marked,
      htmlBytes: html.length,
      resources: byType,
    }
  } finally {
    await browser.close()
  }
}
