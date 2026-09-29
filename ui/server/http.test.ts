import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { createServer as serveurNet } from "node:net"
import { ROOT } from "./config.ts"

let PORT = 0
const portLibre = () => new Promise<number>((ok) => { const s = serveurNet(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)) }) })
const base = () => `http://127.0.0.1:${PORT}`
const AUTH = "Basic " + Buffer.from("y:motdepasse").toString("base64")
let srv: ChildProcess
let tmp: string

before(async () => {
  tmp = await mkdtemp(join(ROOT, "clients", "_test-http-"))
  PORT = await portLibre()
  await mkdir(join(tmp, "camp"), { recursive: true })
  srv = spawn(process.execPath, ["--import", "tsx", "ui/server.ts"], {
    cwd: ROOT,
    env: { ...process.env, LPWS_SANS_VERCEL: "1", PORT: String(PORT), LPWS_MOT_DE_PASSE: "motdepasse", LPWS_SURVEILLANCE: "", LPWS_FACTURATION: "" },
    stdio: "ignore",
  })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const ok = await fetch(base() + "/api/etat").then((r) => r.status === 401).catch(() => false)
    if (ok) return
  }
  throw new Error("serveur de test pas prêt")
})
after(async () => { srv.kill("SIGKILL"); await rm(tmp, { recursive: true, force: true }) })

test("API protégée sans mot de passe : 401", async () => {
  const r = await fetch(`${base()}/api/etat`)
  assert.equal(r.status, 401)
})

test("sync sans jeton : 401 avant toute lecture du corps", async () => {
  const r = await fetch(`${base()}/api/intents/x/camp/sync`, { method: "POST", body: "x".repeat(100) })
  assert.equal(r.status, 401)
})

test("JSON malformé : 400, jamais de crash", async () => {
  const r = await fetch(`${base()}/api/clients`, { method: "POST", headers: { "content-type": "application/json", authorization: AUTH }, body: "{pas json" })
  assert.equal(r.status, 400)
  assert.match((await r.json()).erreur, /JSON/)
})

test("corps null : 400", async () => {
  const r = await fetch(`${base()}/api/clients`, { method: "POST", headers: { "content-type": "application/json", authorization: AUTH }, body: "null" })
  assert.equal(r.status, 400)
})

test("au-delà de la limite : 413 en réponse JSON, pas de socket cassée", async () => {
  const r = await fetch(`${base()}/api/clients`, {
    method: "POST", headers: { "content-type": "application/json", authorization: AUTH },
    body: JSON.stringify({ url: "https://x.example/" + "y".repeat(3_000_000) }),
  })
  assert.equal(r.status, 413)
  const j = await r.json()
  assert.match(j.erreur, /volumineux/)
})

test("traversée de chemin : 403/404, pas de fuite", async () => {
  const r = await fetch(`${base()}/files/..%2F..%2Fpackage.json`, { headers: { authorization: AUTH } })
  assert.ok([403, 404].includes(r.status))
})

test("état de test inconnu : 400 pas une transformée silencieuse", async () => {
  const c = tmp.split("/").pop()
  const r = await fetch(`${base()}/api/clients/${c}/camp/tests/t1`, { method: "POST", headers: { "content-type": "application/json", authorization: AUTH }, body: JSON.stringify({ etat: "coucou", part: 50 }) })
  assert.equal(r.status, 400)
})
