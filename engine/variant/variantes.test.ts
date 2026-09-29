import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { diagnostiquer } from "./diagnostic.ts"
import type { SignauxJuges } from "./jugement.ts"
import { Contexte } from "./contexte.ts"
import { choisirPistes, ecrirePropositions, estMulti, type Refus } from "./variantes.ts"
import type { SignauxMecaniques } from "./signaux.ts"

/* La démo Relay (ui/demo/index.html), telle que signaux.ts la lit. */
const relay = (): SignauxMecaniques => ({
  hero: { titre: "Customer support software for small teams", titreAnchor: "e11", sousTitre: "Relay puts every email, chat and social message in one shared inbox, so your team answers faster without stepping on each other.", sousTitreAnchor: "e12", y: 157, chiffres: [] },
  ctas: [
    { anchor: "e13", texte: "Get a demo", href: "#signup", y: 431, auDessusDuPli: true },
    { anchor: "e14", texte: "See pricing", href: "#pricing", y: 431, auDessusDuPli: true },
    { anchor: "e44", texte: "Start free", href: "#signup", y: 2063, auDessusDuPli: false },
    { anchor: "e67", texte: "Submit", href: "", y: 2951, auDessusDuPli: false },
  ],
  ctaAuDessusDuPliMobile: true, ctaAuDessusDuPliDesktop: true,
  nav: { presente: true, liens: 6, anchor: "e2", textes: ["Relay", "Features", "Pricing", "FAQ", "Log in", "Start free"] },
  formulaire: { present: true, champs: 3, obligatoires: 3, telephoneObligatoire: true, y: 2765, anchor: "e63", bouton: { anchor: "e67", texte: "Submit" }, telephone: { anchor: "e66", texte: "Phone number" } },
  preuves: { avis: { presents: false, nombre: null, note: null }, temoignages: { nombre: 2, avecNom: 2, avecFonction: 2, avecChiffre: 0 }, logos: 5, compteurZero: false, compteurZeroExtrait: "" },
  prix: { visible: true, valeurs: ["$19", "$39", "$79"] },
  garantie: { presente: false, extrait: "" },
  objections: { sectionPresente: true },
  lisibilite: { mots: 322, motsParPhrase: 13, motsLongs: 4 },
  fonctionnalitesListees: 9, personnalisationIdentite: false,
  sections: [{ anchor: "e10", y: 69, h: 536, titre: "Customer support software for small teams", preuve: false }, { anchor: "e31", y: 1280, h: 332, titre: "Teams of three to thirty use Relay", preuve: true }],
  commerce: {
    ajoutPanier: { present: false, texte: "", y: null, auDessusDuPliMobile: false },
    livraison: { mentionnee: false, gratuite: false, extrait: "" }, retours: { mentionnes: false, extrait: "" }, paiementFractionne: [],
    prixBarre: { present: false, referenceMentionnee: false }, tailles: { selecteur: false, guide: false },
    sansCarte: { mentionne: true, auDessusDuPli: true, extrait: "No credit card required. Set up in 10 minutes.", anchor: "e15" },
  },
  paiement: { marqueurs: [], tunnel: { panier: false, checkout: false, champsCarte: false, element: null } },
  mesure: { gtm: false, gtag: false, meta: false, autres: [] },
  vitesse: { lcpMs: 900, tirs: 3 },
})
const ctx = Contexte.parse({
  annonce: { titre: "Shared Inbox for Small Teams | Answer 2x Faster", description: "Every email, chat and DM in one inbox. Free 14-day trial, no card needed.", motsCles: ["shared inbox software", "customer support inbox", "help desk for small teams"] },
  vente: "libre-service", trafic: "google-search",
})

test("Relay : les constats citent le vrai titre et le vrai bouton, pas les exemples de la règle", () => {
  const d = diagnostiquer({ m: relay(), j: null }, ctx)
  const [motCle, generique] = [d.tests.find((k) => k.id === "sea-motcle-titre")!, d.tests.find((k) => k.id === "sea-cta-generique")!]
  assert.match(motCle.signal, /« Customer support software for small teams » \(e11\)/)
  assert.match(generique.signal, /« Submit » \(e67, à 2951 px\)/)
  assert.ok(d.calmes.includes("fr-securite-paiement"), "trois prix affichés, aucun panier : pas de tunnel de paiement")
  assert.deepEqual(d.tests.map((k) => k.rang), [1, 2, 3, 4])
})

