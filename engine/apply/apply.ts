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

/** Une ligne du journal : ce que la mécanique a RÉELLEMENT fait, pas ce que la spec demandait. */
export type Entree = {
  n: number
  op: string
  anchor: string        // l'ancre finale (celle de la copie, pour une duplication)
  quoi: string          // "texte", "href", "section entière"…
  avant?: string
  apres?: string
  ou?: string           // "avant s9", "après s6"
  pourquoi: string
  y?: number            // position verticale finale dans la page rendue (px)
  section?: string      // la bande de haut niveau qui contient l'élément
}

export type ApplyReport = { fichier: string; appliquees: number; journal: Entree[] }

/**
 * Applique les éditions dans la page ouverte, dans l'ordre de la spec (une duplication
 * peut donc être suivie d'éditions visant la copie).
 *
 * Tient un JOURNAL de ce qui a réellement changé — valeur avant, valeur après, position
 * finale dans la page. C'est lui qu'on affiche : relire la spec ne dit pas ce qui s'est
 * passé, seulement ce qui était demandé.
 */
function applyInPage(edits: Edit[]): { manquantes: string[]; journal: Entree[] } {
  const manquantes: string[] = []
  const journal: Entree[] = []
  const get = (a?: string) => a ? document.querySelector(`[data-lpws="${a}"]`) : null
  const lire = (el: Element): string => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      return el.value || el.placeholder || ""
    return (el.textContent || "").trim().replace(/\s+/g, " ")
  }
  const court = (s: string, n = 110) => s.length > n ? s.slice(0, n) + "…" : s

  edits.forEach((e, i) => {
    const el = get(e.anchor)
    if (!el) { manquantes.push(e.anchor); return }
    const op = e.op ?? "set"
    const ligne: Entree = { n: i + 1, op, anchor: e.anchor, quoi: "", pourquoi: e.pourquoi }

    if (op === "remove") {
      const t = el.tagName.toLowerCase()
      ligne.quoi = t === "div" ? "section entière" : t === "img" ? "image" : `<${t}>`
      ligne.avant = court(lire(el)) || `(${ligne.quoi} sans texte)`
      // la position se relève AVANT le retrait : après, l'élément n'est plus mesurable
      ligne.y = Math.round(el.getBoundingClientRect().y + window.scrollY)
      const bande = el.closest('[data-lpws^="s"]')?.getAttribute("data-lpws")
      if (bande) ligne.section = bande
      ligne.ou = "retiré de la page"
      journal.push(ligne)
      el.remove()
      return
    }

    if (op === "move" || op === "duplicate") {
      const cible = get(e.before ?? e.after)
      if (!cible) { manquantes.push((e.before ?? e.after)!); return }
      let noeud: Element = el
      if (op === "duplicate") {
        noeud = el.cloneNode(true) as Element
        // re-cléage : la copie et TOUS ses descendants reçoivent le suffixe, sinon deux
        // éléments porteraient la même ancre et les éditions suivantes seraient ambiguës
        const suffixe = "-" + e.as
        const marquer = (n: Element) => {
          const a = n.getAttribute("data-lpws")
          if (a) n.setAttribute("data-lpws", a + suffixe)
        }
        marquer(noeud)
        noeud.querySelectorAll("[data-lpws]").forEach(marquer)
        noeud.setAttribute("data-lpws-added", "")
        ligne.anchor = e.anchor + suffixe
      }
      ligne.quoi = op === "duplicate" ? `copie du bloc ${e.anchor}` : `bloc ${e.anchor}`
      ligne.avant = court(lire(el), 70) || "(bloc sans texte)"
      ligne.ou = (e.before ? "avant " : "après ") + (e.before ?? e.after)
      journal.push(ligne)
      if (e.before) cible.before(noeud); else cible.after(noeud)
      ;(noeud as HTMLElement).setAttribute("data-lpws-edited", "")
      return
    }

    if (op === "swap") {
      const autre = get(e.with)
      if (!autre) { manquantes.push(e.with!); return }
      ligne.quoi = `${e.anchor} ↔ ${e.with}`
      ligne.avant = court(lire(el), 60)
      ligne.apres = court(lire(autre), 60)
      journal.push(ligne)
      // marqueur neutre : on ne peut pas échanger deux nœuds sans point de repère
      const repere = document.createComment("lpws-swap")
      el.before(repere)
      autre.before(el)
      repere.replaceWith(autre)
      el.setAttribute("data-lpws-edited", "")
      autre.setAttribute("data-lpws-edited", "")
      return
    }

    // op "set" — une ligne de journal par attribut réellement touché
    const avant = lire(el)
    if (e.text !== undefined) {
      // un <input> n'a pas de texte : sa "valeur affichée" est son placeholder/value
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = e.text
      else el.textContent = e.text
      journal.push({ ...ligne, quoi: "texte", avant: court(avant), apres: court(e.text) })
    }
    if (e.placeholder !== undefined) {
      journal.push({ ...ligne, quoi: "placeholder",
        avant: el.getAttribute("placeholder") ?? "", apres: e.placeholder })
      el.setAttribute("placeholder", e.placeholder)
    }
    if (e.href !== undefined) {
      journal.push({ ...ligne, quoi: "lien", avant: el.getAttribute("href") ?? "", apres: e.href })
      el.setAttribute("href", e.href)
    }
    if (e.src !== undefined) {
      journal.push({ ...ligne, quoi: "image", avant: el.getAttribute("src") ?? "", apres: e.src })
      el.setAttribute("src", e.src)
    }
    el.setAttribute("data-lpws-edited", "")
  })

  // seconde passe : où chaque élément touché a ATTERRI (les positions bougent en cours de route)
  for (const l of journal) {
    if (l.op === "remove") continue // déjà relevée avant le retrait
    const el = get(l.anchor)
    if (!el) continue
    l.y = Math.round(el.getBoundingClientRect().y + window.scrollY)
    const bande = el.closest('[data-lpws^="s"]') ?? (/^s/.test(l.anchor) ? el : null)
    const a = bande?.getAttribute("data-lpws")
    if (a) l.section = a
  }
  return { manquantes, journal }
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

      const { manquantes, journal } = await page.evaluate(applyInPage, edits)
      if (manquantes.length > 0)
        throw new Error(
          `ancres introuvables dans ${source} : ${manquantes.join(", ")} — ` +
          "la variante n'est pas applicable sur cette baseline (recapturer ou corriger la spec)")

      await writeFile(join(outDir, cible), await page.content())
      await page.close()
      rapports.push({ fichier: cible, appliquees: journal.length, journal })
      step(SCOPE, `${cible} : ${edits.length} édition(s) → ${journal.length} changement(s)`)
    }
  } finally {
    await browser.close()
  }
  if (rapports.length === 0) throw new Error(`aucune capture trouvée dans ${baselineDir}`)
  return rapports
}
