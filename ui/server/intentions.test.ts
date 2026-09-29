import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { ecrireJson, lireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe } from "../../engine/shared/campagne.ts"
import { ROOT } from "./config.ts"
import { etatIntentions, importerIntentions, deciderIntentions, connecter, authentifierSync, synchroniserCorps, simuler, propositionIntentions, publicDisponible } from "./intentions.ts"

let C = "", D = "", f: ReturnType<typeof fichiersDe>, JETON = ""
const CAMP = "search"
const EXEMPLE = join(ROOT, "engine/intent/exemple.csv")
const b64 = async () => (await readFile(EXEMPLE)).toString("base64")

before(async () => {
  const dir = await mkdtemp(join(ROOT, "clients", "_test-intents-"))
  C = basename(dir); D = join(dir, CAMP); f = fichiersDe(D)
  await mkdir(D, { recursive: true })
  await ecrireJson(f.meta, { client: C, source: "https://lptest.example/" })
  process.env.LPWS_URL_PUBLIQUE = "https://lpws.example.com"
  process.env.LPWS_MOT_DE_PASSE = "test"
})
after(async () => {
  await rm(join(ROOT, "clients", C), { recursive: true, force: true })
  delete process.env.LPWS_URL_PUBLIQUE
  delete process.env.LPWS_MOT_DE_PASSE
})

test("import : le CSV exemple produit un état, un CSV invalide préserve l'existant", async () => {
  const r = await importerIntentions(C, CAMP, { nom: "exemple.csv", base64: await b64(), marques: ["jira"] })
  assert.ok(r.analyse && r.analyse.routes.length > 0)
  for (const x of Object.values<any>(r.analyse!.parIntention ?? {})) {
    assert.equal(typeof x.clics, "number")
    assert.equal(typeof x.conversions, "number")
    assert.equal(typeof x.routes, "number")
  }
  const avant = await readFile(f.intents, "utf8")
  await assert.rejects(importerIntentions(C, CAMP, { nom: "x", base64: Buffer.from("pas un csv").toString("base64"), marques: [] }))
  assert.equal(await readFile(f.intents, "utf8"), avant)
  assert.equal((r as any).connexion.compte, undefined)
  assert.ok(!(JSON.stringify(r).includes('"hachage"')))
})

test("décisions : révision périmée = 409, route inconnue = 400, décision valide persiste", async () => {
  const st = await etatIntentions(C, CAMP)
  const a = st.analyse!
  await assert.rejects(deciderIntentions(C, CAMP, { revision: "0".repeat(32), decisions: {} }), (e: any) => e.code === 409)
  await assert.rejects(deciderIntentions(C, CAMP, { revision: a.revision, decisions: { ["f".repeat(24)]: "prix" } }), (e: any) => e.code === 400)
  const route = a.routes.find(r => r.clics > 0)!
  const r2 = await deciderIntentions(C, CAMP, { revision: a.revision, decisions: { [route.id]: "alternative" } })
  assert.equal(r2.analyse!.routes.find(x => x.id === route.id)!.intention, "alternative")
  const r3 = await deciderIntentions(C, CAMP, { revision: r2.analyse!.revision, decisions: { [route.id]: null } })
  assert.equal(r3.analyse!.routes.find(x => x.id === route.id)!.intention, null)
})

test("connexion : jeton jamais stocké, script rendu une fois, HTTPS + mot de passe exigés", async () => {
  const r = await connecter(C, CAMP, { compte: "1234567890", campagnes: ["111", "222"] })
  assert.match(r.script, /AdsApp\.search/)
  const jeton = r.script.match(/LPWS_JETON = "([a-f0-9]{64})"/)![1]
  JETON = jeton
  const conn = await lireJson<any>(f.intentsConnexion, null)
  assert.ok(conn.hachage && conn.hachage !== jeton && /^[a-f0-9]{64}$/.test(conn.hachage))
  assert.ok(!JSON.stringify(conn).includes(jeton))
  const st = await etatIntentions(C, CAMP)
  assert.equal(st.connexion.configure, true)
  assert.equal(st.connexion.compte, "1234567890")
  assert.ok(!JSON.stringify(st.connexion).includes("hachage"))
})

test("sync : mauvais jeton 401, mauvais compte rejeté sans mutation, campagne non permise rejetée", async () => {
  await assert.rejects(authentifierSync(C, CAMP, "mauvais"), (e: any) => e.code === 401)
  await assert.rejects(authentifierSync(C, CAMP, undefined), (e: any) => e.code === 401)
  await assert.rejects(authentifierSync("../", CAMP, "x"), (e: any) => e.code === 404)
  const charge = (over: Record<string, unknown> = {}, termes: unknown[] = [{ terme: "t", motCle: "t", campagneId: "111", groupeId: "9", impressions: 10, clics: 3, cout: 1, conversions: 0 }]) =>
    Buffer.from(JSON.stringify({ source: { fichier: "s.json", format: "csv-script", langue: "en", compte: "1234567890", ...over }, importeLe: new Date().toISOString(), termes, ignorees: 0 }))
  await assert.rejects(synchroniserCorps(C, CAMP, charge({ compte: "9999999999" }), JETON), (e: any) => e.code === 400)
  await assert.rejects(synchroniserCorps(C, CAMP, charge({}, [{ terme: "t", motCle: "t", campagneId: "333", groupeId: "9", impressions: 1, clics: 1, cout: 0, conversions: 0 }]), JETON), (e: any) => e.code === 400)
  await assert.rejects(synchroniserCorps(C, CAMP, charge({}, [{ terme: "t", motCle: "t", campagneId: "111", impressions: 1, clics: 1, cout: 0, conversions: 0 }]), JETON), (e: any) => e.code === 400)
  const avant = await readFile(f.intents, "utf8")
  assert.equal(await readFile(f.intents, "utf8"), avant)
})

