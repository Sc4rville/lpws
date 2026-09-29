import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test } from "../../engine/shared/campagne.ts"
import { jobs } from "./jobs.ts"
import { ROOT, DIST } from "./config.ts"
import { changerEtat, creerTest } from "./pipeline.ts"

process.env.LPWS_SANS_VERCEL = "1"

let C = "", D = "", f: ReturnType<typeof fichiersDe>
const CAMP = "search"

const ciblageKw = (motCle: string) => ({ intention: "prix" as const, revision: "r1", routes: [{ motCle }] })
const T = (x: Partial<Test>): Test => ({ id: "t", titre: "t", teste: "t", pourquoi: "pour vérifier l’effet", etat: "live", part: 50, creeLe: "2026-10-01T00:00:00Z", edits: [], ...x })

async function fin(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = jobs.get(jobId)
    if (j && j.etat !== "en cours") return j
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error("job jamais fini")
}

before(async () => {
  const dir = await mkdtemp(join(ROOT, "clients", "_test-intents-"))
  C = basename(dir); D = join(dir, CAMP); f = fichiersDe(D)
  await mkdir(join(D, "specs"), { recursive: true })
  await mkdir(join(D, "tags", "v"), { recursive: true })
  await ecrireJson(f.meta, { client: C, source: "https://lptest.example/" })
  await ecrireJson(f.ancres, [{ a: "e1", tag: "p", role: "text", text: "ancien texte" }])
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
  assert.equal(b.etat, "stop")
  assert.equal(b.part, 0)
  assert.ok(b.finLe)
  const c = tests.find((t) => t.id === "c")!
  assert.equal(c.etat, "live")
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
  assert.equal(t.experience, exp)
})

test("lancer un test qui n'est pas prêt est refusé ; part hors 5–95 aussi", async () => {
  await ecrireJson(f.tests, [T({ id: "a", etat: "prep" })])
  await assert.rejects(changerEtat(C, CAMP, "a", "live", 50), (e: any) => e.code === 409)
  await ecrireJson(f.tests, [T({ id: "a", etat: "gagnant" })])
  await assert.rejects(changerEtat(C, CAMP, "a", "live", 50), (e: any) => e.code === 409)
})

test("creerTest : ciblage et entrée invalides = 400 ; le verrou couvre toute la pipeline de fond", async () => {
  await rm(f.tests, { force: true })
  await assert.rejects(
    creerTest(C, CAMP, { titre: "titre x", pourquoi: "pour vérifier l’effet", edits: [], ciblage: { intention: "prix", revision: "", routes: [] } }),
    (e: any) => e.code === 400,
  )
  await assert.rejects(
    creerTest(C, CAMP, { titre: "titre x", pourquoi: "pour vérifier l’effet", edits: [{ anchor: "e999999", text: "x" }] }),
    (e: any) => e.code === 400,
  )
  const r = await creerTest(C, CAMP, {
    titre: "titre y", pourquoi: "pour vérifier l’effet", edits: [{ anchor: "e1", text: "nouveau" }],
    ciblage: { intention: "prix", revision: "r1", routes: [{ motCle: "chaussures" }] },
  })
  await assert.rejects(
    creerTest(C, CAMP, { titre: "titre z", pourquoi: "pour vérifier l’effet", edits: [{ anchor: "e1", text: "x" }] }),
    (e: any) => e.code === 409,
  )
  const j = await fin(r.job.id)
  assert.equal(j.etat, "échec")
  const [t] = await lireJson<Test[]>(f.tests, [])
  assert.equal(t.etat, "echec")
  assert.equal(t.ciblage!.intention, "prix")
  const r2 = await creerTest(C, CAMP, { titre: "titre w", pourquoi: "pour vérifier l’effet", edits: [{ anchor: "e1", text: "x" }] })
  await fin(r2.job.id)
})
