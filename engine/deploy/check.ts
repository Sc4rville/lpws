/**
 * check.ts — LE JUGE de la livraison : la page publiée garde-t-elle la mesure ?
 *
 * Même règle que partout dans la machine : un résultat non vérifié n'est pas un résultat.
 * Ici la question n'est pas « est-ce joli » mais « le buyer retrouvera-t-il ses conversions ».
 * On ouvre la page préparée comme Google Ads l'ouvrirait — avec un identifiant de clic dans
 * l'URL — et on constate, dans le vrai moteur :
 *
 *   1. chaque CTA emporte l'identifiant vers le tunnel du client ;
 *   2. `noindex` et `canonical` sont là (une variante ne concurrence pas la page du client) ;
 *   3. le refus de consentement est poussé AVANT les pixels.
 *
 * Hors ligne : les requêtes vers googletagmanager/facebook sont coupées et comptées. On
 * vérifie que la page les DEMANDE, pas qu'un compte tiers réponde.
 */
import { lancerNavigateur, UA } from "../shared/navigateur.ts"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { DeployConfig } from "./config.ts"
import { step } from "../shared/log.ts"

const SCOPE = "deploy/check"
const ORIGIN = "http://variante.lpws"
const GCLID = "TEST-LPWS-0000"

const MIME: Record<string, string> = {
  html: "text/html", css: "text/css",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", json: "application/json",
}

export type CheckReport = {
  ok: boolean
  ctaAvecClic: number
  ctaTotal: number
  ctaSansClic: string[]
  noindex: boolean
  canonical: string | null
  consentAvantPixels: boolean
  pixelsDemandes: string[]
  echecs: string[]
}

export async function checkDeploy(dir: string, cfg: DeployConfig): Promise<CheckReport> {
  const browser = await lancerNavigateur()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent: UA })
  await page.addInitScript({ content: "window.__name = (f) => f" })

  const pixelsDemandes: string[] = []
  await page.route("**/*", async (route) => {
    const u = route.request().url()
    if (u.startsWith(ORIGIN)) {
      const chemin = decodeURIComponent(new URL(u).pathname)
      try {
        if (chemin.includes("..")) throw new Error("hors du dossier")
        const body = await readFile(join(dir, "." + (chemin === "/" ? "/index.html" : chemin)))
        const ext = chemin.split(".").pop()?.toLowerCase() ?? "html"
        return route.fulfill({ body, contentType: MIME[ext] ?? "application/octet-stream" })
      } catch { return route.fulfill({ status: 404, body: "" }) }
    }
    // tiers : on note la demande et on coupe — le juge reste hors ligne
    if (/googletagmanager\.com|google-analytics\.com|connect\.facebook\.net/.test(u)) pixelsDemandes.push(u)
    return route.fulfill({ status: 204, body: "" })
  })

  await page.goto(`${ORIGIN}/index.html?gclid=${GCLID}&utm_source=google&utm_campaign=test`,
    { waitUntil: "load" })
  await page.waitForTimeout(400)

  const vu = await page.evaluate((cibles: string[]) => {
    const liens = [...document.querySelectorAll<HTMLAnchorElement>("a[data-lpws]")]
      .filter((a) => cibles.includes(a.getAttribute("data-lpws") ?? ""))
      .map((a) => ({ anchor: a.getAttribute("data-lpws")!, href: a.getAttribute("href") ?? "" }))
    // gtag() pousse son objet `arguments`, pas un vrai tableau : indexer, ne pas tester Array
    const dl = ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as Record<number, unknown>[]
    const consent = dl.some((e) => e && e[0] === "consent" && e[1] === "default")
    return {
      liens,
      noindex: !!document.querySelector('meta[name="robots"][content*="noindex" i]'),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
      consent,
    }
  }, cfg.cta.map((c) => c.anchor))

  await browser.close()

  const ctaSansClic = vu.liens.filter((l) => !l.href.includes(GCLID)).map((l) => l.anchor)
  const manquants = cfg.cta.map((c) => c.anchor).filter((a) => !vu.liens.some((l) => l.anchor === a))

  const echecs: string[] = []
  if (manquants.length) echecs.push(`CTA absents de la page : ${manquants.join(", ")}`)
  if (ctaSansClic.length) echecs.push(`CTA sans identifiant de clic : ${ctaSansClic.join(", ")} — le buyer perdrait l'attribution`)
  if (!vu.noindex) echecs.push("pas de noindex : la variante peut être indexée et concurrencer la page du client")
  if (!vu.canonical) echecs.push("pas de canonical")
  if (cfg.pixels.consentModeV2 && !vu.consent) echecs.push("Consent Mode v2 attendu mais aucun refus par défaut poussé")
  if (cfg.pixels.gtag.length > 0 && !pixelsDemandes.some((u) => u.includes("googletagmanager")))
    echecs.push("gtag configuré mais jamais demandé par la page")

  const r: CheckReport = {
    ok: echecs.length === 0,
    ctaAvecClic: vu.liens.length - ctaSansClic.length,
    ctaTotal: cfg.cta.length,
    ctaSansClic,
    noindex: vu.noindex,
    canonical: vu.canonical,
    consentAvantPixels: vu.consent,
    pixelsDemandes: [...new Set(pixelsDemandes.map((u) => new URL(u).hostname))],
    echecs,
  }
  step(SCOPE, r.ok
    ? `livraison saine : ${r.ctaAvecClic}/${r.ctaTotal} CTA portent le clic · noindex · consent`
    : `livraison REFUSÉE : ${echecs.length} problème(s)`)
  return r
}
