/**
 * signaux.ts — LES YEUX DU BRAIN, partie mécanique : ce qu'on peut COMPTER sur la page sans
 * aucun jugement.
 *
 * Règle des natures : tout ce qui se calcule est un script, ici. Ce qui demande un jugement
 * (« ce titre nomme-t-il une catégorie ou un résultat ? ») vit dans jugement.ts. Les deux
 * produisent le même objet `Signaux`, validé par schéma, mis en cache par capture.
 *
 * La page est rendue dans un vrai Chromium depuis la copie (capture.html), aux deux tailles :
 * « au-dessus du pli » n'a de sens qu'avec une hauteur d'écran. Chaque signal est une
 * question indépendante avec un type de sortie déclaré (cf. ETAT.md) : testable seule,
 * remplaçable seule.
 */
import { chromium, type Page } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

export const Cta = z.object({ anchor: z.string(), texte: z.string(), href: z.string(), y: z.number(), auDessusDuPli: z.boolean() })

export const SignauxMecaniques = z.object({
  hero: z.object({
    titre: z.string(), titreAnchor: z.string().optional(),
    sousTitre: z.string(), sousTitreAnchor: z.string().optional(),
    y: z.number(),
    chiffres: z.array(z.string()),
  }),
  ctas: z.array(Cta),
  ctaAuDessusDuPliMobile: z.boolean(),
  ctaAuDessusDuPliDesktop: z.boolean(),
  nav: z.object({ presente: z.boolean(), liens: z.number(), anchor: z.string().optional() }),
  formulaire: z.object({
    present: z.boolean(), champs: z.number(), obligatoires: z.number(), telephoneObligatoire: z.boolean(), y: z.number().nullable(),
  }),
  preuves: z.object({
    avis: z.object({ presents: z.boolean(), nombre: z.number().nullable(), note: z.number().nullable() }),
    temoignages: z.object({ nombre: z.number(), avecNom: z.number(), avecFonction: z.number(), avecChiffre: z.number() }),
    logos: z.number(),
    compteurZero: z.boolean(),
  }),
  prix: z.object({ visible: z.boolean(), valeurs: z.array(z.string()) }),
  garantie: z.object({ presente: z.boolean(), extrait: z.string() }),
  objections: z.object({ sectionPresente: z.boolean() }),
  lisibilite: z.object({ mots: z.number(), motsParPhrase: z.number(), motsLongs: z.number() }),
  fonctionnalitesListees: z.number(),
  personnalisationIdentite: z.boolean(),
  sections: z.array(z.object({ anchor: z.string(), y: z.number(), h: z.number(), titre: z.string() })),
})
export type SignauxMecaniques = z.infer<typeof SignauxMecaniques>

const ORIGIN = "http://signaux.lpws"
const MIME: Record<string, string> = {
  html: "text/html", css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
}

