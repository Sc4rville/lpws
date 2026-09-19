/**
 * localize.ts — étape 2_styles : le CSS du clone devient self-contained.
 *
 * Consomme la vérité réseau de 1_acquire (resources.json + octets déjà dans assets/) :
 * rien n'est re-téléchargé, rien n'est deviné — on réécrit des références vers des octets
 * que le live a réellement servis.
 *
 *  1. Chaque feuille CSS rapatriée est réécrite : url() et @import pointent vers leurs
 *     voisins d'assets/ (fonts comprises — c'est ce qui débloque le rendu file://, où les
 *     fonts cross-origin sont refusées par CORS).
 *  2. capture.html : les <link rel="stylesheet"> pointent vers assets/, les <style> inline
 *     sont réécrits par le même moteur. Ce qui n'a pas été capturé reste distant, en URL
 *     absolue (pour survivre au retrait de <base> par 3_assets), et est COMPTÉ — le
 *     rapport nourrit les notes d'honnêteté de meta.json.
 *
 * Réécriture strictement mécanique (résolution d'URL + substitution), via Chromium pour le
 * HTML — jamais de réécriture libre (règle data-lpws). Ré-exécutable sans dégât : une
 * référence déjà locale est reconnue et laissée en paix.
 *
 * Usage : npm run styles -- <dossier-baseline>
 * Export : localizeStyles(dir) ; rewriteCssText et buildLocalMap sont réutilisés par 3_assets.
 */
import { recopieOmbre } from "../1_acquire/ombre.ts"
import { lancerNavigateur } from "../../shared/navigateur.ts"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve, basename } from "node:path"
import type { Resource } from "../1_acquire/render.ts"
import { step, timed, fail } from "../../shared/log.ts"

const SCOPE = "clone/2_styles"

export type StylesReport = {
  feuillesReecrites: number
  liensLocalises: number
  urlsReecrites: number
  distantes: { feuilles: string[]; fonts: string[]; autres: string[] }
}

/**
 * url → nom de fichier dans assets/, chaînes de redirection suivies jusqu'aux octets
 * (un CSS référence A, le CDN répond 302 vers B : les octets sont sous B, la référence
 * dit A — sans ce suivi, la ressource semblerait non capturée).
 */
