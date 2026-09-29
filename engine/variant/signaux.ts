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
 * question indépendante avec un type de sortie déclaré (docs/architecture.md, « capteur / raisonnement ») : testable seule,
 * remplaçable seule.
 */
import { bandesDuRendu } from "../clone/1_acquire/mark.ts"
import { lancerNavigateur, nouvellePage, servirDossiers, UA } from "../shared/navigateur.ts"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

export const Cta = z.object({ anchor: z.string(), texte: z.string(), href: z.string(), y: z.number(), auDessusDuPli: z.boolean() })
/** un élément de la page tel qu'un constat peut le citer : son ancre data-lpws et son texte exact */
const Element = z.object({ anchor: z.string().optional(), texte: z.string() })

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
  nav: z.object({ presente: z.boolean(), liens: z.number(), anchor: z.string().optional(), textes: z.array(z.string()) }),
  formulaire: z.object({
    present: z.boolean(), champs: z.number(), obligatoires: z.number(), telephoneObligatoire: z.boolean(), y: z.number().nullable(),
    anchor: z.string().optional(),
    /** le bouton qui envoie le formulaire, et le champ téléphone s'il y en a un */
    bouton: Element.nullable(), telephone: Element.nullable(),
  }),
  preuves: z.object({
    avis: z.object({ presents: z.boolean(), nombre: z.number().nullable(), note: z.number().nullable() }),
    temoignages: z.object({ nombre: z.number(), avecNom: z.number(), avecFonction: z.number(), avecChiffre: z.number() }),
    logos: z.number(),
    compteurZero: z.boolean(),
    /** le texte du compteur à zéro tel que la page l'affiche (« 0 reviews ») */
    compteurZeroExtrait: z.string(), compteurZeroAnchor: z.string().optional(),
  }),
  prix: z.object({ visible: z.boolean(), valeurs: z.array(z.string()) }),
  garantie: z.object({ presente: z.boolean(), extrait: z.string() }),
  objections: z.object({ sectionPresente: z.boolean() }),
  lisibilite: z.object({ mots: z.number(), motsParPhrase: z.number(), motsLongs: z.number() }),
  fonctionnalitesListees: z.number(),
  personnalisationIdentite: z.boolean(),
  sections: z.array(z.object({ anchor: z.string(), y: z.number(), h: z.number(), titre: z.string(), preuve: z.boolean().optional() })),
  /** ce qu'un acheteur cherche avant de payer (Baymard) ; et l'essai sans carte côté SaaS */
  commerce: z.object({
    ajoutPanier: z.object({ present: z.boolean(), anchor: z.string().optional(), texte: z.string(), y: z.number().nullable(), auDessusDuPliMobile: z.boolean() }),
    livraison: z.object({ mentionnee: z.boolean(), gratuite: z.boolean(), extrait: z.string() }),
    retours: z.object({ mentionnes: z.boolean(), extrait: z.string() }),
    paiementFractionne: z.array(z.string()),
    prixBarre: z.object({ present: z.boolean(), referenceMentionnee: z.boolean() }),
    tailles: z.object({ selecteur: z.boolean(), guide: z.boolean() }),
    sansCarte: z.object({ mentionne: z.boolean(), auDessusDuPli: z.boolean(), extrait: z.string(), anchor: z.string().optional() }),
  }),
  /** marqueurs de confiance de paiement lus sur la page (texte, alt, aria), et le tunnel de
   *  paiement lui-même : un prix affiché n'en est pas un, il faut un panier, un passage en
   *  caisse ou des champs de carte. `element` = le premier élément du tunnel trouvé. */
  paiement: z.object({
    marqueurs: z.array(z.string()),
    tunnel: z.object({ panier: z.boolean(), checkout: z.boolean(), champsCarte: z.boolean(), element: Element.nullable() }),
  }),
  /** ce que la page charge pour mesurer : sans aucun tag, aucune conversion ne peut remonter */
  mesure: z.object({ gtm: z.boolean(), gtag: z.boolean(), meta: z.boolean(), autres: z.array(z.string()) }),
  /** LCP médian de la vraie page, en ms ; null si la page n'a pas pu être mesurée */
  vitesse: z.object({ lcpMs: z.number().nullable(), tirs: z.number() }),
})
export type SignauxMecaniques = z.infer<typeof SignauxMecaniques>

