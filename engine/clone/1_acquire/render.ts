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
 *   capture.html            DOM post-JS à l'état DESKTOP, marqué, sans <script>, <base> injectée
 *   capture.mobile.html     le même DOM à l'état MOBILE (mêmes ancres data-lpws) — les styles
 *                           inline posés par le JS au desktop (largeurs px, transforms) ne
 *                           valent rien à 390px : on sérialise l'état mobile réel, recalculé
 *                           par le vrai moteur, plutôt que d'espérer un reflow sans JS
 *   original.png(.mobile)   screenshots pleine page du site LIVE = référence du juge
 *   assets/                 les OCTETS des css/fonts/images/vidéos que le live a chargés,
 *                           nommés par hash de contenu (dédupliqués) — la matière première
 *                           de 2_styles/3_assets, rien n'est re-téléchargé après coup
 *   resources.json          toutes les ressources chargées par le live (la vérité réseau) ;
 *                           `local` pointe vers assets/ quand les octets sont rapatriés
 *   meta.json               source, date, stats, notes d'honnêteté
 */
import { chromium, type Page } from "playwright"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { markDom } from "./mark.ts"
import { step, timed } from "../../shared/log.ts"

const SCOPE = "clone/1_acquire"
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

export const DESKTOP = { width: 1440, height: 900 }
export const MOBILE = { width: 390, height: 844 }

export type Resource = {
  url: string
  type: string
  status: number
  contentType: string
  location?: string // redirection : où suivre la chaîne pour retrouver les octets
  local?: string    // chemin relatif au baseline ("assets/<hash>.<ext>") si rapatrié
  bytes?: number
}

export type AcquireResult = {
  source: string
  capturedAt: string
  marked: number
  htmlBytes: { desktop: number; mobile: number }
  resources: Record<string, number> // compte par type (stylesheet, image, font, script…)
  assetsLocaux: { fichiers: number; octets: number }
}

// au-delà, on n'embarque pas (vidéo de fond très lourde…) : la ressource reste distante,
// signalée dans resources.json — jamais d'échec silencieux
const MAX_ASSET_BYTES = 30_000_000

// ce dont 2_styles/3_assets auront besoin en local (le type Playwright d'abord, le
// content-type en rattrapage : un css chargé en fetch arrive typé "xhr")
const WANTED_TYPES = new Set(["stylesheet", "font", "image", "media"])
const WANTED_CT = /text\/css|font|image\/|video\/|audio\//i

const EXT_BY_CT: Record<string, string> = {
  "text/css": "css",
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "image/avif": "avif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf",
  "application/font-woff2": "woff2", "application/font-woff": "woff",
  "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3",
}

/** Extension déduite des magic bytes — pour les CDN qui servent fonts/images sur des URLs
 *  sans extension ni content-type utile (vu : dam-cdn.atl.orangelogic.com → fonts « .bin »,
 *  jamais chargées par le clone). */
