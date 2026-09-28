import { test } from "node:test"
import assert from "node:assert/strict"
import { diagnostiquer } from "./diagnostic.ts"
import { Contexte } from "./contexte.ts"
import type { SignauxMecaniques } from "./signaux.ts"

const base = (): SignauxMecaniques => ({
  hero: { titre: "Linen overshirt", titreAnchor: "e11", sousTitre: "Washed European linen", sousTitreAnchor: "e12", y: 120, chiffres: [] },
  ctas: [{ anchor: "e23", texte: "Add to cart", href: "", y: 600, auDessusDuPli: true }],
  ctaAuDessusDuPliMobile: false, ctaAuDessusDuPliDesktop: true,
  nav: { presente: true, liens: 3, anchor: "e2" },
  formulaire: { present: false, champs: 0, obligatoires: 0, telephoneObligatoire: false, y: null },
  preuves: { avis: { presents: true, nombre: 212, note: 4.7 }, temoignages: { nombre: 3, avecNom: 3, avecFonction: 0, avecChiffre: 0 }, logos: 0, compteurZero: false },
  prix: { visible: true, valeurs: ["€89", "€119"] },
  garantie: { presente: false, extrait: "" },
  objections: { sectionPresente: false },
  lisibilite: { mots: 300, motsParPhrase: 12, motsLongs: 2 },
  fonctionnalitesListees: 3,
  personnalisationIdentite: false,
  sections: [],
  commerce: {
    ajoutPanier: { present: true, anchor: "e23", texte: "Add to cart", y: 600, auDessusDuPliMobile: false },
    livraison: { mentionnee: false, gratuite: false, extrait: "" },
    retours: { mentionnes: false, extrait: "" },
    paiementFractionne: [],
    prixBarre: { present: true, referenceMentionnee: false },
    tailles: { selecteur: true, guide: false },
    sansCarte: { mentionne: false, auDessusDuPli: false, extrait: "" },
  },
  paiement: { marqueurs: [] },
  mesure: { gtm: true, gtag: false, meta: false, autres: [] },
  vitesse: { lcpMs: null, tirs: 0 },
})

const ecom = Contexte.parse({ annonce: { titre: "Linen overshirt" }, vente: "achat", panierMoyen: 120 })
const saas = Contexte.parse({ annonce: { titre: "Shared inbox" }, vente: "libre-service" })
const ids = (d: ReturnType<typeof diagnostiquer>) => ({
  tests: d.tests.map((k) => k.id), conseils: d.conseils.map((k) => k.id), nonEvaluables: d.nonEvaluables.map((k) => k.id), calmes: d.calmes,
})

test("page produit : livraison, retours, fractionné, tailles, prix barré, achat sous le pli", () => {
  const d = ids(diagnostiquer({ m: base(), j: null }, ecom))
  for (const r of ["of-livraison-invisible", "of-retours-invisibles", "of-paiement-fractionne", "fr-guide-tailles", "te-prix-barre-sans-reference"])
    assert.ok(d.conseils.includes(r), `${r} attendu dans ${d.conseils.join(", ")}`)
  assert.ok(d.tests.includes("fr-achat-sous-le-pli-mobile"))
  // la règle générique ne double pas la règle d'achat
  assert.ok(!d.tests.includes("sea-cta-pli-mobile"))
})

test("page produit complète : les règles d'achat se taisent", () => {
  const m = base()
  m.commerce = { ...m.commerce,
    ajoutPanier: { ...m.commerce.ajoutPanier, auDessusDuPliMobile: true },
    livraison: { mentionnee: true, gratuite: true, extrait: "Free shipping over €80" },
    retours: { mentionnes: true, extrait: "Free returns within 30 days" },
    paiementFractionne: ["klarna"],
    prixBarre: { present: true, referenceMentionnee: true },
    tailles: { selecteur: true, guide: true } }
  const d = ids(diagnostiquer({ m, j: null }, ecom))
  for (const r of ["of-livraison-invisible", "of-retours-invisibles", "of-paiement-fractionne", "fr-guide-tailles", "te-prix-barre-sans-reference", "fr-achat-sous-le-pli-mobile"])
    assert.ok(d.calmes.includes(r), `${r} devrait être calme`)
})

test("page sans bouton d'achat : les règles d'achat sont calmes, pas « non évaluables »", () => {
  const m = base()
  m.commerce.ajoutPanier = { present: false, texte: "", y: null, auDessusDuPliMobile: false }
  const d = ids(diagnostiquer({ m, j: null }, saas))
  for (const r of ["of-livraison-invisible", "of-retours-invisibles", "of-paiement-fractionne", "fr-achat-sous-le-pli-mobile"])
    assert.ok(d.calmes.includes(r), `${r} : ${JSON.stringify(d)}`)
})

test("panier moyen inconnu : le fractionné est non évaluable", () => {
  const d = ids(diagnostiquer({ m: base(), j: null }, Contexte.parse({ annonce: { titre: "Linen" }, vente: "achat" })))
  assert.ok(d.nonEvaluables.includes("of-paiement-fractionne"))
})

test("essai sans carte : dit plus bas → test ; dit dans le premier écran → calme", () => {
  const m = base()
  m.commerce.ajoutPanier = { present: false, texte: "", y: null, auDessusDuPliMobile: false }
  m.commerce.sansCarte = { mentionne: true, auDessusDuPli: false, extrait: "No credit card required" }
  assert.ok(ids(diagnostiquer({ m, j: null }, saas)).tests.includes("fr-sans-carte-cache"))
  m.commerce.sansCarte.auDessusDuPli = true
  assert.ok(ids(diagnostiquer({ m, j: null }, saas)).calmes.includes("fr-sans-carte-cache"))
})

test("bouton générique : un « Submit » en bas de page suffit, pas seulement le premier bouton", () => {
  const m = base()
  m.ctas = [{ anchor: "e13", texte: "Get a demo", href: "#", y: 400, auDessusDuPli: true }, { anchor: "e67", texte: "Submit", href: "", y: 2800, auDessusDuPli: false }]
  assert.ok(ids(diagnostiquer({ m, j: null }, saas)).tests.includes("sea-cta-generique"))
})
