import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test } from "../../engine/shared/campagne.ts"
import { jobs } from "./jobs.ts"
import { ROOT, DIST } from "./config.ts"
import { changerEtat, creerTest } from "./pipeline.ts"

process.env.LPWS_SANS_VERCEL = "1"

/* changerEtat travaille dans clients/<c>/<camp> : une campagne jetable y est créée, puis
 * effacée — comme le ferait la suite d'existence d'un vrai client. */
const C = "lptest", CAMP = "search"
const D = join(ROOT, "clients", C, CAMP)
const f = fichiersDe(D)

const ciblageKw = (motCle: string) => ({ intention: "prix" as const, revision: "r1", routes: [{ motCle }] })
const T = (x: Partial<Test>): Test => ({ id: "t", titre: "t", teste: "t", pourquoi: "p", etat: "live", part: 50, creeLe: "2026-10-01T00:00:00Z", edits: [], ...x })

async function fin(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = jobs.get(jobId)
    if (j && j.etat !== "en cours") return j
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error("job jamais fini")
}

before(async () => {
  await mkdir(join(D, "specs"), { recursive: true })
  await mkdir(join(D, "tags", "v"), { recursive: true })
  await ecrireJson(f.meta, { client: C, source: "https://lptest.example/" })
})
after(async () => {
  await rm(join(ROOT, "clients", C), { recursive: true, force: true })
  for (const p of [join(DIST, "t", `${C}.js`), join(DIST, "v", `${C}.json`)]) await rm(p, { force: true })
})

test("déployer un gagnant n'arrête que les tests dont l'audience croise la sienne", async () => {
  await ecrireJson(f.tests, [
    T({ id: "a", ciblage: ciblageKw("chaussures"), experience: "a".repeat(32) }),
    T({ id: "b", ciblage: ciblageKw("[chaussures]"), experience: "b".repeat(32) }),
    T({ id: "c", ciblage: ciblageKw("velos"), experience: "c".repeat(32) }),
  ])
  const job = await changerEtat(C, CAMP, "a", "gagnant", 100)
  const j = await fin(job.id)
  assert.equal(j.etat, "ok", j.lignes.join("\n"))
  const tests = await lireJson<Test[]>(f.tests, [])
  assert.equal(tests.find((t) => t.id === "a")!.etat, "gagnant")
  const b = tests.find((t) => t.id === "b")!
  assert.equal(b.etat, "stop", "l'audience de b croise celle du gagnant")
  assert.equal(b.part, 0)
  assert.ok(b.finLe)
  const c = tests.find((t) => t.id === "c")!
  assert.equal(c.etat, "live", "audience disjointe : le test continue")
  assert.equal(c.part, 50)
})

test("arrêter un gagnant n'efface pas son expérience historique", async () => {
  const exp = "e".repeat(32)
  await ecrireJson(f.tests, [T({ id: "a", etat: "gagnant", part: 100, experience: exp })])
  const job = await changerEtat(C, CAMP, "a", "stop", 0)
  const j = await fin(job.id)
  assert.equal(j.etat, "ok", j.lignes.join("\n"))
  const [t] = await lireJson<Test[]>(f.tests, [])
  assert.equal(t.etat, "stop")
  assert.equal(t.part, 0)
  assert.ok(t.retireLe)
  assert.equal(t.experience, exp, "le lancement déployé garde son identifiant pour la mesure")
})

test("creerTest : ciblage invalide = 400 ; le verrou couvre toute la pipeline de fond", async () => {
  await rm(f.tests, { force: true })
  await assert.rejects(
    creerTest(C, CAMP, { titre: "titre x", pourquoi: "p", edits: [], ciblage: { intention: "prix", revision: "", routes: [] } }),
    (e: any) => e.code === 400,
  )
  const r = await creerTest(C, CAMP, {
    titre: "titre y", pourquoi: "p", edits: [{ anchor: "e1", text: "nouveau" }],
    ciblage: { intention: "prix", revision: "r1", routes: [{ motCle: "chaussures" }] },
  })
  // pendant que la pipeline tourne, une seconde mutation sur la même campagne est refusée
  await assert.rejects(
    creerTest(C, CAMP, { titre: "titre z", pourquoi: "p", edits: [] }),
    (e: any) => e.code === 409,
  )
  const j = await fin(r.job.id)
  assert.equal(j.etat, "échec", "sans baseline, la pipeline échoue franchement")
  const [t] = await lireJson<Test[]>(f.tests, [])
  assert.equal(t.etat, "echec")
  assert.equal(t.ciblage!.intention, "prix")
  // verrou rendu : la campagne est à nouveau mutable
  const r2 = await creerTest(C, CAMP, { titre: "titre w", pourquoi: "p", edits: [] })
  await fin(r2.job.id)
})