test("choisirPistes : une piste par famille, et la mieux classée qui réécrit du texte porte la variante multi-éléments", () => {
  const d = diagnostiquer({ m: relay(), j: null }, ctx)
  const p = choisirPistes(d.tests)
  assert.deepEqual(p.map((x) => x.k.id), ["sea-motcle-titre", "sea-cta-generique", "st-nav-complete"])
  assert.deepEqual(p.map((x) => x.multi), [true, false, false])
  assert.ok(estMulti({ edits: [{ anchor: "e11" }, { anchor: "e13" }] }) && !estMulti({ edits: [{ anchor: "e11" }] }))
})

/* ————— l'écriture, avec un faux `claude` : les réponses sont écrites d'avance, le reste est réel ————— */
let banc = "", campagne = ""
const ANCRES = ["e2", "e10", "e11", "e12", "e13", "e14", "e15", "e31", "e44", "e63", "e66", "e67"]
const PAGE = `<html lang="en"><body><nav data-lpws="e2">Relay Features Pricing FAQ Log in Start free</nav>
<h1 data-lpws="e11">Customer support software for small teams</h1><p data-lpws="e12">Relay puts every email, chat and social message in one shared inbox, so your team answers faster without stepping on each other.</p>
<a data-lpws="e13">Get a demo</a><a data-lpws="e14">See pricing</a><p data-lpws="e15">No credit card required. Set up in 10 minutes.</p>
<a data-lpws="e44">Start free</a><form data-lpws="e63"><input data-lpws="e66" placeholder="Phone number"><button data-lpws="e67">Submit</button></form></body></html>`

beforeEach(async () => {
  banc = await mkdtemp(join(tmpdir(), "lpws-variantes-"))
  campagne = join(banc, "campagne")
  await mkdir(join(campagne, "baseline"), { recursive: true })
  await writeFile(join(campagne, "baseline", "capture.html"), PAGE)
  const texte: Record<string, string> = { e11: "customer support software for small teams", e13: "get a demo", e67: "submit", e2: "relay featurespricingfaqlog in start free" }
  await writeFile(join(campagne, "baseline", "anchors.json"), JSON.stringify(ANCRES.map((a) => ({ a, role: a === "e11" ? "heading" : ["e13", "e14", "e44", "e67"].includes(a) ? "link" : "text", text: texte[a] ?? a }))))
  await writeFile(join(banc, "claude"), `#!/usr/bin/env node
const fs = require("fs"), d = ${JSON.stringify(banc)}
const n = fs.existsSync(d + "/n") ? Number(fs.readFileSync(d + "/n", "utf8")) : 0
fs.writeFileSync(d + "/n", String(n + 1))
let prompt = ""; process.stdin.on("data", (x) => prompt += x).on("end", () => {
  fs.writeFileSync(d + "/prompt" + n + ".txt", prompt)
  const r = JSON.parse(fs.readFileSync(d + "/reponses.json", "utf8"))
  process.stdout.write("Voici les variantes :\\n" + r[Math.min(n, r.length - 1)])
})`)
  await chmod(join(banc, "claude"), 0o755)
  process.env.PATH = `${banc}:${process.env.PATH}`
})
const repondre = (reponses: unknown[]) => writeFile(join(banc, "reponses.json"), JSON.stringify(reponses.map((r) => typeof r === "string" ? r : JSON.stringify(r))))
const prompt = (n: number) => readFile(join(banc, `prompt${n}.txt`), "utf8")
const v = (regle: string, titre: string, edits: Array<Record<string, string>>) =>
  ({ regle, titre, hypothese: "Si la page reprend les mots de la recherche, alors plus de visiteurs essaient, parce qu'ils se reconnaissent.", metrique: "essais démarrés", risque: "aucun", edits: edits.map((e) => ({ op: "set", pourquoi: "même promesse que l'annonce", ...e })) })

