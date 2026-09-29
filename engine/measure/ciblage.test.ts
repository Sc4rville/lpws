import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateKeyPairSync } from "node:crypto"
import { mesurer } from "./run.ts"
import { comptes, planAuLancement } from "./experience.ts"
import { lireRapport, rapportParVersion } from "./ga4.ts"
import { campagne, type Test } from "../shared/campagne.ts"
import { ecrireJson } from "../shared/json.ts"

test("mesure : deux intentions le même jour ont chacune leur témoin et leur lancement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-mesure-intents-"))
  try {
    const f = campagne(dir)
    const commun = { titre: "Titre", teste: "test", pourquoi: "raison", etat: "live" as const, part: 50, creeLe: "2026-09-28T00:00:00Z", lanceLe: "2026-09-28T00:00:00Z", edits: [] }
    const tests: Test[] = [
      { ...commun, id: "prix", experience: "a".repeat(32), ciblage: { intention: "prix", revision: "r", routes: [{ motCle: "prix" }] } },
      { ...commun, id: "alternative", experience: "b".repeat(32), ciblage: { intention: "alternative", revision: "r", routes: [{ motCle: "alternative" }] } },
    ]
    await ecrireJson(f.tests, tests)
    const appels: Array<string | undefined> = []
    const res = await mesurer(dir, false, async (_d, _j, exp) => {
      appels.push(exp)
      return exp === tests[0].experience
        ? [{ version: "controle", sessions: 100, conversions: 3 }, { version: "prix", sessions: 110, conversions: 4 }]
        : exp === tests[1].experience
          ? [{ version: "controle", sessions: 500, conversions: 50 }, { version: "alternative", sessions: 510, conversions: 60 }]
          : [{ version: "controle", sessions: 99999, conversions: 90000 }]
    })
    assert.deepEqual(appels, [undefined, "a".repeat(32), "b".repeat(32)])
    assert.equal(comptes(res, "prix", undefined, "a".repeat(32)).o?.n, 100)
    assert.equal(comptes(res, "alternative", undefined, "b".repeat(32)).o?.n, 500)
    assert.deepEqual(comptes(res, "prix", undefined, "c".repeat(32)), { o: null, v: null })
    assert.deepEqual(comptes({ ...res, parTest: undefined }, "prix", undefined, "a".repeat(32)), { o: null, v: null })
    await ecrireJson(f.contexte, { visiteursMois: 500000, tauxConversion: 10 })
    const plan = await planAuLancement(dir, 0.5, true)
    assert.equal(plan.jours, null)
    assert.equal(plan.tauxSuppose, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("GA4 : filtre exact par expérience, métriques binomiales et refus des données tronquées", async () => {
  const original = globalThis.fetch
  const cle = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const sa = { client_email: "test@example.com", private_key: cle }
  const exp = "a".repeat(32)
  let tronque = false
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("oauth2")) return new Response(JSON.stringify({ access_token: "test" }))
    const corps = JSON.parse(String(init?.body))
    assert.deepEqual(corps.dimensionFilter, { filter: { fieldName: "customUser:lpws_experience", stringFilter: { matchType: "EXACT", value: exp, caseSensitive: true } } })
    assert.deepEqual(corps.metrics, [{ name: "sessions" }, { name: "sessionKeyEventRate" }])
    return new Response(JSON.stringify({ rowCount: tronque ? 2 : 1, rows: [
      { dimensionValues: [{ value: "controle" }], metricValues: [{ value: "100" }, { value: "0.03" }] },
    ] }))
  }
  try {
    assert.deepEqual(await rapportParVersion(sa, "123", "2026-09-28", "today", exp), [{ version: "controle", sessions: 100, conversions: 3 }])
    tronque = true
    await assert.rejects(() => rapportParVersion(sa, "123", "2026-09-28", "today", exp), /incomplet/)
    assert.throws(() => lireRapport({ rows: [{ dimensionValues: [{ value: "x" }], metricValues: [{ value: "12" }, { value: "NaN" }] }] }), /invalides/)
    assert.throws(() => lireRapport({ rows: [{ dimensionValues: [{ value: "x" }], metricValues: [{ value: "12" }, { value: "1.2" }] }] }), /invalides/)
  } finally { globalThis.fetch = original }
})
