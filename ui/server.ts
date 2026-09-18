/**
 * server.ts — la v1 : l'interface du media buyer branchée sur la machine.
 *
 * Un serveur local (node:http, zéro dépendance) qui sert ui/index.html et pilote les familles
 * existantes en SOUS-PROCESSUS — clone, apply, tag — parce qu'elles sortent du processus
 * en cas d'échec (`fail`), et qu'un échec de capture ne doit pas tuer l'interface.
 *
 *   GET  /                                  l'interface (source, sans captures embarquées :
 *                                           elles sont servies depuis clients/)
 *   GET  /api/etat                          les clients, leurs pages, leurs tests, leur connexion
 *   POST /api/clients            {url}      onboarder une page : lance la capture (job)
 *   GET  /api/jobs/<id>                     suivre un job (lignes, état)
 *   GET  /api/clients/<c>/<camp>/textes     les textes de la page qu'un test peut changer
 *   POST /api/clients/<c>/<camp>/tests      {titre, pourquoi, edits:[{anchor,text}]} → variante + tag (job)
 *   POST /api/clients/<c>/<camp>/tests/<id> {etat:'live'|'stop', part}  → config republiée (job)
 *   POST /api/clients/<c>/<camp>/verifier   la balise est-elle posée sur la vraie page ? (job)
 *   GET  /files/<chemin>                    clients/ en statique (captures)
 *   GET  /t/<client>.js · /v/<client>.json  les fichiers du tag, tels que Vercel les sert
 *
 * Les fichiers du tag sont poussés sur Vercel (ui/dist → https://lpws.vercel.app) à chaque
 * création, lancement ou arrêt : GTM exige une URL stable en https, et elle doit répondre
 * depuis n'importe quel site (CORS ouvert, cf. vercel.json).
 *
 * L'état des tests vit dans clients/<client>/<campagne>/tests.json ; la connexion Express dans
 * express.json. Jamais dans le repo.
 *
 * Usage : npm run ui:serve   →   http://localhost:4700
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { spawn } from "node:child_process"
import { readFile, writeFile, readdir, stat, mkdir, copyFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve, extname, normalize } from "node:path"
import { chromium } from "playwright"
import { CLIENTS_ROOT, marque, slugify } from "../engine/shared/paths.ts"
import { step } from "../engine/shared/log.ts"

const SCOPE = "ui"
const PORT = Number(process.env.PORT ?? 4700)
const ROOT = resolve(import.meta.dirname, "..")
const DIST = join(ROOT, "ui", "dist")
const UI = join(ROOT, "ui", "index.html")
const TSX = join(ROOT, "node_modules", ".bin", "tsx")
/** l'adresse publique des fichiers du tag — celle que le buyer colle dans GTM */
const BASE_TAGS = process.env.LPWS_BASE ?? "https://lpws.vercel.app"
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json; charset=utf-8",
  ".css": "text/css", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
}

/* ---------- jobs : ce qui prend du temps se suit, ligne par ligne ---------- */
type Job = { id: string; type: string; etat: "en cours" | "ok" | "échec"; lignes: string[]; debut: string; fin?: string; resultat?: unknown }
const jobs = new Map<string, Job>()
function nouveauJob(type: string): Job {
  const job: Job = { id: Math.random().toString(36).slice(2, 10), type, etat: "en cours", lignes: [], debut: new Date().toISOString() }
  jobs.set(job.id, job)
  return job
}
/** les codes couleur des CLI (vercel…) n'ont rien à faire à l'écran */
const dire = (job: Job, l: string) => { for (const x of l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r?\n/)) if (x.trim()) { job.lignes.push(x); if (job.lignes.length > 400) job.lignes.shift() } }
function finir(job: Job, ok: boolean, resultat?: unknown) { job.etat = ok ? "ok" : "échec"; job.fin = new Date().toISOString(); job.resultat = resultat }
/** un sous-processus dont on garde les lignes ; le code de sortie dit s'il a réussi */
function lancer(job: Job, cmd: string, args: string[], cwd = ROOT): Promise<number> {
  return new Promise((res) => {
    dire(job, `$ ${[cmd, ...args].map((a) => a.includes(" ") ? `"${a}"` : a).join(" ").replace(ROOT + "/", "")}`)
    const p = spawn(cmd, args, { cwd, env: process.env })
    p.stdout.on("data", (d) => dire(job, String(d)))
    p.stderr.on("data", (d) => dire(job, String(d)))
    p.on("error", (e) => { dire(job, `erreur : ${e.message}`); res(1) })
    p.on("close", (code) => res(code ?? 1))
  })
}