export function buildLocalMap(resources: Resource[]): Record<string, string> {
  const byUrl = new Map(resources.map((r) => [r.url, r]))
  const map: Record<string, string> = {}
  for (const r of resources) {
    let cur: Resource | undefined = r
    for (let hop = 0; cur && !cur.local && cur.location && hop < 5; hop++)
      cur = byUrl.get(new URL(cur.location, cur.url).href)
    if (cur?.local) map[r.url] = basename(cur.local)
  }
  return map
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi
const CSS_IMPORT = /@import\s+(['"])([^'"]+?)\1/gi
const DEJA_LOCALE = /^[0-9a-f]{12}\.[a-z0-9]+$/ // le format produit par assetName (1_acquire)

export type CssRewrite = { css: string; reecrites: number; distantes: string[] }

/**
 * Réécrit les références d'un texte CSS vers les fichiers locaux.
 *  fromUrl : URL d'origine du texte — les références relatives se résolvent contre elle.
 *  prefix  : "" quand le CSS vit dans assets/ (références sœurs), "assets/" quand le texte
 *            est dans capture.html (<style>, style="").
 * Une référence non capturée est absolutisée (le clone perdra <base>) et remontée.
 */
export function rewriteCssText(
  css: string, fromUrl: string, map: Record<string, string>, prefix: string,
): CssRewrite {
  let reecrites = 0
  const distantes = new Set<string>()
  const rewriteRef = (ref: string): string | null => {
    if (/^(data:|blob:|#|%23|about:)/i.test(ref)) return null
    if (DEJA_LOCALE.test(ref) || ref.startsWith("assets/")) return null
    let abs: string
    try { abs = new URL(ref, fromUrl).href } catch { return null }
    const h = abs.indexOf("#")
    const clef = h === -1 ? abs : abs.slice(0, h) // url(sprite.svg#f) : le fragment se garde
    const local = map[clef]
    if (local) {
      reecrites++
      return prefix + local + (h === -1 ? "" : abs.slice(h))
    }
    distantes.add(clef)
    return abs === ref ? null : abs
  }
  const out = css
    .replace(CSS_URL, (m, q, ref) => { const r = rewriteRef(ref); return r === null ? m : `url(${q}${r}${q})` })
    .replace(CSS_IMPORT, (m, q, ref) => { const r = rewriteRef(ref); return r === null ? m : `@import ${q}${r}${q}` })
  return { css: out, reecrites, distantes: [...distantes] }
}

export async function localizeStyles(dir: string): Promise<StylesReport> {
  const resPath = join(dir, "resources.json")
  const capture = join(dir, "capture.html")
  if (!existsSync(resPath) || !existsSync(capture))
    fail(SCOPE, `${resPath} ou ${capture} introuvable — lancer 1_acquire d'abord`)

  const resources: Resource[] = JSON.parse(await readFile(resPath, "utf8"))
  const map = buildLocalMap(resources)

  let feuillesReecrites = 0
  let urlsReecrites = 0
  const dFeuilles = new Set<string>(), dFonts = new Set<string>(), dAutres = new Set<string>()
  const classe = (u: string) =>
    /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) ? dFonts : /\.css(\?|$)/i.test(u) ? dFeuilles : dAutres

  // 1 · les feuilles rapatriées : leurs url()/@import deviennent des voisins d'assets/
  await timed(SCOPE, "réécriture des feuilles CSS locales", async () => {
    for (const f of resources) {
      if (!f.local?.endsWith(".css")) continue
      const path = join(dir, f.local)
      if (!existsSync(path)) continue
      const avant = await readFile(path, "utf8")
      const r = rewriteCssText(avant, f.url, map, "")
      if (r.css !== avant) await writeFile(path, r.css)
      feuillesReecrites++
      urlsReecrites += r.reecrites
      for (const d of r.distantes) classe(d).add(d)
    }
  })

  // 2 · capture(.mobile).html : <link> vers assets/, <style> réécrits — Chromium, réseau coupé
  let liensLocalises = 0
  const browser = await lancerNavigateur()
  try {
    for (const nom of ["capture.html", "capture.mobile.html"]) {
      const fichier = join(dir, nom)
      if (!existsSync(fichier)) continue
      const page = await browser.newPage()
      // cf. note __name dans 1_acquire/render.ts
      await page.addInitScript({ content: "window.__name = (f) => f" })
      await page.route("**/*", (route) =>
        route.request().url().startsWith("file://") ? route.continue() : route.abort())
      await page.goto("file://" + resolve(fichier), { waitUntil: "domcontentloaded", timeout: 60_000 })
      // la base de résolution des références relatives : le <base> posé par 1_acquire
      const baseHref: string = await page.evaluate(
        () => document.querySelector("base")?.href ?? document.baseURI)

      const liens = await page.evaluate((m: Record<string, string>) => {
        const out = { localises: 0, distants: [] as string[] }
        const base = document.querySelector("base")?.href ?? document.baseURI
        document.querySelectorAll('link[rel~="stylesheet"], link[rel="preload"][as="style"]').forEach((l) => {
          const raw = l.getAttribute("href")
          if (!raw || raw.startsWith("assets/") || /^(data:|blob:)/i.test(raw)) return
          let abs: string
          try { abs = new URL(raw, base).href } catch { return }
          if (m[abs]) {
            l.setAttribute("href", "assets/" + m[abs]); out.localises++
            // la feuille est réécrite (urls → assets/) : l'empreinte SRI d'origine ne correspond
            // plus et le navigateur refuserait TOUTE la feuille en silence (monday : 2,4 Mo de
            // CSS perdus, méga-menu déplié en flux sur 30 000 px, pris pour un scroll-jack)
            l.removeAttribute("integrity"); l.removeAttribute("crossorigin")
          }
          else { l.setAttribute("href", abs); out.distants.push(abs) }
        })
        return out
      }, map)
      liensLocalises += liens.localises
      for (const d of liens.distants) classe(d).add(d)

      // les <style> font l'aller-retour par Node : un seul moteur de réécriture CSS,
      // l'ordre du document rend la correspondance déterministe
      const styles: string[] = await page.$$eval("style", (els) => els.map((e) => e.textContent ?? ""))
      let stylesTouches = 0
      const nouveaux = styles.map((t) => {
        if (!t.includes("url(") && !t.includes("@import")) return t
        const r = rewriteCssText(t, baseHref, map, "assets/")
        urlsReecrites += r.reecrites
        for (const d of r.distantes) classe(d).add(d)
        if (r.css !== t) stylesTouches++
        return r.css
      })
      if (stylesTouches > 0)
        await page.evaluate((texts: string[]) => {
          document.querySelectorAll("style").forEach((el, i) => {
            if (el.textContent !== texts[i]) el.textContent = texts[i]
          })
        }, nouveaux)

      await writeFile(fichier, await page.evaluate(recopieOmbre).then(() => page.content()))
      await page.close()
      step(SCOPE, `${nom} : ${liens.localises} <link> localisés · ${stylesTouches} <style> réécrits`)
    }
  } finally {
    await browser.close()
  }

  const report: StylesReport = {
    feuillesReecrites,
    liensLocalises,
    urlsReecrites,
    distantes: { feuilles: [...dFeuilles].sort(), fonts: [...dFonts].sort(), autres: [...dAutres].sort() },
  }
  const total = report.distantes.feuilles.length + report.distantes.fonts.length + report.distantes.autres.length
  if (total > 0) step(SCOPE, `${total} référence(s) restée(s) distante(s) — détail dans le rapport`)
  return report
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("2_styles/localize.ts")) {
  const dir = process.argv.slice(2).find((a) => !a.startsWith("--"))
  if (!dir) fail(SCOPE, "usage : npm run styles -- <dossier-baseline>")
  localizeStyles(dir).then((r) => console.log(JSON.stringify(r, null, 2)))
}
