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
import { recopieOmbre } from "../clone/1_acquire/ombre.ts"
import { lancerNavigateur, neutraliserNom, horsLigne } from "../shared/navigateur.ts"
import { type Browser } from "playwright"
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Edit } from "./spec.ts"
import { harvestDesign, type DesignSystem, type Role } from "./design.ts"
import { bandesDuRendu } from "../clone/1_acquire/mark.ts"
import { step, fail } from "../shared/log.ts"

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

export type ApplyReport = {
  fichier: string; appliquees: number; journal: Entree[]
  /** rôles du design system introuvables sur cette page — ce qu'on n'a pas su reproduire */
  manquesDesign: string[]
}

/**
 * Applique les éditions dans la page ouverte, dans l'ordre de la spec (une duplication
 * peut donc être suivie d'éditions visant la copie).
 *
 * Tient un JOURNAL de ce qui a réellement changé — valeur avant, valeur après, position
 * finale dans la page. C'est lui qu'on affiche : relire la spec ne dit pas ce qui s'est
 * passé, seulement ce qui était demandé.
 */
function applyInPage(arg: { edits: Edit[]; ds: DesignSystem; bandes: string[] }):
  { manquantes: string[]; desaccords: string[]; journal: Entree[] } {
  const { edits, ds, bandes } = arg
  /** la bande de haut niveau qui contient `el` : `s<n>` posée par la géométrie, ou balise sémantique `e<n>` */
  const bandeDe = (el: Element): string | undefined => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const a = n.getAttribute("data-lpws")
      if (a && (/^s\d/.test(a) || bandes.includes(a))) return a
    }
    return undefined
  }
  const manquantes: string[] = []
  /** l'ancre existe mais ne désigne plus ce que la spec visait — cf. Attendu dans spec.ts */
  const desaccords: string[] = []
  const journal: Entree[] = []

  const roleDe = (el: Element): string => {
    const t = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(t)) return "heading"
    if (t === "a" || t === "button") return "link"
    if (t === "img" || t === "picture" || t === "video" || t === "svg") return "media"
    if (t === "input" || t === "textarea" || t === "select" || t === "label") return "field"
    if (t === "p" || t === "li" || t === "blockquote" || t === "figcaption") return "text"
    return "bande"
  }
  const norme = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 140)
  /**
   * Le témoin ne réclame pas l'identique : le client a le droit de corriger une coquille.
   * Il réclame que ce soit encore LE MÊME élément — même rôle, texte reconnaissable.
   */
  const concorde = (el: Element, att: { role: string; text: string }): boolean => {
    if (roleDe(el) !== att.role) return false
    const a = norme(att.text), b = norme(el.textContent || "")
    if (!a && !b) return true
    if (!a || !b) return false
    if (a === b || a.includes(b) || b.includes(a)) return true
    const mots = (t: string) => new Set(t.split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 2))
    const A = mots(a), B = mots(b)
    let inter = 0
    for (const m of A) if (B.has(m)) inter++
    return inter / Math.max(A.size + B.size - inter, 1) >= 0.4
  }
  // LES ANCRES DESCENDENT DANS LE SHADOW DOM (racines ouvertes). En-tête, recherche, vidéo,
  // pied chez Salesforce (Lightning) vivent là : sans ça, visibles dans le clone, jamais éditables.
  // Fonction de page : les aides sont recopiées ici, page.evaluate n'embarque que ce corps.
  const racinesDom = (): (Document | ShadowRoot)[] => {
    const out: (Document | ShadowRoot)[] = [document]
    for (let i = 0; i < out.length; i++) out[i].querySelectorAll("*").forEach((el) => { if (el.shadowRoot) out.push(el.shadowRoot) })
    return out
  }
  const tous = (sel: string): Element[] => racinesDom().flatMap((r) => [...r.querySelectorAll(sel)])
  const parentDe = (el: Element): Element | null => el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null)
  const get = (a?: string) => a ? (tous(`[data-lpws="${a}"]`)[0] ?? null) : null
  const lire = (el: Element): string => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      return el.value || el.placeholder || ""
    return (el.textContent || "").trim().replace(/\s+/g, " ")
  }
  const court = (s: string, n = 110) => s.length > n ? s.slice(0, n) + "…" : s

  edits.forEach((e, i) => {
    const op = e.op ?? "set"

    /* ——— COMPOSE : fabriquer une section absente de la page, avec les classes du client ——— */
    if (op === "compose") {
      const c = e.contenu!
      const sombre = e.ton === "sombre"
      const cible = get(e.before ?? e.after)
      if (!cible) { manquantes.push((e.before ?? e.after)!); return }
      const mk = (r: Role | undefined, repli: string, txt?: string): HTMLElement => {
        const n = document.createElement(r?.tag ?? repli)
        if (r?.cls) n.setAttribute("class", r.cls)
        if (txt !== undefined) n.textContent = txt
        return n
      }
      // une bande sombre impose ses propres rôles de texte : réutiliser le titre d'une
      // section claire donnerait du noir sur noir
      const rBande = sombre ? (ds.bandDark ?? ds.band) : ds.band
      const rTitre = sombre ? (ds.darkTitle ?? ds.title) : ds.title
      const rTexte = sombre ? (ds.darkText ?? ds.subtitle) : ds.subtitle
      const rCta = sombre ? (ds.darkCta ?? ds.ctaPrimary) : ds.ctaPrimary
      const cle = "c-" + e.as
      const bande = mk(rBande, "section")
      bande.setAttribute("data-lpws", cle)
      bande.setAttribute("data-lpws-added", "")
      // on rebâtit la chaîne d'emboîtement du client (bande > wrapper > … > conteneur) :
      // c'est elle qui porte la gouttière, pas un conteneur unique
      let dedans: HTMLElement = bande
      for (const r of ds.chain ?? (ds.container ? [ds.container] : [])) {
        const w = mk(r, "div")
        dedans.append(w)
        dedans = w
      }
      const h = mk(rTitre, "h2", c.titre)
      h.setAttribute("data-lpws", cle + "-titre")
      dedans.append(h)
      if (c.accroche) {
        const p = mk(rTexte, "p", c.accroche)
        p.setAttribute("data-lpws", cle + "-accroche")
        dedans.append(p)
      }
      if (e.gabarit === "colonnes") {
        const grille = mk(ds.grid, "div")
        ;(c.colonnes ?? []).forEach((col, k) => {
          const carte = mk(ds.card, "div")
          const ct = mk(ds.cardTitle, "h3", col.titre)
          ct.setAttribute("data-lpws", `${cle}-t${k + 1}`)
          const cx = mk(ds.cardText, "p", col.texte)
          cx.setAttribute("data-lpws", `${cle}-p${k + 1}`)
          carte.append(ct, cx)
          grille.append(carte)
        })
        dedans.append(grille)
      }
      if (c.cta) {
        const a = mk(rCta, "a", c.cta.label)
        a.setAttribute("href", c.cta.href ?? "#")
        a.setAttribute("data-lpws", cle + "-cta")
        dedans.append(a)
      }
      if (e.before) cible.before(bande); else cible.after(bande)
      journal.push({
        n: i + 1, op, anchor: cle, pourquoi: e.pourquoi,
        quoi: `section ${e.gabarit} créée (${(c.colonnes ?? []).length} colonnes, ton ${e.ton})`,
        ou: (e.before ? "avant " : "après ") + (e.before ?? e.after),
        apres: c.titre,
      })
      return
    }

    const el = get(e.anchor)
    if (!el) { manquantes.push(e.anchor!); return }
    if (e.attendu && !concorde(el, e.attendu)) {
      desaccords.push(`${e.anchor} : attendu ${e.attendu.role} « ${e.attendu.text.slice(0, 40)} »,`
        + ` trouvé ${roleDe(el)} « ${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)} »`)
      return
    }
    const ligne: Entree = { n: i + 1, op, anchor: e.anchor!, quoi: "", pourquoi: e.pourquoi }

    if (op === "remove") {
      const t = el.tagName.toLowerCase()
      ligne.quoi = t === "div" ? "section entière" : t === "img" ? "image" : `<${t}>`
      ligne.avant = court(lire(el)) || `(${ligne.quoi} sans texte)`
      // la position se relève AVANT le retrait : après, l'élément n'est plus mesurable
      ligne.y = Math.round(el.getBoundingClientRect().y + window.scrollY)
      const bande = bandeDe(el)
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
    const a = bandeDe(el)
    if (a) l.section = a
  }
  return { manquantes, desaccords, journal }
}

/**
 * Écrit variant.html (+ variant.mobile.html) dans `outDir` à partir de la baseline.
 * Réseau coupé : on édite un DOM déjà self-contained, rien ne doit partir dehors.
 */
export async function applyEdits(
  baselineDir: string, outDir: string, edits: Edit[],
): Promise<ApplyReport[]> {
  const browser: Browser = await lancerNavigateur()
  const rapports: ApplyReport[] = []
  try {
    for (const [source, cible] of [
      ["capture.html", "variant.html"],
      ["capture.mobile.html", "variant.mobile.html"],
    ] as const) {
      const src = join(baselineDir, source)
      if (!existsSync(src)) continue
      const page = await browser.newPage()
      await neutraliserNom(page)
      await horsLigne(page)
      await page.goto("file://" + resolve(src), { waitUntil: "domcontentloaded", timeout: 60_000 })

      // le design system se récolte sur CE document : la grille du mobile n'est pas celle
      // du desktop, les classes diffèrent
      const bandes = (await page.evaluate(bandesDuRendu)).map((b) => b.anchor)
      const ds = await page.evaluate(harvestDesign, bandes)
      const { manquantes, desaccords, journal } = await page.evaluate(applyInPage, { edits, ds, bandes })
      if (desaccords.length > 0)
        fail(SCOPE,
          `l'ancre ne désigne plus la même chose dans ${source} :\n  ` + desaccords.join("\n  ") +
          `\n  → la page du client a changé depuis la capture. Recapturer, puis re-lier les ancres ` +
          `(npm run relink -- <ancienne> <nouvelle>) avant de rejouer cette variante.`)
      if (manquantes.length > 0)
        throw new Error(
          `ancres introuvables dans ${source} : ${manquantes.join(", ")} — ` +
          "la variante n'est pas applicable sur cette baseline (recapturer ou corriger la spec)")

      await writeFile(join(outDir, cible), await page.evaluate(recopieOmbre).then(() => page.content()))
      await page.close()
      rapports.push({ fichier: cible, appliquees: journal.length, journal, manquesDesign: ds.manques })
      step(SCOPE, `${cible} : ${edits.length} édition(s) → ${journal.length} changement(s)` +
        (ds.manques.length ? ` · design non récolté : ${ds.manques.join(", ")}` : ""))
    }
  } finally {
    await browser.close()
  }
  if (rapports.length === 0) throw new Error(`aucune capture trouvée dans ${baselineDir}`)
  return rapports
}
