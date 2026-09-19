/**
 * localize.ts — étape 3_assets : images/vidéos rapatriées, le clone devient autonome.
 *
 * Même principe que 2_styles (la vérité réseau de resources.json, jamais de devinette),
 * appliqué à tout ce que capture.html affiche :
 *  - img/src, srcset, <source>, poster, <image>/<use> svg → fichiers d'assets/ quand les
 *    octets ont été capturés ; sinon URL absolue, COMPTÉE (honnêteté) ;
 *  - styles inline (style="…url(…)") réécrits par le moteur de 2_styles ;
 *  - liens, icônes, actions de formulaires : absolutisés ;
 *  - puis <base> est RETIRÉE — c'est l'acte final : le clone ne résout plus rien vers le
 *    site source, ce qu'il affiche vient de son dossier.
 *
 * Les candidats srcset jamais chargés à la capture (autres viewports/DPR) restent distants
 * par construction — le navigateur ne les a jamais demandés. Comptés à part : sans effet
 * aux viewports du juge (identiques à ceux de la capture), pas un échec.
 *
 * Réécriture d'attributs mécanique et déterministe via Chromium — jamais de réécriture
 * libre du HTML (règle data-lpws). Ré-exécutable sans dégât.
 *
 * Usage : npm run assets -- <dossier-baseline>
 * Export : localizeAssets(dir)
 */
import { recopieOmbre } from "../1_acquire/ombre.ts"
import { lancerNavigateur } from "../../shared/navigateur.ts"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Resource } from "../1_acquire/render.ts"
import { buildLocalMap, rewriteCssText } from "../2_styles/localize.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "clone/3_assets"

export type AssetsReport = {
  locaux: number             // références devenues locales
  stylesInlineReecrits: number
  distants: string[]         // affiché par le clone mais jamais capturé → reste distant
  srcsetNonCaptures: number  // candidats d'autres viewports, distants par construction
}

