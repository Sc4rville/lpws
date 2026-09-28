import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ecrireJson, lireJson } from "../shared/json.ts"
import { campagne, type Experience, type Test } from "../shared/campagne.ts"
import { aEviter, enregistrerExperiences, historique, marquerDeploye, planAuLancement, retirerExperience } from "./experience.ts"

async function client() {
  const racine = await mkdtemp(join(tmpdir(), "lpws-exp-"))
  const dir = join(racine, "acme", "search")
  await mkdir(join(dir, "specs"), { recursive: true })
  return { racine, clientDir: join(racine, "acme"), dir, f: campagne(dir) }
}

const test_ = (x: Partial<Test>): Test => ({ id: "titre-annonce", titre: "Le titre reprend l’annonce", teste: "t", pourquoi: "p", etat: "stop", part: 50, creeLe: "2026-09-01T00:00:00Z", edits: [], ...x })

test("planAuLancement : l'horizon vient du contexte du buyer", async () => {
  const { racine, dir, f } = await client()
  await ecrireJson(f.contexte, { visiteursMois: 30_000, tauxConversion: 3 })
  const p = await planAuLancement(dir, 0.5)
  assert.equal(p.tauxSuppose, false)
  assert.equal(p.mde, 0.2)
  assert.ok(p.jours! > 20 && p.jours! < 40, String(p.jours))
  await rm(racine, { recursive: true })
})

test("journal : un perdant entre dans la mémoire, et sa règle n'est plus reproposée", async () => {
  const { racine, clientDir, dir, f } = await client()
  await ecrireJson(f.spec("titre-annonce"), { diagnostic: { regle: "mm-titre" } })
  await ecrireJson(f.resultats, { luLe: "2026-09-25T00:00:00Z", source: "exemple", versions: { controle: { n: 15_000, c: 545 }, "titre-annonce": { n: 15_000, c: 450 } } })
  const t = test_({ lanceLe: "2026-09-01T00:00:00Z", finLe: "2026-09-25T00:00:00Z", plan: { tauxBase: 0.03, tauxSuppose: false, mde: 0.2, part: 0.5, controle: 14_000, variante: 14_000, jours: 28 } })
  const [e] = await enregistrerExperiences(dir, [t])
  assert.equal(e.conclusion, "perdant")
  assert.equal(e.regle, "mm-titre")
  assert.ok(e.hausse!.hi < 0)
  // ré-archiver le même lancement met à jour, n'ajoute pas
  await enregistrerExperiences(dir, [t])
  assert.equal((await lireJson<Experience[]>(f.experiences, [])).length, 1)

  await ecrireJson(f.propositions, [{ nom: "x", regle: "pr-preuve", refusee: true, raison: "hors charte" }])
  const m = aEviter(await historique(clientDir))
  assert.match(m.get("mm-titre")!, /l’original a gagné/)
  assert.match(m.get("pr-preuve")!, /hors charte/)
  await rm(racine, { recursive: true })
})

test("journal : arrêté avant l'horizon → trop tôt, pas un faux verdict", async () => {
  const { racine, dir, f } = await client()
  await ecrireJson(f.resultats, { luLe: "2026-09-04T00:00:00Z", versions: { controle: { n: 1500, c: 40 }, "titre-annonce": { n: 1500, c: 62 } } })
  const [e] = await enregistrerExperiences(dir, [test_({ lanceLe: "2026-09-01T00:00:00Z", finLe: "2026-09-04T00:00:00Z" })])
  assert.equal(e.conclusion, "trop tôt")
  await rm(racine, { recursive: true })
})

test("journal : un gagnant déployé reste « déployé » quand l'original est remis", async () => {
  const { racine, dir, f } = await client()
  await ecrireJson(f.resultats, { luLe: "2026-09-28T00:00:00Z", versions: { controle: { n: 15_000, c: 450 }, "titre-annonce": { n: 15_000, c: 545 } } })
  const lance = { lanceLe: "2026-09-01T00:00:00Z", finLe: "2026-09-28T00:00:00Z" }
  const [d] = await enregistrerExperiences(dir, [test_({ ...lance, etat: "gagnant", part: 100 })])
  assert.equal(d.conclusion, "gagnant")
  assert.equal(d.deploye, true)
  const [r] = await enregistrerExperiences(dir, [test_({ ...lance, etat: "stop", part: 0 })])
  assert.equal(r.deploye, true)
  assert.equal((await lireJson<Experience[]>(f.experiences, [])).length, 1)
  await rm(racine, { recursive: true })
})

test("journal : déployer un test déjà arrêté ne relit pas les chiffres ; annuler un arrêt retire la ligne", async () => {
  const { racine, dir, f } = await client()
  await ecrireJson(f.resultats, { luLe: "2026-09-28T00:00:00Z", versions: { controle: { n: 15_000, c: 450 }, "titre-annonce": { n: 15_000, c: 545 } } })
  const t = test_({ lanceLe: "2026-09-01T00:00:00Z", finLe: "2026-09-28T00:00:00Z" })
  await enregistrerExperiences(dir, [t])
  // une mesure plus tard (d'un autre test) change le snapshot
  await ecrireJson(f.resultats, { luLe: "2026-10-05T00:00:00Z", versions: { controle: { n: 30_000, c: 900 }, "titre-annonce": { n: 15_000, c: 545 } } })
  assert.ok(await marquerDeploye(dir, { ...t, etat: "gagnant" }))
  const [e] = await lireJson<Experience[]>(f.experiences, [])
  assert.equal(e.deploye, true)
  assert.equal(e.controle!.n, 15_000, "les chiffres de l'arrêt restent")
  await retirerExperience(dir, t)
  assert.deepEqual(await lireJson<Experience[]>(f.experiences, []), [])
  await rm(racine, { recursive: true })
})