const ORIGIN = "http://signaux.lpws"

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
    // un bouton de formulaire est un appel à l'action même quand il dit « Submit » : c'est
    // précisément le libellé générique que sea-cta-generique doit voir
    .filter((c) => {
      if (c.texte.length < 2 || c.texte.length > 60) return false
      const el = document.querySelector(`[data-lpws="${c.anchor}"]`)
      const cls = typeof el?.className === "string" ? el.className : ""
      return verbe.test(c.texte) || /\b(btn|button|cta)/i.test(cls) || el?.tagName === "BUTTON" || el?.getAttribute("role") === "button"
    })
    .map((c) => ({ ...c, auDessusDuPli: c.y < hauteurPli }))

  // le <nav> lui-même d'abord : une liste de sélecteurs rend le premier élément du DOM, donc
  // l'en-tête qui le contient (et le logo avec) — retirer « la navigation » retirait tout l'en-tête
  const nav = document.querySelector("nav[data-lpws]") ?? document.querySelector("header[data-lpws]")
  const navLiens = nav ? nav.querySelectorAll("a").length : 0
  const navTextes = nav ? [...nav.querySelectorAll("a")].map((a) => norme(a.textContent || "")).filter(Boolean).slice(0, 12) : []

  const form = [...document.querySelectorAll("form")].find(visible) ?? null
  const champs = form ? [...form.querySelectorAll("input:not([type=hidden]),select,textarea")] : []
  const obligatoires = champs.filter((c) => (c as HTMLInputElement).required || c.getAttribute("aria-required") === "true")
  const lpws = (e: Element | null | undefined) => e?.getAttribute("data-lpws") || e?.closest("[data-lpws]")?.getAttribute("data-lpws") || undefined
  const libelle = (c: Element) => norme(c.getAttribute("placeholder") || c.getAttribute("aria-label") || c.getAttribute("name") || "")
  const estTel = (c: Element) => /tel|phone|téléphone/i.test((c.getAttribute("type") || "") + (c.getAttribute("name") || "") + (c.getAttribute("placeholder") || "") + (c.getAttribute("aria-label") || ""))
  const champTel = champs.find(estTel)
  const envoi = form ? form.querySelector("button:not([type=button]):not([type=reset]),input[type=submit]") : null
  const telephone = champs.some((c) => /tel|phone|téléphone/i.test((c.getAttribute("type") || "") + (c.getAttribute("name") || "") + (c.getAttribute("placeholder") || "") + (c.getAttribute("aria-label") || "")) && ((c as HTMLInputElement).required || c.getAttribute("aria-required") === "true"))

  // preuves : avis (note / nombre), témoignages (citations avec nom/fonction/chiffre), logos
  const avisTexte = corps.match(/(\d[\d.,]*)\s*(avis|reviews?|ratings?|évaluations?)/i)
  const noteTexte = corps.match(/(\d[.,]\d)\s*(\/\s*5|★|étoiles|stars|sur 5)/i)
  const avisPresents = !!avisTexte || !!noteTexte || !!document.querySelector('[class*="review" i],[class*="rating" i],[class*="trustpilot" i],[aria-label*="star" i]')
  // un conteneur (.quotes, .testimonials) n'est pas un témoignage : seuls comptent les plus profonds
  const temoignagesTous = [...document.querySelectorAll("blockquote,q,[class*='testimonial' i],[class*='quote' i]")].filter(visible)
  const temoignages = temoignagesTous.filter((t) => !temoignagesTous.some((u) => u !== t && t.contains(u)))
  // « Jonas W. » est un nom : les avis e-commerce signent prénom + initiale
  const tNom = temoignages.filter((t) => /\p{Lu}\p{Ll}+ \p{Lu}(\p{Ll}+|\.)/u.test(norme(t.parentElement?.textContent || t.textContent || ""))).length
  const tFonction = temoignages.filter((t) => /(CEO|CTO|CMO|founder|fondat|director|directeur|manager|head of|responsable|VP)/i.test(norme(t.parentElement?.textContent || ""))).length
  const tChiffre = temoignages.filter((t) => /\d+\s?(%|x|€|\$)/.test(norme(t.textContent || ""))).length
  const logosImg = [...document.querySelectorAll('[class*="logo" i] img, [class*="customer" i] img, [class*="trusted" i] img, [class*="client" i] img')].filter(visible).length
  // une bande de logos en texte (wordmarks en <span>) : au moins trois noms courts côte à côte
  const logosTexte = [...document.querySelectorAll('[class*="logos" i],[class*="customers" i],[class*="trusted" i]')]
    .filter((b) => visible(b) && !b.closest("nav,header,footer"))
    .map((b) => [...b.children].filter((k) => visible(k) && !k.querySelector("img,svg") && norme(k.textContent || "").length > 1 && norme(k.textContent || "").length <= 30).length)
    .filter((n) => n >= 3).reduce((a, n) => a + n, 0)
  const logos = logosImg + logosTexte
  const compteurZeroM = corps.match(/\b0\s*(avis|reviews?|partages?|shares?|commentaires?|comments?)\b/i)
  const compteurZero = !!compteurZeroM
  const reZero = /\b0\s*(avis|reviews?|partages?|shares?|commentaires?|comments?)\b/i
  const compteurEl = compteurZeroM ? [...document.querySelectorAll("[data-lpws]")].filter((e) => visible(e) && reZero.test(norme(e.textContent || "")))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0] : undefined

  const prixValeurs = corps.match(/(€\s?\d[\d\s.,]*|\d[\d\s.,]*\s?€|\$\s?\d[\d.,]*|\d[\d.,]*\s?\$)(\s?\/\s?(mois|mo|month|an|year|user|utilisateur))?/gi)?.slice(0, 8) ?? []
  const garantieM = corps.match(/[^.]{0,60}(garantie|satisfait ou remboursé|money[- ]back|remboursement|guarantee|refund|retour gratuit|free returns)[^.]{0,60}/i)
  const objections = /\b(FAQ|questions fréquentes|frequently asked|objections?|pourquoi nous|why us|vous hésitez|still unsure)\b/i.test(corps) || !!document.querySelector('[class*="faq" i],[id*="faq" i]')

  /* ——— commerce : ce qu'un acheteur cherche avant de payer ——— */
  const extrait = (re: RegExp) => norme(corps.match(new RegExp(`[^.!?]{0,60}(?:${re.source})[^.!?]{0,60}`, "i"))?.[0] || "").slice(0, 120)
  const achat = /^(add to (cart|bag|basket)|buy( it)? now|ajouter au panier|acheter( maintenant)?|commander|je commande|in den warenkorb|añadir al carrito)/i
  const boutonAchat = [...document.querySelectorAll("a[data-lpws],button[data-lpws],input[type=submit][data-lpws]")]
    .filter((e) => visible(e) && !e.closest("nav,header,footer"))
    .find((e) => achat.test(norme(e.textContent || (e as HTMLInputElement).value || "")))
  const reLivraison = /livraison|expédition|shipping|delivery|delivered|livré/
  const reGratuite = /livraison (offerte|gratuite)|free (shipping|delivery)|frais de port offerts/
  const reRetours = /retours?( gratuits?| offerts?| sous \d+| possibles?)|return(s| policy| within)|satisfait ou remboursé|money[- ]back|échange gratuit|free exchanges?/
  const fractionne = [...new Set((corps.match(/klarna|alma|afterpay|clearpay|affirm|scalapay|oney|sezzle|pay in [34]|en [34] ?(x|fois)|[34] ?x sans frais|paiement en plusieurs fois|installments?/gi) ?? []).map((x) => x.toLowerCase()))].slice(0, 6)
  const barres = [...document.querySelectorAll('del, s, strike, [class*="compare" i], [class*="strike" i], [class*="was-price" i], [class*="old-price" i], [class*="regular-price" i]')]
    .filter((e) => visible(e) && /\d/.test(e.textContent || ""))
  const reference = /(prix|price)[^.]{0,40}(30|trente|thirty) (derniers )?(jours|days)|lowest price|prix le plus bas|prix de référence|reference price/i.test(corps)
  const selecteurTaille = [...document.querySelectorAll("select, fieldset, [role=radiogroup], [class*='size' i], [class*='taille' i]")]
    .some((e) => visible(e) && /\b(taille|size|pointure)\b/i.test(norme(e.textContent || "") + " " + (e.getAttribute("name") || "") + " " + (e.getAttribute("aria-label") || "")) && /\b(XS|S|M|L|XL|3[4-9]|4[0-6])\b/.test(norme(e.textContent || "")))
  const guideTailles = /guide des tailles|size (guide|chart)|tableau des tailles|guía de tallas/i.test(corps)
  const reSansCarte = /no (credit )?card( required| needed)?|without a (credit )?card|sans (carte( bancaire)?|cb)|aucune carte/i
  const sansCarteEl = [...document.querySelectorAll("p,li,span,small,div")]
    .filter((e) => visible(e) && e.children.length <= 2 && reSansCarte.test(norme(e.textContent || "")) && norme(e.textContent || "").length < 200)
  const commerce = {
    ajoutPanier: { present: !!boutonAchat, anchor: boutonAchat?.getAttribute("data-lpws") || undefined, texte: norme(boutonAchat?.textContent || ""), y: boutonAchat ? y(boutonAchat) : null, auDessusDuPliMobile: false },
    livraison: { mentionnee: reLivraison.test(corps.toLowerCase()), gratuite: reGratuite.test(corps.toLowerCase()), extrait: extrait(reLivraison) },
    retours: { mentionnes: reRetours.test(corps.toLowerCase()), extrait: extrait(reRetours) },
    paiementFractionne: fractionne,
    prixBarre: { present: barres.length > 0, referenceMentionnee: reference },
    tailles: { selecteur: selecteurTaille, guide: guideTailles },
    sansCarte: { mentionne: sansCarteEl.length > 0 || reSansCarte.test(corps), auDessusDuPli: sansCarteEl.some((e) => y(e) < hauteurPli), extrait: norme(sansCarteEl[0]?.textContent || "").slice(0, 120), anchor: lpws(sansCarteEl[0]) },
  }

  const phrases = corps.split(/[.!?]+\s/).filter((p) => p.trim().length > 0)
  const mots = corps.split(/\s+/).filter(Boolean)
  const motsLongs = mots.filter((m) => m.replace(/[^\p{L}]/gu, "").length >= 12).length
  const fonctionnalites = [...document.querySelectorAll('section li, [class*="feature" i] li, [class*="feature" i] h3, [class*="feature" i] h4')].filter(visible).length
  const perso = /\{\s*(company|entreprise|first ?name|prénom)\s*\}|\bBonjour [A-Z][a-z]+\b/i.test(corps)
  const altTexte = [...document.querySelectorAll("img[alt], [aria-label]")].map((e) => e.getAttribute("alt") || e.getAttribute("aria-label") || "").join(" ")
  /* le tunnel de paiement : panier, passage en caisse, champs de carte ; un prix affiché n'en est pas un */
  const reCaisse = /^(checkout|check out|proceed to checkout|place (your )?order|pay now|complete (your )?(order|purchase)|view (your )?(cart|bag|basket)|go to (cart|bag|basket)|passer (la )?commande|valider (ma |la |votre )?commande|finaliser (ma |la |votre )?commande|payer|paiement|voir (le |mon |votre )?panier|mon panier)\b/i
  const actions = [...document.querySelectorAll("a,button,input[type=submit]")].filter(visible)
  const caisse = actions.find((e) => reCaisse.test(norme(e.textContent || (e as HTMLInputElement).value || ""))
    || /\/(checkout|cart|panier|commande|basket)(\/|\?|#|$)/i.test(e.getAttribute("href") || ""))
  const carte = [...document.querySelectorAll("input,iframe")].find((e) => /cc-(number|exp|csc)/i.test(e.getAttribute("autocomplete") || "")
    || /card.?number|cardnumber|num[ée]ro de carte|\bcvc\b|\bcvv\b|cryptogramme/i.test((e.getAttribute("name") || "") + " " + (e.getAttribute("placeholder") || "") + " " + (e.getAttribute("aria-label") || ""))
    || (e.tagName === "IFRAME" && /js\.stripe\.com|checkoutshopper|braintreegateway|checkout\.com|adyen/i.test(e.getAttribute("src") || "")))
  const premierTunnel = carte ?? caisse ?? boutonAchat
  const tunnel = {
    panier: !!boutonAchat || !!caisse && /cart|panier|bag|basket/i.test(norme(caisse.textContent || "") + (caisse.getAttribute("href") || "")),
    checkout: !!caisse, champsCarte: !!carte,
    element: premierTunnel ? { anchor: lpws(premierTunnel), texte: norme(premierTunnel.textContent || (premierTunnel as HTMLInputElement).value || premierTunnel.getAttribute("placeholder") || premierTunnel.getAttribute("aria-label") || "").slice(0, 80) } : null,
  }
  const paiementMarqueurs = [...new Set(((corps + " " + altTexte).match(/paiement s[ée]curis[ée]|secure (?:checkout|payment)|\bssl\b|3-?d ?secure|\bvisa\b|mastercard|paypal|apple pay|google pay|\bstripe\b|chiffr[ée]e?s?|encrypted/gi) ?? []).map((x) => x.toLowerCase()))].slice(0, 8)

  return {
    hero: { titre: norme(h1?.textContent || ""), titreAnchor: h1?.getAttribute("data-lpws") || undefined,
      sousTitre: norme(sousTitre?.textContent || ""), sousTitreAnchor: sousTitre?.getAttribute("data-lpws") || undefined,
      y: h1 ? y(h1) : 0, chiffres: chiffresHero },
    ctas,
    nav: { presente: !!nav, liens: navLiens, anchor: nav?.getAttribute("data-lpws") || undefined, textes: navTextes },
    formulaire: { present: !!form, champs: champs.length, obligatoires: obligatoires.length, telephoneObligatoire: telephone, y: form ? y(form) : null,
      anchor: form?.getAttribute("data-lpws") || undefined,
      bouton: envoi ? { anchor: lpws(envoi), texte: norme(envoi.textContent || (envoi as HTMLInputElement).value || "") } : null,
      telephone: champTel ? { anchor: lpws(champTel), texte: libelle(champTel) } : null },
    preuves: {
      avis: { presents: avisPresents, nombre: avisTexte ? Number(avisTexte[1].replace(/[^\d]/g, "")) || null : null, note: noteTexte ? Number(noteTexte[1].replace(",", ".")) : null },
      temoignages: { nombre: temoignages.length, avecNom: tNom, avecFonction: tFonction, avecChiffre: tChiffre },
      logos, compteurZero, compteurZeroExtrait: compteurZeroM?.[0] ?? "", compteurZeroAnchor: compteurEl?.getAttribute("data-lpws") || undefined,
    },
    prix: { visible: prixValeurs.length > 0, valeurs: prixValeurs.map((p) => p.trim()) },
    garantie: { presente: !!garantieM, extrait: norme(garantieM?.[0] || "").slice(0, 120) },
    objections: { sectionPresente: objections },
    lisibilite: { mots: mots.length, motsParPhrase: phrases.length ? Math.round(mots.length / phrases.length) : 0, motsLongs },
    fonctionnalitesListees: fonctionnalites,
    personnalisationIdentite: perso,
    paiement: { marqueurs: paiementMarqueurs, tunnel },
    commerce,
  }
}

/** Les signaux mécaniques d'une baseline, mesurés aux deux tailles d'écran. */
export async function extraireSignaux(baseline: string): Promise<SignauxMecaniques> {
  const browser = await lancerNavigateur()
  try {
    const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8").catch(() => "{}"))
    // les deux lectures locales et les trois chargements de la vraie page n'ont rien à s'attendre
    const lire = async (fichier: string, viewport: { width: number; height: number }) => {
      const page = await nouvellePage(browser, { viewport })
      await servirDossiers(page, ORIGIN, [baseline])
      await page.goto(`${ORIGIN}/${fichier}`, { waitUntil: "load" })
      await page.waitForTimeout(500)
      const lu = await page.evaluate(lirePage, viewport.height)
      // les bandes de haut niveau selon la MÊME géométrie que le juge : une <section> sémantique
      // porte une ancre e<n>, pas s<n> — un sélecteur sur « s » seul voyait 0 section sur ces pages
      const bandes = await page.evaluate(bandesDuRendu)
      const preuves = await page.evaluate((anchors) => anchors.filter((anchor) =>
        !!document.querySelector(`[data-lpws="${anchor}"]`)?.querySelector('blockquote, [itemprop="review"], [class*="testimonial" i], [class*="review" i]')),
        bandes.map((b) => b.anchor))
      const sections = bandes.map((b) => ({ ...b, titre: b.titre.slice(0, 80), preuve: preuves.includes(b.anchor) }))
      return { ...lu, sections }
    }
    const [d, m, mesure, vitesse] = await Promise.all([
      lire("capture.html", { width: 1440, height: 900 }),
      lire("capture.mobile.html", { width: 390, height: 844 }),
      lireMesure(baseline),
      meta.source ? mesurerVitesse(meta.source) : Promise.resolve({ lcpMs: null, tirs: 0 }),
    ])
    return SignauxMecaniques.parse({
      ...d,
      ctaAuDessusDuPliDesktop: d.ctas.some((c) => c.auDessusDuPli),
      ctaAuDessusDuPliMobile: m.ctas.some((c) => c.auDessusDuPli),
      // le pli qui compte pour l'achat et pour « sans carte » est celui du téléphone
      commerce: {
        ...d.commerce,
        ajoutPanier: { ...d.commerce.ajoutPanier, auDessusDuPliMobile: m.commerce.ajoutPanier.y !== null && m.commerce.ajoutPanier.y < 844 },
        sansCarte: { ...d.commerce.sansCarte, auDessusDuPli: m.commerce.sansCarte.auDessusDuPli },
      },
      mesure, vitesse,
    })
  } finally { await browser.close() }
}

/** Les tags de mesure vus au chargement de la vraie page (resources.json de la capture). */
async function lireMesure(baseline: string): Promise<SignauxMecaniques["mesure"]> {
  const res: { url?: string }[] = JSON.parse(await readFile(join(baseline, "resources.json"), "utf8").catch(() => "[]"))
  const urls = res.map((r) => r.url ?? "")
  const a = (re: RegExp) => urls.some((u) => re.test(u))
  const autres = ["clarity.ms", "hotjar.com", "segment.com", "segment.io", "mixpanel.com", "amplitude.com", "matomo", "plausible.io", "posthog.com", "snap.licdn.com", "ads-twitter.com", "tiktok.com/i18n/pixel", "analytics.tiktok.com"]
    .filter((h) => urls.some((u) => u.includes(h)))
  return { gtm: a(/googletagmanager\.com\/gtm\.js/), gtag: a(/gtag\/js|google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag/), meta: a(/connect\.facebook\.net\/[^/]+\/fbevents\.js/), autres }
}

/** LCP médian sur la vraie page, trois chargements : c'est la vitesse que le visiteur subit, pas celle du clone. */
async function mesurerVitesse(url: string, tirs = 3): Promise<SignauxMecaniques["vitesse"]> {
  const browser = await lancerNavigateur()
  // trois contextes en même temps : trois visiteurs indépendants, un seul temps d'attente
  const tirsFaits = await Promise.all(Array.from({ length: tirs }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA })
    const page = await ctx.newPage()
    let lcp = 0
    try {
      await page.goto(url, { waitUntil: "load", timeout: 45_000 })
      lcp = await page.evaluate(() => new Promise<number>((res) => {
        let v = 0
        const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime })
        po.observe({ type: "largest-contentful-paint", buffered: true })
        setTimeout(() => { po.disconnect(); res(Math.round(v)) }, 2000)
      }))
    } catch { /* page injoignable ce coup-ci : le tir ne compte pas */ }
    await ctx.close()
    return lcp
  }))
  const valeurs = tirsFaits.filter((v) => v > 0)
  await browser.close()
  valeurs.sort((x, y) => x - y)
  return { lcpMs: valeurs.length ? valeurs[Math.floor(valeurs.length / 2)] : null, tirs: valeurs.length }
}
