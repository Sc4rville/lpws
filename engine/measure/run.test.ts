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

const T = (x: Partial<Test> = {}): Test => ({ id: "titre-oriente-benefice", titre: "Titre", teste: "t", pourquoi: "p", etat: "stop", part: 50,
  creeLe: "2026-09-01T00:00:00Z", lanceLe: "2026-09-02T10:00:00Z", finLe: "2026-09-20T10:00:00Z", edits: [], ...x })

/** Un faux GA4 : 1 000 sessions par branche, 30 et `c` conversions selon la fenêtre demandée. */
const ga4 = (c: (depuis: string, jusqua: string) => number) => async (depuis: string, jusqua: string) => [
  { version: "controle", sessions: 1_000, conversions: 30 },
  { version: "titre-oriente-benefice", sessions: 1_000, conversions: c(depuis, jusqua) },
]

test("mesurer : fenêtre par test, et un test arrêté se relit tant que GA4 n'a pas fini de compter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mes-"))
  const f = campagne(dir)
  const t = T()
  await ecrireJson(f.tests, [t])
  await enregistrerExperiences(dir, [t])
  assert.equal((await lireJson<Experience[]>(f.experiences, []))[0].conclusion, "sans données")
  const res = await mesurer(dir, false, ga4(() => 51))
  assert.deepEqual(res.parTest?.[t.id], { depuis: "2026-09-02", jusqua: "2026-09-20", controle: { n: 1_000, c: 30 }, variante: { n: 1_000, c: 51 } })
  const journal = await lireJson<Experience[]>(f.experiences, [])
  assert.equal(journal.length, 1)
  assert.deepEqual(journal[0].variante, { n: 1_000, c: 51 })
  assert.equal(journal[0].arreteLe, t.finLe)
  await rm(dir, { recursive: true })
})

test("mesurer : un arrêt jamais archivé (écriture ratée) entre au journal à la mesure suivante", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mes-"))
  const f = campagne(dir)
  await ecrireJson(f.tests, [T()])
  await mesurer(dir, false, ga4(() => 40))
  const journal = await lireJson<Experience[]>(f.experiences, [])
  assert.equal(journal.length, 1)
  assert.deepEqual(journal[0].variante, { n: 1_000, c: 40 })
  await rm(dir, { recursive: true })
})

test("mesurer : un lancement remplacé par une relance garde sa fenêtre et reçoit ses conversions tardives", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mes-"))
  const f = campagne(dir)
  const ancien = T()
  await ecrireJson(f.tests, [ancien])
  await enregistrerExperiences(dir, [ancien])
  await ecrireJson(f.tests, [T({ etat: "live", lanceLe: "2026-09-21T09:00:00Z", finLe: undefined })])
  const res = await mesurer(dir, false, ga4((d) => d === "2026-09-02" ? 45 : 5))
  assert.equal(res.archives?.[`${ancien.id}@${ancien.lanceLe}`]?.jusqua, "2026-09-20")
  const journal = await lireJson<Experience[]>(f.experiences, [])
  assert.equal(journal.length, 1)
  assert.equal(journal[0].lanceLe, ancien.lanceLe)
  assert.deepEqual(journal[0].variante, { n: 1_000, c: 45 })
  await rm(dir, { recursive: true })
})

test("mesurer --exemple : la réponse rejouée ne touche pas au journal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mes-"))
  const f = campagne(dir)
  const t = T()
  await ecrireJson(f.tests, [t])
  await enregistrerExperiences(dir, [t])
  const avant = await lireJson<Experience[]>(f.experiences, [])
  const res = await mesurer(dir, true)
  assert.deepEqual(res.parTest?.[t.id]?.variante, { n: 1236, c: 51 })
  assert.deepEqual(await lireJson<Experience[]>(f.experiences, []), avant)
  await rm(dir, { recursive: true })
})