function sniffExt(body: Buffer): string | undefined {
  const m4 = body.subarray(0, 4).toString("latin1")
  if (m4 === "wOF2") return "woff2"
  if (m4 === "wOFF") return "woff"
  if (m4 === "OTTO") return "otf"
  if (m4 === "\x00\x01\x00\x00") return "ttf"
  if (body[0] === 0x89 && m4.slice(1) === "PNG") return "png"
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpg"
  if (m4 === "GIF8") return "gif"
  if (m4 === "RIFF" && body.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  if (body.subarray(4, 8).toString("latin1") === "ftyp") return "mp4"
  if (/^\s*<(\?xml|svg)/i.test(body.subarray(0, 100).toString("utf8"))) return "svg"
  return undefined
}

/** Nom de fichier local : hash du CONTENU (deux URLs, mêmes octets → un seul fichier) +
 *  extension fiable (content-type, puis magic bytes, puis URL — qui peut mentir) ;
 *  l'extension compte : c'est elle qui donne le content-type au rendu par le juge. */
function assetName(body: Buffer, url: string, contentType: string): string {
  const ct = contentType.split(";")[0].trim().toLowerCase()
  const fromUrl = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  const ext = EXT_BY_CT[ct] ?? sniffExt(body) ?? fromUrl ?? "bin"
  return createHash("sha1").update(body).digest("hex").slice(0, 12) + "." + ext
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

/**
 * Gèle l'état visuel de la page : timers JS tués (typewriters, carrousels), boucles rAF
 * annulées, vidéos en pause au premier frame. Raison : entre le screenshot desktop et la
 * sérialisation du DOM s'écoulent plusieurs secondes (toute la passe mobile) — sans gel,
 * la référence et le clone sont DEUX états d'une page qui bouge, et le juge compte ce
 * désync comme de l'infidélité (constaté sur Jira : typewriter + carrousel).
 * Ne touche pas aux globals (setTimeout & co restent fonctionnels) : nos propres
 * évaluations ultérieures (autoScroll mobile) créent de nouveaux timers, valides.
 */
function freezePage(): void {
  const dernierTimer = window.setTimeout(() => {}, 0) as unknown as number
  for (let i = 0; i <= dernierTimer; i++) { clearTimeout(i); clearInterval(i) }
  const dernierRaf = window.requestAnimationFrame(() => {})
  for (let i = 0; i <= dernierRaf; i++) window.cancelAnimationFrame(i)
  // vidéos : pause + play() neutralisé sur l'élément (les listeners du site, toujours
  // vivants, ne peuvent plus relancer la lecture). RIEN d'autre : toucher aux sources
  // ferait s'effondrer la boîte (hauteur intrinsèque perdue) et fausserait la référence —
  // constaté sur Jira mobile. La frame affichée est ensuite capturée en image par
  // posterizeVideos : c'est elle que le clone montrera.
  document.querySelectorAll("video").forEach((v) => {
    try {
      v.removeAttribute("autoplay")
      ;(v as unknown as { play: () => Promise<void> }).play = () => Promise.resolve()
      v.pause()
    } catch { /* flux exotique : tant pis */ }
  })
}

/** Scrolle toute la page par crans → lazy-load + reveals, puis remonte en haut. */
export async function autoScroll(): Promise<void> {
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
  // les références sont gelées poster/frame-0 (freezePage) : le clone doit suivre la même
  // règle — pas d'autoplay, préchargement pour que le frame 0 s'affiche sans poster
  document.querySelectorAll("video").forEach((v) => {
    v.removeAttribute("autoplay")
    if (!v.getAttribute("preload")) v.setAttribute("preload", "auto")
  })
  // le lazy-load a déjà eu lieu (autoScroll) et l'état est figé : dans le clone, tout doit
  // se rendre sans scroll — sinon les images sous le pli manquent au screenshot du juge
  document.querySelectorAll('[loading="lazy"]').forEach((el) => el.setAttribute("loading", "eager"))
  // CSS-in-JS : les règles insérées via CSSOM (insertRule — styled-components & co, mode
  // "speedy") vivent dans la feuille, PAS dans le texte du <style> → la sérialisation les
  // perdrait (constaté sur Jira : formulaire héros rendu en input natif nu, toute la page
  // décalée). On re-matérialise chaque feuille en texte, et les adoptedStyleSheets en
  // <style> ajoutés.
  for (const sheet of [...document.styleSheets]) {
    const owner = sheet.ownerNode as HTMLElement | null
    if (!owner || owner.tagName !== "STYLE") continue
    try {
      const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n")
      if (rules && owner.textContent !== rules) owner.textContent = rules
    } catch { /* feuille inaccessible (cross-origin) : rien à sauver ici */ }
  }
  // (sanitize tourne deux fois — desktop puis mobile — d'où le garde-fou anti-doublon)
  if (!document.querySelector("style[data-lpws-adopted]")) {
    for (const sheet of document.adoptedStyleSheets ?? []) {
      try {
        const style = document.createElement("style")
        style.setAttribute("data-lpws-adopted", "")
        style.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n")
        document.head.append(style)
      } catch { /* idem */ }
    }
  }
  if (!document.querySelector("base")) {
    const base = document.createElement("base")
    base.href = baseHref
    document.head.prepend(base)
  }
}

/* ————— pilotage ————— */

/**
 * Fige chaque vidéo visible en image : la frame à l'écran (screenshot de sa zone) est
 * sauvée dans assets/ et devient le poster de l'élément. Les FLUX vidéo ne sont pas
 * capturables (HTTP 206 par plages, src posé par le JS/MSE — constaté sur Jira) ; leurs
 * PIXELS au moment du gel, si. Référence et clone montrent donc la même image par
 * construction. Une vidéo sans frame affichée (readyState < 2) garde son poster d'origine,
 * identique des deux côtés.
 */
async function posterizeVideos(page: Page, dir: string, state: string): Promise<void> {
  const boxes = await page.evaluate(() => {
    const de = document.documentElement
    const docW = de.scrollWidth, docH = de.scrollHeight
    return [...document.querySelectorAll("video")].map((v, i) => {
      const r = v.getBoundingClientRect()
      // clampé au document : une vidéo partiellement hors-champ (carrousel) se capture
      // sur sa partie visible, une vidéo entièrement dehors se saute
      const x = Math.max(0, r.x + window.scrollX), y = Math.max(0, r.y + window.scrollY)
      const w = Math.min(r.width, docW - x), h = Math.min(r.height, docH - y)
      return { i, x, y, w, h, ready: v.readyState >= 2 }
    })
  })
  for (const b of boxes) {
    if (!b.ready || b.w < 10 || b.h < 10) continue
    const buf = await page.screenshot({
      fullPage: true, // le clip s'applique à l'image rendue : sans fullPage, viewport seul
      clip: { x: b.x, y: b.y, width: Math.floor(b.w), height: Math.floor(b.h) },
    })
    const name = `video-${state}-${b.i}.png`
    await writeFile(join(dir, "assets", name), buf)
    await page.evaluate((arg: { i: number; src: string }) => {
      document.querySelectorAll("video")[arg.i]?.setAttribute("poster", arg.src)
    }, { i: b.i, src: `assets/${name}` })
  }
}

export async function acquire(url: string, dir: string): Promise<AcquireResult> {
  // repartir propre : les hashs d'une capture précédente ne correspondent plus à rien
  await rm(join(dir, "assets"), { recursive: true, force: true })
  await mkdir(join(dir, "assets"), { recursive: true })

  const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    const page: Page = await browser.newPage({ viewport: DESKTOP, userAgent: UA })
    // tsx/esbuild enveloppe les fonctions d'un helper __name ; il n'existe pas dans la page
    // → on le neutralise avant toute évaluation (chaîne brute : non transformée par esbuild)
    await page.addInitScript({ content: "window.__name = (f) => f" })

    // la vérité réseau : tout ce que le live charge réellement (aucune devinette en aval)
    const seen = new Map<string, Resource>()
    const bodies = new Map<string, Promise<Buffer | null>>()
    page.on("response", (res) => {
      const req = res.request()
      const r: Resource = {
        url: res.url(),
        type: req.resourceType(),
        status: res.status(),
        contentType: res.headers()["content-type"] ?? "",
      }
      if (res.status() >= 300 && res.status() < 400) r.location = res.headers()["location"]
      seen.set(res.url(), r)
      // les octets, saisis au vol (une réponse évincée du cache devient irrécupérable) ;
      // .catch → null : une ressource ratée reste distante, elle ne fait pas échouer la capture
      if (res.status() === 200 && !bodies.has(res.url()) &&
          (WANTED_TYPES.has(r.type) || WANTED_CT.test(r.contentType)))
        bodies.set(res.url(), res.body().catch(() => null))
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

    // laisser les derniers médias arriver (héros vidéo/image tardif) avant de figer quoi
    // que ce soit — sinon la référence montre un trou que le clone, lui, n'aura pas
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {})
    // …et TOUTES les images décodées : une image en vol au screenshot = placeholder sur la
    // référence mais image pleine dans le clone (course constatée sur les cartes Jira)
    await page.waitForFunction(
      () => [...document.images].every((im) => !im.src || im.complete),
      undefined, { timeout: 8_000 }).catch(() => {})

    // marquage AVANT toute sérialisation : les deux états (desktop/mobile) du même DOM
    // portent les MÊMES ancres data-lpws
    const marked = await page.evaluate(markDom)
    step(SCOPE, `${marked} éléments marqués data-lpws`)

    // pour chaque état : freeze (référence, clone et DOM = le même instant visuel,
    // cf. freezePage), screenshot de référence, puis sérialisation de CET état
    const html = await timed(SCOPE, "référence + sérialisation (desktop)", async () => {
      await page.evaluate(freezePage)
      await page.waitForTimeout(400) // laisse peindre l'état gelé
      await page.screenshot({ path: join(dir, "original.png"), fullPage: true })
      await posterizeVideos(page, dir, "desktop")
      await page.evaluate(sanitizeForCapture, url)
      return page.content()
    })
    if (html.length < 500) throw new Error("document vide après rendu — acquisition échouée")
    await writeFile(join(dir, "capture.html"), html)

    const htmlMobile = await timed(SCOPE, "référence + sérialisation (mobile)", async () => {
      await page.setViewportSize(MOBILE)
      await page.waitForTimeout(800)
      await page.evaluate(autoScroll) // lazy-load des variantes responsive
      await page.waitForTimeout(800)
      await page.waitForFunction(
        () => [...document.images].every((im) => !im.src || im.complete),
        undefined, { timeout: 8_000 }).catch(() => {})
      await page.evaluate(dismantleOverlays) // un resize peut faire resurgir un bandeau
      await page.evaluate(freezePage)        // et réarmer des timers
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(dir, "original.mobile.png"), fullPage: true })
      await posterizeVideos(page, dir, "mobile")
      await page.evaluate(sanitizeForCapture, url) // idempotent (base/adopted gardés)
      return page.content()
    })
    await writeFile(join(dir, "capture.mobile.html"), htmlMobile)

    // rapatriement des octets → assets/
    const assetsLocaux = await timed(SCOPE, "rapatriement des octets (css/fonts/images)", async () => {
      let fichiers = 0, octets = 0
      for (const [u, pending] of bodies) {
        const body = await pending
        const r = seen.get(u)
        if (!body || !r || body.length === 0) continue
        if (body.length > MAX_ASSET_BYTES) {
          step(SCOPE, `trop lourd pour être embarqué (> ${MAX_ASSET_BYTES / 1e6} Mo), reste distant : ${u}`)
          continue
        }
        const name = assetName(body, u, r.contentType)
        await writeFile(join(dir, "assets", name), body)
        r.local = `assets/${name}`
        r.bytes = body.length
        fichiers++
        octets += body.length
      }
      return { fichiers, octets }
    })
    step(SCOPE, `${assetsLocaux.fichiers} assets rapatriés (${(assetsLocaux.octets / 1e6).toFixed(1)} Mo)`)

    const resources = [...seen.values()]
    await writeFile(join(dir, "resources.json"), JSON.stringify(resources, null, 2))

    const byType: Record<string, number> = {}
    for (const r of resources) byType[r.type] = (byType[r.type] ?? 0) + 1

    return {
      source: url,
      capturedAt: new Date().toISOString(),
      marked,
      htmlBytes: { desktop: html.length, mobile: htmlMobile.length },
      resources: byType,
      assetsLocaux,
    }
  } finally {
    await browser.close()
  }
}
