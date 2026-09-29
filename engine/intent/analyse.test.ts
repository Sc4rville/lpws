import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { creerEtat, analyser, ciblagePour } from "./analyse.ts"
import { importerBuffer } from "./import.ts"
import { scriptGoogleAds } from "./google-script.ts"
import { type Terme } from "./schema.ts"

const ligne = (plus: Partial<Terme>): Terme => ({
  terme: "logiciel prix", motCle: "logiciel prix", campagneId: "12", groupeId: "34",
  correspondance: "exact", clics: 10, impressions: 100, cout: 2.5, conversions: 1, ...plus,
})
const rapport = (termes: Terme[]) => ({
  source: { fichier: "synthese.csv", format: "csv-script", langue: "en" },
  importeLe: "2026-09-28T00:00:00.000Z", termes, ignorees: 0,
})

test("analyse : clics exacts, périmètres séparés, zéro clic sans influence", () => {
  const etat = creerEtat(rapport([
    ligne({}), ligne({ terme: "logiciel tarif", clics: 20, conversions: 0.5 }),
    ligne({ terme: "logiciel tutorial", clics: 0 }),
    ligne({ campagneId: "99", terme: "logiciel alternative", clics: 5 }),
  ]))
  const a = analyser(etat)
  assert.equal(a.clics, 35)
  assert.equal(a.routables, 35)
  assert.equal(a.couverture, 1)
  assert.deepEqual(a.routes.map((r) => [r.campagneId, r.intention, r.clics, r.conversions]), [
    ["12", "prix", 30, 2.5], ["99", "alternative", 5, 1],
  ])
  assert.equal(ciblagePour(etat, "prix").routes.length, 1)
})

test("analyse : majorité n'est pas certitude, mélange et identifiants absents à confirmer", () => {
  const etat = creerEtat(rapport([
    ligne({ clics: 90 }), ligne({ terme: "logiciel guide", clics: 10 }),
    ligne({ motCle: "autre prix", campagneId: undefined, groupeId: undefined, clics: 30 }),
    ligne({ motCle: undefined, clics: 20 }),
  ]))
  const a = analyser(etat)
  assert.equal(a.clics, 150)
  assert.equal(a.routables, 0)
  assert.equal(a.routes[0].suggestion, "prix")
  assert.equal(a.routes[0].intention, null)
  assert.throws(() => ciblagePour(etat, "prix"), /Aucun mot-clé/)
  etat.decisions[a.routes[0].id] = "information"
  const b = analyser(etat)
  assert.equal(b.routables, 100)
  assert.equal(b.couverture, 100 / 150)
  assert.equal(b.routes[0].intention, "information")
  assert.notEqual(a.revision, b.revision)
})

test("analyse : exclusion, classe inconnue, navigation et zéro clic restent sur l'original", () => {
  const etat = creerEtat(rapport([
    ligne({ terme: "acme login", motCle: "acme" }),
    ligne({ terme: "outillage abstrait", motCle: "outillage" }),
    ligne({ motCle: "prix sans clics", clics: 0 }),
  ]), ["acme"])
  const a = analyser(etat)
  assert.ok(a.routes.every((r) => r.intention === null))
  for (const r of a.routes) etat.decisions[r.id] = r.clics ? null : "prix"
  assert.equal(analyser(etat).routables, 0)
  assert.equal(analyser(creerEtat(rapport([ligne({ clics: 0 })]))).couverture, null)
})

test("import : FR, UTF16, GAQL, devises numériques et colonnes absentes", async () => {
  const buf = await readFile(new URL("./exemple.csv", import.meta.url))
  const fr = importerBuffer(buf)
  assert.equal(fr.termes[0].clics, 312)
  assert.equal(fr.termes[0].cout, 733.2)
  const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from(buf.toString("utf8"), "utf16le")])
  assert.deepEqual(importerBuffer(utf16).termes, fr.termes)
  const headers = "search_term_view.search_term,segments.keyword.info.text,campaign.id,ad_group.id,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions\n"
  const script = importerBuffer(Buffer.from(headers + "total software pricing,software pricing,12,34,200,20,1500000,2.5"))
  assert.equal(script.termes[0].cout, 1.5)
  assert.equal(script.termes[0].groupeId, "34")
  assert.equal(script.termes[0].conversions, 2.5)
  assert.throws(() => importerBuffer(Buffer.from(headers + "x,x,12,34,200,bad,1500000,2")), /numérique/)
  assert.throws(() => importerBuffer(Buffer.from("Search term,Clicks\nprix,2")), /Colonne manquante/)
})

test("script Google Ads : périmètre Search explicite, IDs conservés, pas de mutation Ads", () => {
  const script = scriptGoogleAds({ endpoint: "https://example.com/api/intents/acme/page/sync", jeton: "a".repeat(64), compte: "1234567890", campagnes: ["12", "34"] })
  assert.match(script, /campaign\.id IN \(12,34\)/)
  assert.match(script, /advertising_channel_type = 'SEARCH'/)
  assert.match(script, /segments\.date DURING LAST_30_DAYS/)
  assert.match(script, /followRedirects: false/)
  assert.match(script, /LIMIT 20001/)
  assert.doesNotMatch(script, /setFinalUrl|setTrackingTemplate|mutate|setBudget/)
  assert.throws(() => scriptGoogleAds({ endpoint: "http://localhost:4700/sync", jeton: "a".repeat(64), compte: "1234567890", campagnes: ["12"] }), /HTTPS/)
  assert.throws(() => scriptGoogleAds({ endpoint: "https://example.com/sync", jeton: "a".repeat(64), compte: "1234567890", campagnes: ["12 OR true"] }), /campagne/)
})
