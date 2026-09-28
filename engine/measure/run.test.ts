import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ecrireJson, lireJson } from "../shared/json.ts"
import { campagne, type Experience, type Test } from "../shared/campagne.ts"
import { lireRapport } from "./ga4.ts"
import { mesurer, type Resultats } from "./run.ts"
import { comptes, enregistrerExperiences } from "./experience.ts"

test("lireRapport : une conversion est une session qui a converti, jamais plus que les sessions", () => {
  const brut = { rows: [
    { dimensionValues: [{ value: "controle" }], metricValues: [{ value: "100" }, { value: "0.25" }] },
    { dimensionValues: [{ value: "v" }], metricValues: [{ value: "100" }, { value: "1.7" }] },
  ] }
  assert.deepEqual(lireRapport(brut).map((l) => [l.version, l.sessions, l.conversions]), [["controle", 100, 25], ["v", 100, 100]])
})

test("comptes : la fenêtre du test d'abord, le cumul sinon", () => {
  const res: Resultats = { luLe: "", depuis: "", source: "exemple", versions: { controle: { n: 10_000, c: 300 }, b: { n: 1_000, c: 40 } },
    parTest: { b: { depuis: "2026-09-20", jusqua: "2026-09-27", controle: { n: 1_000, c: 30 }, variante: { n: 1_000, c: 40 } } } }
  assert.deepEqual(comptes(res, "b").o, { n: 1_000, c: 30 })
  assert.deepEqual(comptes(res, "a").o, { n: 10_000, c: 300 })
})

test("mesurer : fenêtre par test, et un test arrêté se relit tant que GA4 n'a pas fini de compter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mes-"))
  const f = campagne(dir)
  const t: Test = { id: "titre-oriente-benefice", titre: "Titre", teste: "t", pourquoi: "p", etat: "stop", part: 50,
    creeLe: "2026-09-01T00:00:00Z", lanceLe: "2026-09-02T10:00:00Z", finLe: "2026-09-20T10:00:00Z", edits: [] }
  await ecrireJson(f.tests, [t])
  await enregistrerExperiences(dir, [t])
  assert.equal((await lireJson<Experience[]>(f.experiences, []))[0].conclusion, "sans données")
  const res = await mesurer(dir, true)
  assert.deepEqual(res.parTest?.[t.id], { depuis: "2026-09-02", jusqua: "2026-09-20", controle: { n: 1240, c: 38 }, variante: { n: 1236, c: 51 } })
  const journal = await lireJson<Experience[]>(f.experiences, [])
  assert.equal(journal.length, 1)
  assert.deepEqual(journal[0].variante, { n: 1236, c: 51 })
  assert.equal(journal[0].arreteLe, t.finLe)
  await rm(dir, { recursive: true })
})