export async function localizeAssets(dir: string): Promise<AssetsReport> {
  const resPath = join(dir, "resources.json")
  const capture = join(dir, "capture.html")
  if (!existsSync(resPath) || !existsSync(capture))
    fail(SCOPE, `${resPath} ou ${capture} introuvable — lancer 1_acquire d'abord`)

  const resources: Resource[] = JSON.parse(await readFile(resPath, "utf8"))
  const map = buildLocalMap(resources)

  const cumul = { locaux: 0, distants: new Set<string>(), srcsetNonCaptures: 0, stylesInline: 0 }
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
    // saisie AVANT le retrait de <base> : les styles inline se résolvent contre elle
    const baseHref: string = await page.evaluate(
      () => document.querySelector("base")?.href ?? document.baseURI)

    // 1 · attributs — locaux si capturés, sinon absolus ; <base> retirée à la fin
    const stats = await page.evaluate((m: Record<string, string>) => {
      const out = { locaux: 0, distants: [] as string[], srcsetNonCaptures: 0 }
      const base = document.querySelector("base")?.href ?? document.baseURI
      const skippable = (raw: string | null): boolean =>
        !raw || raw.startsWith("assets/") || /^(data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw)
      const toLocal = (raw: string): string | null => {
        try {
          const abs = new URL(raw, base).href
          const h = abs.indexOf("#")
          const local = m[h === -1 ? abs : abs.slice(0, h)]
          return local ? "assets/" + local + (h === -1 ? "" : abs.slice(h)) : null
        } catch { return null }
      }
      const absolu = (raw: string): string | null => {
        try { return new URL(raw, base).href } catch { return null }
      }
      /** locale si capturée, sinon absolue ; compte=true quand l'attribut porte des pixels */
      const reecrit = (el: Element, attr: string, compte: boolean): void => {
        const raw = el.getAttribute(attr)
        if (skippable(raw)) return
        const local = toLocal(raw!)
        if (local) { el.setAttribute(attr, local); out.locaux++; return }
        const abs = absolu(raw!)
        if (!abs) return
        el.setAttribute(attr, abs)
        if (compte) out.distants.push(abs)
      }

      document.querySelectorAll("img[src], source[src], video[src], audio[src], input[type=image][src]")
        .forEach((el) => reecrit(el, "src", true))
      document.querySelectorAll("video[poster]").forEach((el) => reecrit(el, "poster", true))
      document.querySelectorAll("image, use").forEach((el) => {
        reecrit(el, "href", true)
        reecrit(el, "xlink:href", true)
      })

      document.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
        const raw = el.getAttribute("srcset")
        if (skippable(raw)) return
        const parts = raw!.split(",").map((p) => {
          const m2 = p.trim().match(/^(\S+)(\s+\S+)?$/)
          if (!m2) return p.trim()
          const [, u, desc = ""] = m2
          if (u.startsWith("assets/") || /^(data:|blob:)/i.test(u)) return u + desc
          const local = toLocal(u)
          if (local) { out.locaux++; return local + desc }
          out.srcsetNonCaptures++
          return (absolu(u) ?? u) + desc
        })
        el.setAttribute("srcset", parts.join(", "))
      })

      // le reste : rien à afficher, mais tout doit survivre sans <base>
      document.querySelectorAll("a[href], area[href], form[action]").forEach((el) => {
        const attr = el.hasAttribute("action") ? "action" : "href"
        const raw = el.getAttribute(attr)
        if (skippable(raw)) return
        const abs = absolu(raw!)
        if (abs) el.setAttribute(attr, abs)
      })
      // les <link> non-stylesheet (icônes…) peuvent avoir été capturés → tentative locale
      document.querySelectorAll("link[href]").forEach((el) => reecrit(el, "href", false))

      document.querySelector("base")?.remove()
      return out
    }, map)

    // 2 · styles inline : aller-retour par Node, même moteur que 2_styles ; l'ordre du
    // document rend la correspondance déterministe (aucune mutation entre les deux passes)
    const selecteur = '[style*="url("]'
    const inlines: string[] = await page.$$eval(selecteur, (els) =>
      els.map((e) => e.getAttribute("style") ?? ""))
    const distantsCss = new Set<string>()
    let stylesInlineReecrits = 0
    const nouveaux = inlines.map((t) => {
      const r = rewriteCssText(t, baseHref, map, "assets/")
      if (r.css !== t) stylesInlineReecrits++
      for (const d of r.distantes) distantsCss.add(d)
      stats.locaux += r.reecrites
      return r.css
    })
    if (stylesInlineReecrits > 0)
      await page.evaluate((arg: { sel: string; texts: string[] }) => {
        document.querySelectorAll(arg.sel).forEach((el, i) => {
          if (el.getAttribute("style") !== arg.texts[i]) el.setAttribute("style", arg.texts[i])
        })
      }, { sel: selecteur, texts: nouveaux })

    await writeFile(fichier, await page.evaluate(recopieOmbre).then(() => page.content()))
    await page.close()

    cumul.locaux += stats.locaux // r.reecrites des styles inline déjà comptées dedans
    cumul.srcsetNonCaptures += stats.srcsetNonCaptures
    cumul.stylesInline += stylesInlineReecrits
    for (const d of [...stats.distants, ...distantsCss]) cumul.distants.add(d)
    step(SCOPE, `${nom} : ${stats.locaux} références locales · ${stylesInlineReecrits} styles ` +
      `inline réécrits · <base> retirée`)
    }

    const report: AssetsReport = {
      locaux: cumul.locaux,
      stylesInlineReecrits: cumul.stylesInline,
      distants: [...cumul.distants].sort(),
      srcsetNonCaptures: cumul.srcsetNonCaptures,
    }
    if (report.distants.length > 0)
      step(SCOPE, `${report.distants.length} référence(s) restée(s) distante(s) — détail dans le rapport`)
    return report
  } finally {
    await browser.close()
  }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("3_assets/localize.ts")) {
  const dir = process.argv.slice(2).find((a) => !a.startsWith("--"))
  if (!dir) fail(SCOPE, "usage : npm run assets -- <dossier-baseline>")
  localizeAssets(dir).then((r) => console.log(JSON.stringify(r, null, 2)))
}