/** S'exécute DANS la page : ne rien importer ici. */
function lirePage(hauteurPli: number) {
  const norme = (s: string) => (s || "").replace(/\s+/g, " ").trim()
  const y = (el: Element) => Math.round(el.getBoundingClientRect().top + window.scrollY)
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const texteDe = (sel: string) => [...document.querySelectorAll(sel)].filter(visible).map((e) => norme(e.textContent || ""))
  const corps = norme(document.body.innerText || "")

  // le hero : le premier h1 visible HORS navigation (les méga-menus sérialisés sont pleins de h2
  // « visibles » : sur HubSpot et Jira le premier h2 du DOM est un titre de menu), sinon le
  // premier h2 hors navigation ; le sous-titre = le premier p qui suit
  const horsNav = (e: Element) => visible(e) && !e.closest("nav,header,[role=navigation],[role=menu],[aria-hidden=true]")
  const h1 = [...document.querySelectorAll("h1")].find(horsNav) ?? [...document.querySelectorAll("h2")].find(horsNav)
  let sousTitre: Element | null = null
  if (h1) { let n: Element | null = h1; for (let i = 0; i < 12 && n; i++) { n = n.nextElementSibling ?? n.parentElement?.nextElementSibling ?? null; if (n && /^(p|h[2-4])$/i.test(n.tagName) && visible(n) && norme(n.textContent || "").length > 20) { sousTitre = n; break } } }
  const heroTexte = norme(h1?.textContent || "") + " " + norme(sousTitre?.textContent || "")
  const chiffresHero = heroTexte.match(/\d[\d\s.,]*\s?(%|€|\$|x|k|M)?/g)?.map((c) => c.trim()).filter((c) => c.length > 1) ?? []

  // les appels à l'action : boutons et liens qui ressemblent à une action, hors nav/footer
  const verbe = /^(get|start|try|book|buy|shop|add|sign|create|join|request|see|learn|download|subscribe|commencer|essayer|démarrer|acheter|ajouter|réserver|demander|voir|découvrir|s'inscrire|inscription|obtenir|télécharger|commander|contact)/i
  const ctas = [...document.querySelectorAll("a[data-lpws],button[data-lpws]")]
    .filter((e) => visible(e) && !e.closest("nav,header,footer,[role=navigation]"))
    .map((e) => ({ anchor: e.getAttribute("data-lpws")!, texte: norme(e.textContent || ""), href: e.getAttribute("href") || "", y: y(e) }))
    .filter((c) => c.texte.length >= 2 && c.texte.length <= 60 && (verbe.test(c.texte) || /button/i.test((document.querySelector(`[data-lpws="${c.anchor}"]`)?.className) || "")))
    .map((c) => ({ ...c, auDessusDuPli: c.y < hauteurPli }))

  const nav = document.querySelector("nav[data-lpws],header[data-lpws] nav,header[data-lpws]")
  const navLiens = nav ? nav.querySelectorAll("a").length : 0

  const form = [...document.querySelectorAll("form")].find(visible) ?? null
  const champs = form ? [...form.querySelectorAll("input:not([type=hidden]),select,textarea")] : []
  const obligatoires = champs.filter((c) => (c as HTMLInputElement).required || c.getAttribute("aria-required") === "true")
  const telephone = champs.some((c) => /tel|phone|téléphone/i.test((c.getAttribute("type") || "") + (c.getAttribute("name") || "") + (c.getAttribute("placeholder") || "") + (c.getAttribute("aria-label") || "")) && ((c as HTMLInputElement).required || c.getAttribute("aria-required") === "true"))

  // preuves : avis (note / nombre), témoignages (citations avec nom/fonction/chiffre), logos
  const avisTexte = corps.match(/(\d[\d.,]*)\s*(avis|reviews?|ratings?|évaluations?)/i)
  const noteTexte = corps.match(/(\d[.,]\d)\s*(\/\s*5|★|étoiles|stars|sur 5)/i)
  const avisPresents = !!avisTexte || !!noteTexte || !!document.querySelector('[class*="review" i],[class*="rating" i],[class*="trustpilot" i],[aria-label*="star" i]')
  const temoignages = [...document.querySelectorAll("blockquote,q,[class*='testimonial' i],[class*='quote' i]")].filter(visible)
  const tNom = temoignages.filter((t) => /[A-Z][a-zé]+ [A-Z][a-zé]+/.test(norme(t.parentElement?.textContent || t.textContent || ""))).length
  const tFonction = temoignages.filter((t) => /(CEO|CTO|CMO|founder|fondat|director|directeur|manager|head of|responsable|VP)/i.test(norme(t.parentElement?.textContent || ""))).length
  const tChiffre = temoignages.filter((t) => /\d+\s?(%|x|€|\$)/.test(norme(t.textContent || ""))).length
  const logos = [...document.querySelectorAll('[class*="logo" i] img, [class*="customer" i] img, [class*="trusted" i] img, [class*="client" i] img')].filter(visible).length
  const compteurZero = /\b0\s*(avis|reviews?|partages?|shares?|commentaires?|comments?)\b/i.test(corps)

  const prixValeurs = corps.match(/(€\s?\d[\d\s.,]*|\d[\d\s.,]*\s?€|\$\s?\d[\d.,]*|\d[\d.,]*\s?\$)(\s?\/\s?(mois|mo|month|an|year|user|utilisateur))?/gi)?.slice(0, 8) ?? []
  const garantieM = corps.match(/[^.]{0,60}(garantie|satisfait ou remboursé|money[- ]back|remboursement|guarantee|refund|retour gratuit|free returns)[^.]{0,60}/i)
  const objections = /\b(FAQ|questions fréquentes|frequently asked|objections?|pourquoi nous|why us|vous hésitez|still unsure)\b/i.test(corps) || !!document.querySelector('[class*="faq" i],[id*="faq" i]')

  const phrases = corps.split(/[.!?]+\s/).filter((p) => p.trim().length > 0)
  const mots = corps.split(/\s+/).filter(Boolean)
  const motsLongs = mots.filter((m) => m.replace(/[^\p{L}]/gu, "").length >= 12).length
  const fonctionnalites = [...document.querySelectorAll('section li, [class*="feature" i] li, [class*="feature" i] h3, [class*="feature" i] h4')].filter(visible).length
  const perso = /\{\s*(company|entreprise|first ?name|prénom)\s*\}|\bBonjour [A-Z][a-z]+\b/i.test(corps)

  const sections = [...document.querySelectorAll('[data-lpws^="s"]')].map((s) => {
    const r = s.getBoundingClientRect()
    const titre = norme(s.querySelector("h1,h2,h3")?.textContent || "").slice(0, 80)
    return { anchor: s.getAttribute("data-lpws")!, y: Math.round(r.top + window.scrollY), h: Math.round(r.height), titre }
  })

  return {
    hero: { titre: norme(h1?.textContent || ""), titreAnchor: h1?.getAttribute("data-lpws") || undefined,
      sousTitre: norme(sousTitre?.textContent || ""), sousTitreAnchor: sousTitre?.getAttribute("data-lpws") || undefined,
      y: h1 ? y(h1) : 0, chiffres: chiffresHero },
    ctas,
    nav: { presente: !!nav, liens: navLiens, anchor: nav?.getAttribute("data-lpws") || undefined },
    formulaire: { present: !!form, champs: champs.length, obligatoires: obligatoires.length, telephoneObligatoire: telephone, y: form ? y(form) : null },
    preuves: {
      avis: { presents: avisPresents, nombre: avisTexte ? Number(avisTexte[1].replace(/[^\d]/g, "")) || null : null, note: noteTexte ? Number(noteTexte[1].replace(",", ".")) : null },
      temoignages: { nombre: temoignages.length, avecNom: tNom, avecFonction: tFonction, avecChiffre: tChiffre },
      logos, compteurZero,
    },
    prix: { visible: prixValeurs.length > 0, valeurs: prixValeurs.map((p) => p.trim()) },
    garantie: { presente: !!garantieM, extrait: norme(garantieM?.[0] || "").slice(0, 120) },
    objections: { sectionPresente: objections },
    lisibilite: { mots: mots.length, motsParPhrase: phrases.length ? Math.round(mots.length / phrases.length) : 0, motsLongs },
    fonctionnalitesListees: fonctionnalites,
    personnalisationIdentite: perso,
    sections,
  }
}

async function servir(page: Page, baseline: string) {
  await page.addInitScript({ content: "window.__name = (f) => f" })
  await page.route(`${ORIGIN}/**`, async (route) => {
    const chemin = decodeURIComponent(new URL(route.request().url()).pathname)
    try {
      if (chemin.includes("..")) throw new Error("hors du dossier")
      const body = await readFile(join(baseline, "." + chemin))
      const ext = chemin.split(".").pop()?.toLowerCase() ?? ""
      await route.fulfill({ body, contentType: MIME[ext] ?? "application/octet-stream" })
    } catch { await route.fulfill({ status: 404, body: "" }) }
  })
}

/** Les signaux mécaniques d'une baseline, mesurés aux deux tailles d'écran. */
export async function extraireSignaux(baseline: string): Promise<SignauxMecaniques> {
  const browser = await chromium.launch()
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await servir(desktop, baseline)
    await desktop.goto(`${ORIGIN}/capture.html`, { waitUntil: "load" })
    await desktop.waitForTimeout(500)
    const d = await desktop.evaluate(lirePage, 900)

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await servir(mobile, baseline)
    await mobile.goto(`${ORIGIN}/capture.mobile.html`, { waitUntil: "load" })
    await mobile.waitForTimeout(500)
    const m = await mobile.evaluate(lirePage, 844)

    return SignauxMecaniques.parse({
      ...d,
      ctaAuDessusDuPliDesktop: d.ctas.some((c) => c.auDessusDuPli),
      ctaAuDessusDuPliMobile: m.ctas.some((c) => c.auDessusDuPli),
    })
  } finally { await browser.close() }
}