/* ---------- l'état, lu depuis clients/ ---------- */
type Test = {
  id: string; titre: string; teste: string; pourquoi: string; etat: "prep" | "pret" | "live" | "stop" | "echec"
  part: number; creeLe: string; lanceLe?: string; edits: Array<{ anchor: string; text: string; avant: string }>; erreur?: string; job?: string
}
type Express = { installe: boolean; verifieLe?: string; version?: string; mode?: string; detail?: string }
const lireJson = async <T>(f: string, defaut: T): Promise<T> => { try { return JSON.parse(await readFile(f, "utf8")) } catch { return defaut } }
const ecrireJson = (f: string, v: unknown) => writeFile(f, JSON.stringify(v, null, 2))
const dossier = (c: string, camp: string) => join(ROOT, CLIENTS_ROOT, c, camp)
const dateFr = (iso?: string) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : undefined
const joursDepuis = (iso?: string) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function etat() {
  const clients: unknown[] = []
  const root = join(ROOT, CLIENTS_ROOT)
  if (!existsSync(root)) return { clients, base: BASE_TAGS }
  for (const c of await readdir(root)) {
    const cdir = join(root, c)
    if (!(await stat(cdir)).isDirectory() || c.startsWith("_")) continue
    for (const camp of await readdir(cdir)) {
      const d = join(cdir, camp)
      if (!(await stat(d)).isDirectory()) continue
      const base = join(d, "baseline")
      const encours = await lireJson<{ url: string; job: string; debut: string } | null>(join(d, "capture.json"), null)
      if (!existsSync(join(base, "capture.html")) && !encours) continue
      const meta = await lireJson<any>(join(base, "meta.json"), null)
      const tests = await lireJson<Test[]>(join(d, "tests.json"), [])
      const express = await lireJson<Express>(join(d, "express.json"), { installe: false })
      const url = (meta?.source ?? encours?.url ?? "").replace(/^https?:\/\//, "")
      const site = url.split("/")[0].replace(/^www\./, "")
      const clientSlug = slugify(meta?.client ?? c)
      // un job inconnu (serveur relancé) n'est pas « en cours » : il est interrompu, et on le dit
      const captureEnCours = !!encours && jobs.get(encours.job)?.etat === "en cours"
      const capture = meta
        ? { date: dateFr(meta.capturedAt), ok: meta.fidele === true ? true : false, conforme: meta.diff ? `${(100 - meta.diff.desktop * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : undefined,
            blocs: meta.marked?.sections ?? 0,
            cause: meta.fidele ? undefined : "La copie n’est pas encore assez conforme à la page en ligne. On la refait avec un réglage adapté — rien à faire de votre côté." }
        : captureEnCours ? { date: dateFr(encours!.debut), ok: null, enCours: true, cause: "Copie en cours — quelques minutes." }
        : { date: dateFr(encours?.debut), ok: null, cause: "La copie s’est interrompue. Relancez-la — rien à faire côté client." }
      clients.push({
        id: `${c}/${camp}`, client: c, campagne: camp, clientSlug, ini: cap(c.slice(0, 1)), nom: cap(c), marque: camp.replace(/-/g, " "),
        url, site, live: true,
        imgUrl: existsSync(join(base, "clone.png")) ? `/files/${c}/${camp}/baseline/clone.png` : null,
        capture,
        job: captureEnCours ? encours!.job : undefined,
        connexion: {
          express: { etat: express.installe ? "ok" : "off", label: express.installe ? "Installé" : "À installer", verifie: dateFr(express.verifieLe), vitesse: "non mesurée", stopGtm: false,
            steps: [1, express.installe ? 1 : 0, express.installe ? 1 : 0, express.installe ? 1 : 0],
            script: `<script src="${BASE_TAGS}/t/${clientSlug}.js" async></script>`, detail: express.detail },
          integral: { etat: "off", label: "Pas encore", hote: `lp.${site}`, steps: [0, 0, 0, 0] },
          natif: { etat: "na", label: "Pas une boutique Shopify" },
        },
        ads: null,
        tests: tests.map((t) => ({
          id: t.id, titre: t.titre, etat: t.etat, part: t.part, jours: joursDepuis(t.lanceLe), potentiel: "Moyen",
          teste: t.teste, pourquoi: t.pourquoi, erreur: t.erreur, job: t.job,
          changes: t.edits.map((e) => ({ t: `Texte modifié — avant : « ${e.avant.slice(0, 80)}${e.avant.length > 80 ? "…" : ""} »`, q: e.text, w: t.pourquoi })),
          imgUrl: existsSync(join(d, "variants", t.id, "variant.png")) ? `/files/${c}/${camp}/variants/${t.id}/variant.png` : null,
          res: null,
        })),
      })
    }
  }
  clients.sort((a: any, b: any) => (b.capture?.date ?? "").localeCompare(a.capture?.date ?? ""))
  // initiales : une lettre, deux quand deux clients commencent pareil
  const lettres = new Map<string, number>()
  for (const x of clients as any[]) lettres.set(x.client[0], (lettres.get(x.client[0]) ?? 0) + 1)
  for (const x of clients as any[]) if ((lettres.get(x.client[0]) ?? 0) > 1) x.ini = cap(x.client.slice(0, 2))
  return { clients, base: BASE_TAGS }
}

/* ---------- onboarder une page : la capture, en sous-processus ---------- */
async function capturer(url: string): Promise<{ job: Job; client: string; campagne: string }> {
  const client = marque(url)
  const campagne = slugify(new URL(url).pathname) || "campagne-1"
  const d = dossier(client, campagne)
  await mkdir(d, { recursive: true })
  const job = nouveauJob("capture")
  await ecrireJson(join(d, "capture.json"), { url, job: job.id, debut: job.debut })
  ;(async () => {
    const code = await lancer(job, TSX, [join(ROOT, "engine/clone/run.ts"), url, "--client", client, "--campaign", campagne])
    // exit 1 = capture faite mais pas fidèle : la page existe, le juge a dit non — c'est un résultat
    const meta = existsSync(join(d, "baseline", "meta.json"))
    finir(job, code === 0 || meta, { client, campagne, fidele: code === 0 })
    if (meta) { try { await rm(join(d, "capture.json")) } catch {} }
  })()
  return { job, client, campagne }
}

/* ---------- les textes qu'un test peut changer ---------- */
type Texte = { anchor: string; tag: string; text: string; top: number }
async function textes(c: string, camp: string): Promise<Texte[]> {
  const base = join(dossier(c, camp), "baseline")
  const cache = join(base, "textes-v2.json")
  const deja = await lireJson<Texte[] | null>(cache, null)
  if (deja) return deja
  if (!existsSync(join(base, "capture.html"))) return []
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto("file://" + join(base, "capture.html"), { waitUntil: "domcontentloaded", timeout: 60_000 })
    // ce que le buyer veut changer d'abord : le titre, l'accroche, le bouton — pas le menu
    const out: Texte[] = await page.evaluate(() => {
      const res: Array<Texte & { prio: number }> = []
      const bruit = /^(skip to content|log ?in|sign in|sign up|high contrast|select a language|_+$|menu|close|search|cookie|accept|privacy)/i
      document.querySelectorAll("[data-lpws]").forEach((el) => {
        const tag = el.tagName.toLowerCase()
        if (!/^(h[1-6]|a|button|p)$/.test(tag)) return
        if (el.closest("nav, header, footer, [role=navigation], [aria-hidden=true]")) return
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
        if (text.length < 3 || text.length > 200 || bruit.test(text)) return
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return
        const prio = tag === "h1" ? 0 : tag === "h2" ? 1 : tag === "h3" ? 2 : tag === "button" || tag === "a" ? 3 : 4
        res.push({ anchor: el.getAttribute("data-lpws")!, tag, text, top: Math.round(r.top + window.scrollY), prio })
      })
      return res.sort((a, b) => a.prio - b.prio || a.top - b.top).slice(0, 60).map(({ prio, ...x }) => x)
    })
    await ecrireJson(cache, out)
    return out
  } finally { await browser.close() }
}

/* ---------- créer un test : spec → variante → tag → Vercel ---------- */
async function creerTest(c: string, camp: string, entree: { titre: string; pourquoi: string; edits: Array<{ anchor: string; text: string }> }) {
  const d = dossier(c, camp); const base = join(d, "baseline")
  const tests = await lireJson<Test[]>(join(d, "tests.json"), [])
  let id = slugify(entree.titre).slice(0, 40) || "test"
  while (tests.some((t) => t.id === id)) id += "-2"
  const empreintes = await lireJson<Array<{ a: string; role: string; text: string }>>(join(base, "anchors.json"), [])
  const txt = await textes(c, camp)
  const edits = entree.edits.map((e) => ({ anchor: e.anchor, text: e.text, avant: txt.find((t) => t.anchor === e.anchor)?.text ?? "" }))
  const job = nouveauJob("test")
  const teste = edits.map((e) => `« ${e.avant.slice(0, 60)} » devient « ${e.text.slice(0, 60)} »`).join(" · ")
  const test: Test = { id, titre: entree.titre, teste, pourquoi: entree.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id }
  tests.push(test)
  await ecrireJson(join(d, "tests.json"), tests)

  const spec = {
    nom: id,
    hypothese: `Si ${teste}, alors les conversions augmentent, parce que ${entree.pourquoi}`.slice(0, 600).padEnd(20, "."),
    metrique: "conversions Google Ads sur le trafic payant",
    risque: "test défini à la main par le media buyer : à relire avant lancement",
    diagnostic: { regle: "media-buyer", signal: `édition manuelle : ${entree.titre}`, priorite: "MEDIUM", confiance: "Medium", preuve: "intuition du media buyer — pas de règle KB" },
    edits: edits.map((e) => {
      const emp = empreintes.find((x) => x.a === e.anchor)
      return { anchor: e.anchor, op: "set", text: e.text, pourquoi: entree.pourquoi, ...(emp ? { attendu: { role: emp.role, text: emp.text } } : {}) }
    }),
  }
  await mkdir(join(d, "specs"), { recursive: true })
  const specPath = join(d, "specs", `${id}.json`)
  await ecrireJson(specPath, spec)

  ;(async () => {
    const maj = async (patch: Partial<Test>) => {
      const all = await lireJson<Test[]>(join(d, "tests.json"), [])
      const t = all.find((x) => x.id === id); if (t) Object.assign(t, patch)
      await ecrireJson(join(d, "tests.json"), all)
    }
    dire(job, "1 · la variante : on applique le changement sur la copie et on la photographie")
    let code = await lancer(job, TSX, [join(ROOT, "engine/apply/run.ts"), base, specPath])
    if (code !== 0) { await maj({ etat: "echec", erreur: "La variante n’a pas pu être produite : " + job.lignes.slice(-3).join(" / ") }); finir(job, false); return }
    dire(job, "2 · le tag : on retrouve chaque cible sur la vraie page et on prépare la balise")
    code = await construireTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La cible n’a pas été retrouvée sur la page en ligne : " + job.lignes.slice(-4).join(" / ") }); finir(job, false); return }
    dire(job, "3 · en ligne : on publie la balise et la config sur " + BASE_TAGS)
    code = await publierTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La publication sur Vercel a échoué : " + job.lignes.slice(-3).join(" / ") }); finir(job, false); return }
    await maj({ etat: "pret" })
    finir(job, true, { id })
  })()
  return { job, id }
}

/** reconstruit loader + config avec TOUTES les specs des tests vivants de la page */
async function construireTag(job: Job, c: string, camp: string): Promise<number> {
  const d = dossier(c, camp); const base = join(d, "baseline")
  const tests = await lireJson<Test[]>(join(d, "tests.json"), [])
  const specs = tests.filter((t) => t.etat !== "echec").map((t) => join(d, "specs", `${t.id}.json`)).filter((p) => existsSync(p))
  if (!specs.length) return 0
  const meta = await lireJson<any>(join(base, "meta.json"), {})
  const code = await lancer(job, TSX, [join(ROOT, "engine/deploy/tag/build.ts"), base, ...specs, "--base", BASE_TAGS, "--url", meta.source])
  if (code !== 0) return code
  await appliquerParts(c, camp)
  return 0
}
/** la part de trafic de chaque variante vient de tests.json, pas du build (qui met la même partout) */
async function appliquerParts(c: string, camp: string) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(join(d, "tests.json"), [])
  const meta = await lireJson<any>(join(d, "baseline", "meta.json"), {})
  const f = join(d, "tags", "v", `${slugify(meta.client ?? c)}.json`)
  const cfg = await lireJson<any>(f, null)
  if (!cfg) return
  cfg.actif = true
  for (const v of cfg.variantes) { const t = tests.find((x) => x.id === v.nom); v.part = t && t.etat === "live" ? t.part : 0 }
  await ecrireJson(f, cfg)
}
/** copie loader + config dans ui/dist et pousse sur Vercel : l'URL que GTM connaît */
async function publierTag(job: Job, c: string, camp: string): Promise<number> {
  const d = dossier(c, camp)
  const meta = await lireJson<any>(join(d, "baseline", "meta.json"), {})
  const slug = slugify(meta.client ?? c)
  await mkdir(join(DIST, "t"), { recursive: true }); await mkdir(join(DIST, "v"), { recursive: true })
  await copyFile(join(d, "tags", "loader.js"), join(DIST, "t", `${slug}.js`))
  await copyFile(join(d, "tags", "v", `${slug}.json`), join(DIST, "v", `${slug}.json`))
  await ecrireJson(join(DIST, "vercel.json"), {
    headers: [
      { source: "/v/(.*)", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "no-cache" }] },
      { source: "/t/(.*)", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=60" }] },
    ],
  })
  if (process.env.LPWS_SANS_VERCEL) { dire(job, "(publication Vercel sautée : LPWS_SANS_VERCEL)"); return 0 }
  return lancer(job, "vercel", ["deploy", "--prod", "--yes"], DIST)
}

async function changerEtat(c: string, camp: string, id: string, etat: "live" | "stop", part: number) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(join(d, "tests.json"), [])
  const t = tests.find((x) => x.id === id)
  if (!t) throw new Error("test inconnu")
  if (etat === "live") { t.etat = "live"; t.part = part || 50; t.lanceLe = new Date().toISOString(); for (const o of tests) if (o !== t && o.etat === "live") o.etat = "stop" }
  else { t.etat = "stop" }
  await ecrireJson(join(d, "tests.json"), tests)
  await appliquerParts(c, camp)
  const job = nouveauJob("config")
  ;(async () => {
    dire(job, etat === "live" ? `mise en ligne : ${t.part} % des visiteurs verront la variante` : "arrêt : l’original reprend 100 % du trafic")
    const code = await publierTag(job, c, camp)
    finir(job, code === 0)
  })()
  return job
}

/* ---------- la balise est-elle vraiment posée ? on ouvre la vraie page ---------- */
async function verifier(c: string, camp: string): Promise<Job> {
  const d = dossier(c, camp)
  const meta = await lireJson<any>(join(d, "baseline", "meta.json"), {})
  const job = nouveauJob("verification")
  ;(async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      let demande = false
      page.on("request", (r) => { if (r.url().startsWith(BASE_TAGS + "/t/")) demande = true })
      dire(job, `ouverture de ${meta.source}`)
      await page.goto(meta.source, { waitUntil: "domcontentloaded", timeout: 45_000 })
      await page.waitForFunction(() => (window as any).__lpws, { timeout: 12_000 }).catch(() => null)
      const info = await page.evaluate(() => (window as any).__lpws ?? null)
      const ex: Express = { installe: !!info || demande, verifieLe: new Date().toISOString(), version: info?.version, mode: info?.mode,
        detail: info ? `balise active (${info.mode}), version servie : ${info.version}` : demande ? "balise demandée par la page, mais pas encore exécutée au moment de la lecture" : "aucune trace de la balise sur la page : GTM ne l’a pas encore publiée" }
      await ecrireJson(join(d, "express.json"), ex)
      dire(job, ex.detail!)
      finir(job, ex.installe, ex)
    } catch (e) { dire(job, String(e)); finir(job, false) } finally { await browser.close() }
  })()
  return job
}

/* ---------- http ---------- */
const json = (res: ServerResponse, code: number, v: unknown) => { res.writeHead(code, { "content-type": MIME[".json"] }); res.end(JSON.stringify(v)) }
const body = (req: IncomingMessage) => new Promise<any>((ok, ko) => { let s = ""; req.on("data", (d) => s += d); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}) } catch (e) { ko(e) } }) })
async function fichier(res: ServerResponse, f: string, cors = false) {
  if (!existsSync(f) || (await stat(f)).isDirectory()) { res.writeHead(404); res.end("introuvable"); return }
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream", ...(cors ? { "access-control-allow-origin": "*", "cache-control": "no-cache" } : {}) })
  res.end(await readFile(f))
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost")
    const p = url.pathname
    const seg = p.split("/").filter(Boolean)
    if (p === "/") { res.writeHead(200, { "content-type": MIME[".html"] }); res.end(await readFile(UI)); return }
    if (p === "/api/etat") return json(res, 200, await etat())
    if (p === "/api/clients" && req.method === "POST") {
      const { url: u } = await body(req)
      let cible: URL
      try { cible = new URL(String(u ?? "").trim()) ; if (!/^https?:$/.test(cible.protocol)) throw 0 } catch { return json(res, 400, { erreur: "Collez l’adresse complète de la page, avec https://" }) }
      const r = await capturer(cible.toString())
      return json(res, 202, { job: r.job.id, client: r.client, campagne: r.campagne, id: `${r.client}/${r.campagne}` })
    }
    if (seg[0] === "api" && seg[1] === "jobs" && seg[2]) { const j = jobs.get(seg[2]); return j ? json(res, 200, j) : json(res, 404, { erreur: "job inconnu" }) }
    if (seg[0] === "api" && seg[1] === "clients" && seg[2] && seg[3]) {
      const [c, camp] = [seg[2], seg[3]]
      if (!existsSync(dossier(c, camp))) return json(res, 404, { erreur: "client inconnu" })
      if (seg[4] === "textes") return json(res, 200, await textes(c, camp))
      if (seg[4] === "tests" && !seg[5] && req.method === "POST") {
        const b = await body(req)
        if (!b.titre || !Array.isArray(b.edits) || !b.edits.length || b.edits.some((e: any) => !e.anchor || !e.text)) return json(res, 400, { erreur: "Il faut un titre et au moins un texte à changer." })
        const r = await creerTest(c, camp, { titre: String(b.titre), pourquoi: String(b.pourquoi || "le media buyer veut le vérifier"), edits: b.edits })
        return json(res, 202, { job: r.job.id, id: r.id })
      }
      if (seg[4] === "tests" && seg[5] && req.method === "POST") {
        const b = await body(req)
        const job = await changerEtat(c, camp, seg[5], b.etat === "live" ? "live" : "stop", Number(b.part) || 50)
        return json(res, 202, { job: job.id })
      }
      if (seg[4] === "verifier" && req.method === "POST") return json(res, 202, { job: (await verifier(c, camp)).id })
    }
    if (p.startsWith("/files/")) {
      const rel = normalize(decodeURIComponent(p.slice(7)))
      if (rel.startsWith("..")) { res.writeHead(403); res.end(); return }
      return fichier(res, join(ROOT, CLIENTS_ROOT, rel))
    }
    if ((seg[0] === "t" || seg[0] === "v") && seg[1]) return fichier(res, join(DIST, seg[0], normalize(seg[1])), true)
    res.writeHead(404); res.end()
  } catch (e) { json(res, 500, { erreur: String((e as Error)?.message ?? e) }) }
}).listen(PORT, "127.0.0.1", () => step(SCOPE, `interface → http://localhost:${PORT} · tag publié sur ${BASE_TAGS}`))
