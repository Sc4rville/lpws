import { test } from "node:test"
import assert from "node:assert/strict"
import { diagnostiquer } from "./diagnostic.ts"
import { CITER } from "./citation.ts"
import { REGLES } from "./regles.ts"
import { Contexte, nicheDe } from "./contexte.ts"
import type { SignauxMecaniques } from "./signaux.ts"

/** une page où chaque règle a de quoi citer : tous les capteurs renseignés */
const pleine = (): SignauxMecaniques => ({
  hero: { titre: "Marketing software", titreAnchor: "e11", sousTitre: "All your tools in one place for growing teams", sousTitreAnchor: "e12", y: 900, chiffres: [] },
  ctas: [
    { anchor: "e13", texte: "Get a demo", href: "#", y: 400, auDessusDuPli: true },
    { anchor: "e14", texte: "Learn more", href: "#", y: 420, auDessusDuPli: true },
    { anchor: "e67", texte: "Submit", href: "", y: 2800, auDessusDuPli: false },
  ],
  ctaAuDessusDuPliMobile: false, ctaAuDessusDuPliDesktop: true,
  nav: { presente: true, liens: 7, anchor: "e2", textes: ["Product", "Pricing", "Blog", "Careers", "Login", "Docs", "Contact"] },
  formulaire: { present: true, champs: 8, obligatoires: 6, telephoneObligatoire: true, y: 2600, anchor: "e60",
    bouton: { anchor: "e67", texte: "Submit" }, telephone: { anchor: "e66", texte: "Phone number" } },
  preuves: { avis: { presents: false, nombre: null, note: null }, temoignages: { nombre: 2, avecNom: 0, avecFonction: 0, avecChiffre: 0 }, logos: 0, compteurZero: true, compteurZeroExtrait: "0 reviews", compteurZeroAnchor: "e50" },
  prix: { visible: true, valeurs: ["$19", "$39"] },
  garantie: { presente: false, extrait: "" },
  objections: { sectionPresente: false },
  lisibilite: { mots: 900, motsParPhrase: 26, motsLongs: 40 },
  fonctionnalitesListees: 14,
  personnalisationIdentite: true,
  sections: [{ anchor: "e10", y: 60, h: 500, titre: "Marketing software", preuve: false }, { anchor: "e31", y: 1200, h: 300, titre: "Loved by enterprises", preuve: true }],
  commerce: {
    ajoutPanier: { present: true, anchor: "e23", texte: "Add to cart", y: 1100, auDessusDuPliMobile: false },
    livraison: { mentionnee: false, gratuite: false, extrait: "" },
    retours: { mentionnes: false, extrait: "" },
    paiementFractionne: [],
    prixBarre: { present: true, referenceMentionnee: false },
    tailles: { selecteur: true, guide: false },
    sansCarte: { mentionne: true, auDessusDuPli: false, extrait: "No credit card required", anchor: "e40" },
  },
  paiement: { marqueurs: [], tunnel: { panier: true, checkout: true, champsCarte: false, element: { anchor: "e24", texte: "Checkout" } } },
  mesure: { gtm: false, gtag: false, meta: false, autres: [] },
  vitesse: { lcpMs: 3400, tirs: 3 },
})
const complet = Contexte.parse({
  annonce: { titre: "Grow traffic 2x | Free trial", description: "Start in 5 minutes", motsCles: ["crm", "email marketing", "seo", "ads", "social", "landing pages"] },
  crea: { accroche: "The CRM small teams love" }, vente: "commercial", cible: "small teams", panierMoyen: 6000, visiteursMois: 20000,
})