const MULTI = v("sea-motcle-titre", "Titre, bouton et formulaire parlent de la boîte partagée", [
  { anchor: "e11", text: "Shared inbox software for small support teams" },
  { anchor: "e13", text: "Start free trial" },
  { anchor: "e67", text: "Start my free trial" },
])

test("écriture : une proposition refusée par les garde-fous est remplacée, pour arriver à trois", async () => {
  await repondre([
    [MULTI, v("sea-cta-generique", "Le bouton dit ce qu'on obtient", [{ anchor: "e67", text: "Get started now!" }]), { ...v("st-nav-complete", "Sans menu", []), edits: [{ anchor: "e2", op: "remove", pourquoi: "moins de sorties" }] }],
    [v("mm-chiffre-annonce", "Le titre reprend le 2x de l'annonce", [{ anchor: "e11", text: "Answer 2x faster with one shared inbox" }])],
  ])
  const d = diagnostiquer({ m: relay(), j: null }, ctx)
  const { variantes, bilan } = await ecrirePropositions(campagne, d.tests, relay(), ctx, "anglais")
  assert.equal(variantes.length, 3)
  assert.deepEqual(variantes.map((x) => x.regle), ["sea-motcle-titre", "mm-chiffre-annonce", "st-nav-complete"], "dans l'ordre des rangs")
  assert.deepEqual(variantes[0].ancres, ["e11", "e13", "e67"])
  assert.match(variantes[0].teste, /le bouton « Submit » devient « Start my free trial »/)
  assert.deepEqual({ ...bilan, tentees: bilan.tentees.length }, { objectif: 3, produites: 3, pistes: 4, tentees: 4, appels: 2, multiElements: true })
  assert.equal((await readdir(join(campagne, "specs"))).length, 3)
  // le premier appel demande la variante multi-éléments, et cite la page ; le second dit ce qui est tombé
  assert.match(await prompt(0), /MULTI-ÉLÉMENTS/)
  assert.match(await prompt(0), /e67 = BOUTON DU FORMULAIRE « Submit »/)
  assert.match(await prompt(0), /Constat sur cette page : .*« Submit » \(e67/)
  assert.match(await prompt(1), /REFUSÉ PAR LES GARDE-FOUS AU TOUR PRÉCÉDENT[\s\S]*point d'exclamation/)
  const refus: Refus[] = JSON.parse(await readFile(join(campagne, "variantes-refusees.json"), "utf8"))
  assert.deepEqual(refus.map((r) => r.regle), ["sea-cta-generique"])
})

test("écriture : trois propositions simples → une version multi-éléments remplace la version simple de la même piste", async () => {
  await repondre([
    [v("sea-motcle-titre", "Le titre dit shared inbox", [{ anchor: "e11", text: "Shared inbox software for small teams" }]),
      v("sea-cta-generique", "Le bouton du formulaire dit ce qu'on obtient", [{ anchor: "e67", text: "Start my free trial" }]),
      { ...v("st-nav-complete", "Sans menu", []), edits: [{ anchor: "e2", op: "remove", pourquoi: "moins de sorties" }] }],
    // les textes déjà retenus sont refusés (« déjà proposé ») : l'autre version en écrit d'autres
    [v("sea-motcle-titre", "Titre, bouton et formulaire parlent de la boîte partagée", [
      { anchor: "e11", text: "The shared inbox for small support teams" },
      { anchor: "e13", text: "Try Relay free" },
      { anchor: "e67", text: "Create my shared inbox" },
    ])],
  ])
  const d = diagnostiquer({ m: relay(), j: null }, ctx)
  const { variantes, bilan } = await ecrirePropositions(campagne, d.tests, relay(), ctx, "anglais")
  assert.deepEqual(variantes.map((x) => [x.regle, x.ancres.length]), [["sea-motcle-titre", 3], ["sea-cta-generique", 1], ["st-nav-complete", 1]])
  assert.equal(bilan.appels, 2)
  assert.equal(bilan.manque, undefined)
  assert.match(await prompt(1), /AUTRE VERSION/)
})

test("écriture : le modèle ne répond jamais au contrat → aucune variante, et la sortie dit pourquoi", async () => {
  await repondre(["pas de JSON ici"])
  const d = diagnostiquer({ m: relay(), j: null }, ctx)
  const { variantes, bilan } = await ecrirePropositions(campagne, d.tests, relay(), ctx, "anglais")
  assert.equal(variantes.length, 0)
  assert.equal(bilan.appels, 3)
  assert.match(bilan.manque!, /^0 proposition sur 3\. 4 pistes testables, 4 tentées en 3 appels au modèle\. 3 appels sans réponse au contrat\.$/)
})

test("écriture : sans piste testable, rien n'est demandé au modèle", async () => {
  const { variantes, bilan } = await ecrirePropositions(campagne, [], relay(), ctx, "anglais")
  assert.equal(variantes.length, 0)
  assert.equal(bilan.appels, 0)
  assert.match(bilan.manque!, /aucune piste testable/)
})

test("écriture : la piste n°1 refusée pour la forme est relancée avec l'erreur, et garde la multi-éléments", async () => {
  // le jugement réel de Relay : le titre nomme une catégorie
  const oui = { valeur: true, confiance: 0.9 }
  const j: SignauxJuges = { promesseDansTitre: oui, titreType: { valeur: "categorie", confiance: 0.9 }, cadreDeReference: oui, niveauLecture: { valeur: "simple", confiance: 0.9 }, objectionsTraitees: oui, preuveAligneeCible: oui, ctaAligneVente: oui, risquePercuEleve: { valeur: false, confiance: 0.9 } }
  const d = diagnostiquer({ m: relay(), j }, ctx)
  assert.equal(d.tests[0].id, "vp-titre-categorie")
  const multi = (titre: string) => v("vp-titre-categorie", titre, [
    { anchor: "e11", text: "Answer customers 2x faster from one shared inbox" },
    { anchor: "e13", text: "Start free trial" },
    { anchor: "e67", text: "Start my free trial" },
  ])
  await repondre([
    [multi("Le titre dit le résultat que l'équipe obtient, repris de l'annonce, avec les deux boutons alignés"),
      v("sea-cta-generique", "Le bouton du formulaire dit ce qu'on obtient", [{ anchor: "e67", text: "Create my shared inbox" }]),
      { ...v("st-nav-complete", "Sans menu", []), edits: [{ anchor: "e2", op: "remove", pourquoi: "moins de sorties" }] }],
    [multi("Le titre promet 2x plus vite, les boutons disent l'essai")],
  ])
  const { variantes, bilan } = await ecrirePropositions(campagne, d.tests, relay(), ctx, "anglais")
  assert.deepEqual(variantes.map((x) => [x.regle, x.ancres.length]), [["vp-titre-categorie", 3], ["sea-cta-generique", 1], ["st-nav-complete", 1]])
  assert.equal(bilan.appels, 2)
  assert.equal(bilan.manque, undefined)
  // la multi-éléments demandée sur la piste n°1 : un résultat, le 2x de l'annonce, les deux boutons
  assert.match(await prompt(0), /\[vp-titre-categorie\][^\n]*\n(?:   [^\n]*\n)*   MULTI-ÉLÉMENTS[^\n]*le titre \(e11\), le bouton principal \(e13\), le bouton du formulaire \(e67\)[^\n]*jamais une catégorie[^\n]*« 2x »/)
  // la relance porte sur cette piste, avec l'erreur exacte, avant toute piste suivante
  const p1 = await prompt(1)
  assert.match(p1, /\[vp-titre-categorie\][\s\S]*MULTI-ÉLÉMENTS[\s\S]*À RÉPARER : [^\n]*hors contrat : [^\n]*titre/)
  assert.doesNotMatch(p1, /\[(sea-motcle-titre|mm-chiffre-annonce|vp-niveau-lecture)\]/)
  const refus: Refus[] = JSON.parse(await readFile(join(campagne, "variantes-refusees.json"), "utf8"))
  assert.deepEqual(refus.map((r) => [r.regle, r.reparable]), [["vp-titre-categorie", true]])
})