test("sync valide écrit l'état, puis la minute suivante est refusée 429", async () => {
  const r = await synchroniserCorps(C, CAMP, Buffer.from(JSON.stringify({
    source: { fichier: "s.json", format: "csv-script", langue: "en", compte: "1234567890", devise: "USD" },
    importeLe: new Date().toISOString(), ignorees: 0,
    termes: [{ terme: "chaussures", motCle: "chaussures", campagneId: "111", groupeId: "9", impressions: 10, clics: 4, cout: 2, conversions: 1 }],
  })), JETON)
  assert.deepEqual(r, { ok: true })
  const st = await etatIntentions(C, CAMP)
  assert.ok(st.connexion.derniereSync)
  assert.equal(st.analyse!.source.devise, "USD")
  await assert.rejects(synchroniserCorps(C, CAMP, Buffer.from("{}"), JETON), (e: any) => e.code === 429)
  await assert.rejects(synchroniserCorps(C, CAMP, Buffer.from("{}"), "ancien-jeton-rotatif"), (e: any) => e.code === 401)
})

test("simuler : clic routé par mot-clé acheté, page inconnue → original", async () => {
  const st = await etatIntentions(C, CAMP)
  const kw = st.analyse!.routes.find(r => r.intention)?.motCle ?? "chaussures"
  const r = await simuler(C, CAMP, { url: `https://lptest.example/?lpws_kw=${encodeURIComponent(kw)}` })
  assert.equal(r.projection, true)
  assert.equal(r.nom, st.analyse!.routes.find(r2 => r2.motCle === kw)!.intention)
  const hors = await simuler(C, CAMP, { url: "https://autre.example/?lpws_kw=" + encodeURIComponent(kw) })
  assert.equal(hors.nom, null)
  assert.equal(hors.motif, "page hors test")
})

test("proposition : nom inconnu → 404, jamais de chemin libre", async () => {
  await assert.rejects(propositionIntentions(C, CAMP, "../secret"), (e: any) => e.code === 404)
})

test("connexion refusée sans instance publique", async () => {
  delete process.env.LPWS_URL_PUBLIQUE
  await assert.rejects(connecter(C, CAMP, { compte: "1234567890", campagnes: ["1"] }), (e: any) => e.code === 409)
  process.env.LPWS_URL_PUBLIQUE = "https://lpws.example.com"
})

test("rotation du jeton : l’ancien est révoqué, le nouveau seul fonctionne", async () => {
  const vieux = JETON
  const r = await connecter(C, CAMP, { compte: "1234567890", campagnes: ["111", "222"] })
  JETON = r.script.match(/LPWS_JETON = "([a-f0-9]{64})"/)![1]
  assert.notEqual(JETON, vieux)
  await assert.rejects(synchroniserCorps(C, CAMP, Buffer.from("{}"), vieux), (e: any) => e.code === 401)
  await assert.rejects(synchroniserCorps(C, CAMP, Buffer.from(JSON.stringify({
    source: { fichier: "s.json", format: "csv-script", langue: "en", compte: "1234567890" },
    importeLe: new Date().toISOString(), ignorees: 0, termes: [],
  })), JETON), (e: any) => e.code === 429)
})

test("publicDisponible : domaines fc/fd légitimes et IPv4 publics acceptés, privés refusés", async () => {
  const orig = process.env.LPWS_URL_PUBLIQUE
  const cas: [string, boolean][] = [
    ["https://lpws.example.com", true], ["https://fd-exemple.fr", true], ["https://fc.example.net", true],
    ["https://8.8.8.8", true], ["https://192.168.1.1", false], ["https://10.0.0.1", false],
    ["https://127.0.0.1", false], ["https://localhost", false], ["https://app.localhost", false],
    ["https://[::1]", false], ["https://[fe80::1]", false], ["https://[fd00::1]", false],
    ["http://lpws.example.com", false], ["https://u:p@lpws.example.com", false], ["https://lpws.example.com/?x=1", false],
  ]
  for (const [u, attendu] of cas) {
    process.env.LPWS_URL_PUBLIQUE = u
    assert.equal(publicDisponible(), attendu, u)
  }
  process.env.LPWS_URL_PUBLIQUE = orig
})