test("citation : chaque règle cite la page, jamais la phrase générale de regles.json", () => {
  const s = { m: pleine(), j: null }
  for (const r of REGLES) {
    const { signal, elements } = CITER[r.id](s, complet)
    assert.notEqual(signal, r.signal, `${r.id} recopie sa règle`)
    assert.ok(!/undefined|null|NaN|\[object/.test(signal), `${r.id} : ${signal}`)
    assert.ok(elements.every((e) => e.texte.length > 0), `${r.id} cite un élément vide`)
  }
  // les exemples de la base (« logiciel marketing », « Envoyer / En savoir plus / Cliquez ici ») ne passent pas pour un constat
  const d = diagnostiquer(s, complet)
  for (const k of [...d.tests, ...d.conseils, ...d.methode]) {
    assert.ok(!k.signal.includes("logiciel marketing") && !k.signal.includes("Cliquez ici"), `${k.id} : ${k.signal}`)
    assert.equal(k.principe, REGLES.find((r) => r.id === k.id)!.signal)
  }
})

test("citation : un test cite l'ancre data-lpws de ce qu'il demande de changer", () => {
  const d = diagnostiquer({ m: pleine(), j: null }, complet)
  for (const k of d.tests) assert.ok(k.elements?.some((e) => e.anchor), `${k.id} ne cite aucune ancre : ${k.signal}`)
  const generique = d.tests.find((k) => k.id === "sea-cta-generique")!
  assert.match(generique.signal, /« Learn more » \(e14, dans le premier écran\)/)
  assert.match(generique.signal, /« Submit » \(e67, à 2800 px\)/)
  assert.deepEqual(generique.elements!.map((e) => e.anchor), ["e14", "e67"])
})

test("niches : une règle déclenchée hors de ses niches n'est ni un test ni un conseil", () => {
  const m = pleine()
  for (const vente of ["libre-service", "commercial", "achat"] as const) {
    const c = Contexte.parse({ ...complet, vente })
    const d = diagnostiquer({ m, j: null }, c)
    for (const k of [...d.tests, ...d.conseils, ...d.methode])
      assert.ok(REGLES.find((r) => r.id === k.id)!.niches.includes(nicheDe(c)), `${k.id} proposé hors niche en ${vente}`)
    for (const h of d.horsNiche) assert.ok(!h.niches.includes(nicheDe(c)))
  }
  // une niche déclarée prime sur celle que la vente laisse deviner
  const saasDeclare = diagnostiquer({ m, j: null }, Contexte.parse({ ...complet, vente: "achat", niche: "saas" }))
  assert.ok(saasDeclare.horsNiche.some((h) => h.id === "of-livraison-invisible"))
})

test("sécurité de paiement : un prix affiché n'est pas un tunnel de paiement", () => {
  const ecom = Contexte.parse({ annonce: { titre: "Linen overshirt" }, vente: "achat" })
  const m = pleine()
  m.paiement.tunnel = { panier: false, checkout: false, champsCarte: false, element: null }
  // grille tarifaire d'un SaaS, même déclarée ecom : calme, pas un faux constat
  assert.ok(diagnostiquer({ m, j: null }, ecom).calmes.includes("fr-securite-paiement"))
  // un vrai passage en caisse sans repère de sécurité : conseil, qui cite le bouton
  m.paiement.tunnel = { panier: true, checkout: true, champsCarte: false, element: { anchor: "e24", texte: "Checkout" } }
  const k = diagnostiquer({ m, j: null }, ecom).conseils.find((x) => x.id === "fr-securite-paiement")
  assert.ok(k, "attendu dans les conseils")
  assert.match(k.signal, /« Checkout » \(e24\)/)
  // des badges de paiement lus : la règle se tait
  m.paiement.marqueurs = ["visa", "secure checkout"]
  assert.ok(diagnostiquer({ m, j: null }, ecom).calmes.includes("fr-securite-paiement"))
})

test("sécurité de paiement : sur un SaaS, même avec un tunnel, la règle ecom reste hors niche", () => {
  const d = diagnostiquer({ m: pleine(), j: null }, Contexte.parse({ annonce: { titre: "Shared inbox" }, vente: "libre-service" }))
  assert.ok(!d.conseils.some((k) => k.id === "fr-securite-paiement"))
  assert.ok(d.horsNiche.some((h) => h.id === "fr-securite-paiement"))
})

test("rang : 1 = le premier à regarder, stratégiques devant, puis le score le plus haut", () => {
  const d = diagnostiquer({ m: pleine(), j: null }, complet)
  for (const liste of [d.tests, d.conseils, d.methode]) {
    assert.deepEqual(liste.map((k) => k.rang), liste.map((_, i) => i + 1))
    for (let i = 1; i < liste.length; i++) {
      const [a, b] = [liste[i - 1], liste[i]]
      assert.ok(Number(a.strategique) > Number(b.strategique) || (a.strategique === b.strategique && a.score >= b.score), `${a.id} avant ${b.id}`)
    }
  }
})
