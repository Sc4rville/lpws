/**
 * server.ts : la v1 : l'interface du media buyer branchée sur la machine.
 *
 * Un serveur local (node:http, zéro dépendance) qui sert ui/index.html et pilote les familles
 * existantes en SOUS-PROCESSUS : clone, apply, tag : parce qu'elles sortent du processus
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
import { readFile, readdir, stat, mkdir, copyFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { lancerNavigateur, UA } from "../engine/shared/navigateur.ts"
import { CLIENTS_ROOT, marque, slugify } from "../engine/shared/paths.ts"
import { Contexte } from "../engine/variant/contexte.ts"
import { step } from "../engine/shared/log.ts"
import { lireJson, ecrireJson } from "../engine/shared/json.ts"
import { envoyerFichier, envoyerJson as json } from "../engine/shared/http.ts"
import { mimeDe } from "../engine/shared/mime.ts"
import { campagne as fichiersDe, type Test, type Express } from "../engine/shared/campagne.ts"

const SCOPE = "ui"
const PORT = Number(process.env.PORT ?? 4700)
const ROOT = resolve(import.meta.dirname, "..")
const DIST = join(ROOT, "ui", "dist")
const UI = join(ROOT, "ui", "index.html")
const TSX = join(ROOT, "node_modules", ".bin", "tsx")
/** l'adresse publique des fichiers du tag : celle que le buyer colle dans GTM */
const BASE_TAGS = process.env.LPWS_BASE ?? "https://lpws.vercel.app"

/* ---------- jobs : ce qui prend du temps se suit, ligne par ligne ---------- */
type Job = { id: string; type: string; etat: "en cours" | "ok" | "échec"; lignes: string[]; debut: string; fin?: string; resultat?: unknown; campagne?: string }
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
/** Le nom affiché au buyer : ce que le site dit de lui-même (og:site_name, puis le segment du
 *  <title> qui ressemble au domaine), sinon le domaine. L'identifiant du dossier, lui, ne bouge pas. */
const nomsDeSites = new Map<string, string>()
async function nomDuSite(d: string, c: string): Promise<string> {
  if (nomsDeSites.has(d)) return nomsDeSites.get(d)!
  let nom = cap(c)
  try {
    const html = (await readFile(fichiersDe(d).capture, "utf8")).slice(0, 80_000)
    const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,60})["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']{1,60})["'][^>]+property=["']og:site_name["']/i)?.[1]
    const segments = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? "").split(/\s+[|·•:–-]\s+/).map((x) => x.trim())
    const lettres = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "")
    const duDomaine = segments.find((x) => x && lettres(x) && (lettres(x) === lettres(c) || lettres(x).startsWith(lettres(c)) || lettres(c).startsWith(lettres(x))))
    const brut = (og ?? duDomaine ?? "").replace(/&amp;/g, "&").trim()
    if (brut && brut.length <= 40) nom = brut
  } catch {}
  nomsDeSites.set(d, nom)
  return nom
}

const dossier = (c: string, camp: string) => join(ROOT, CLIENTS_ROOT, c, camp)
const dateFr = (iso?: string) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : undefined
/** BASE_TAGS/t/<client>.js répond-il ? true / false, ou null si BASE_TAGS est injoignable. Mémoire 60 s. */
const _publie = new Map<string, { at: number; v: boolean | null }>()
async function tagPublie(slug: string): Promise<boolean | null> {
  const m = _publie.get(slug)
  if (m && Date.now() - m.at < 60_000) return m.v
  let v: boolean | null = null
  try {
    const r = await fetch(`${BASE_TAGS}/t/${slug}.js`, { method: "HEAD", signal: AbortSignal.timeout(4_000) })
    v = r.ok
  } catch { v = null }
  _publie.set(slug, { at: Date.now(), v })
  return v
}
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
      const base = fichiersDe(d).baseline
      const encours = await lireJson<{ url: string; job: string; debut: string } | null>(fichiersDe(d).enCours, null)
      if (!existsSync(fichiersDe(d).capture) && !encours) continue
      const meta = await lireJson<any>(fichiersDe(d).meta, null)
      const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
      const express = await lireJson<Express>(fichiersDe(d).express, { installe: false })
      // le brain : ce que le buyer a dit de la campagne, ce que la machine en a conclu, ce qu'elle propose
      const contexte = await lireJson<any>(fichiersDe(d).contexte, null)
      const diag = await lireJson<any>(fichiersDe(d).diagnostic, null)
      // un test en échec libère sa proposition : le buyer peut la retenter après correction
      const dejaTests = new Set(tests.filter((t) => t.etat !== "echec").map((t) => t.id))
      const propositions = (await lireJson<any[]>(fichiersDe(d).propositions, [])).filter((p) => !dejaTests.has(p.nom) && !p.refusee)
      const brainJob = [...jobs.values()].find((jb) => jb.type === "brain" && jb.etat === "en cours" && jb.campagne === d)
      const brainEnCours = !!brainJob
      // les chiffres viennent de GA4 (famille measure) : sans eux, l'écran dit « pas encore de
      // données » au lieu d'inventer
      const resultats = await lireJson<{ luLe: string; source?: string; versions: Record<string, { n: number; c: number }> } | null>(fichiersDe(d).resultats, null)
      const resDe = (id: string) => {
        const o = resultats?.versions?.controle, v = resultats?.versions?.[id]
        return o && v && o.n > 0 && v.n > 0 ? { o, v, luLe: resultats!.luLe, source: resultats!.source ?? "ga4" } : null
      }
      const url = (meta?.source ?? encours?.url ?? "").replace(/^https?:\/\//, "")
      const site = url.split("/")[0].replace(/^www\./, "")
      const clientSlug = slugify(meta?.client ?? c)
      // la balise que le buyer colle pointe sur BASE_TAGS/t/<client>.js : si cette adresse ne
      // répond pas (constaté : 404 sur lpws.vercel.app après un déploiement de la démo seule),
      // il collerait une balise morte sans aucun message. On le vérifie ici, une fois par minute.
      const publie = await tagPublie(clientSlug)
      // un job inconnu (serveur relancé) n'est pas « en cours » : il est interrompu, et on le dit
      const captureEnCours = !!encours && jobs.get(encours.job)?.etat === "en cours"
      const capture = meta
        ? { date: dateFr(meta.capturedAt), ok: meta.fidele === true ? true : false, conforme: meta.diff ? `${(100 - meta.diff.desktop * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : undefined,
            blocs: meta.marked?.sections ?? 0,
            // pas de promesse que la machine ne tient pas : rien ne « refait » la copie tout seul.
            // Et la vérité utile : un test Express s'applique sur la VRAIE page, la copie ne sert
            // qu'à préparer et montrer : une copie approximative n'empêche pas de tester.
            cause: meta.fidele ? undefined : `La copie est conforme à ${meta.diff ? `${(100 - meta.diff.desktop * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "moins de 97 %"} : cette page anime ses blocs au défilement, ce que la copie ne rejoue pas. Les tests Express restent possibles (ils s’appliquent sur la vraie page) ; seul l’aperçu sera approximatif.` }
        : captureEnCours ? { date: dateFr(encours!.debut), ok: null, enCours: true, cause: "Copie en cours : quelques minutes." }
        : { date: dateFr(encours?.debut), ok: null, cause: "La copie s’est interrompue avant la fin. Relancez-la depuis cette page : rien à faire côté client." }
      clients.push({
        id: `${c}/${camp}`, client: c, campagne: camp, clientSlug, ini: cap(c.slice(0, 1)), nom: await nomDuSite(d, c), marque: camp.replace(/-/g, " "),
        url, site, live: true,
        // le site a redirigé l'adresse collée : on le dit, sinon le buyer cherche « sa » page
        redirigeDe: meta?.demande ? String(meta.demande).replace(/^https?:\/\//, "") : undefined,
        imgUrl: existsSync(join(base, "clone.png")) ? `/files/${c}/${camp}/baseline/clone.png` : null,
        capture,
        job: captureEnCours ? encours!.job : undefined,
        contexte,
        diagnostic: diag ? { faitLe: diag.faitLe, regime: diag.regime, tests: diag.tests, conseils: diag.conseils, nonEvaluables: diag.nonEvaluables?.length ?? 0 } : null,
        propositions,
        brainEnCours, brainJob: brainJob?.id,
        connexion: {
          express: { etat: express.installe ? "ok" : "off",
            label: express.installe ? "Installé" : publie === false ? "Balise pas encore publiée" : "À installer",
            publie, verifie: dateFr(express.verifieLe), vitesse: "non mesurée", stopGtm: false,
            steps: [1, express.installe ? 1 : 0, express.installe ? 1 : 0, express.installe ? 1 : 0],
            script: `<script src="${BASE_TAGS}/t/${clientSlug}.js" async></script>`, detail: express.detail },
          integral: { etat: "off", label: "Pas encore", hote: `lp.${site}`, steps: [0, 0, 0, 0] },
          natif: { etat: "na", label: "Pas une boutique Shopify" },
        },
        ads: null,
        tests: tests.map((t) => ({
          id: t.id, titre: t.titre, etat: t.etat, part: t.part, jours: joursDepuis(t.lanceLe), potentiel: "Moyen",
          teste: t.teste, pourquoi: t.pourquoi, erreur: t.erreur, job: t.job,
          changes: t.edits.map((e) => ({ t: `Texte modifié : avant : « ${e.avant.slice(0, 80)}${e.avant.length > 80 ? "…" : ""} »`, q: e.text, w: t.pourquoi })),
          imgUrl: existsSync(join(fichiersDe(d).variante(t.id), "variant.png")) ? `/files/${c}/${camp}/variants/${t.id}/variant.png` : null,
          res: resDe(t.id),
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
  await ecrireJson(fichiersDe(d).enCours, { url, job: job.id, debut: job.debut })
  ;(async () => {
    const code = await lancer(job, TSX, [join(ROOT, "engine/clone/run.ts"), url, "--client", client, "--campaign", campagne])
    // exit 1 = capture faite mais pas fidèle : la page existe, le juge a dit non : c'est un résultat
    const meta = existsSync(fichiersDe(d).meta)
    finir(job, code === 0 || meta, { client, campagne, fidele: code === 0 })
    if (meta) { try { await rm(fichiersDe(d).enCours) } catch {} }
  })()
  return { job, client, campagne }
}

/* ---------- les textes qu'un test peut changer ---------- */
type Texte = { anchor: string; tag: string; text: string; top: number }
async function textes(c: string, camp: string): Promise<Texte[]> {
  const base = fichiersDe(dossier(c, camp)).baseline
  const cache = join(base, "textes-v2.json")
  const deja = await lireJson<Texte[] | null>(cache, null)
  if (deja) return deja
  if (!existsSync(join(base, "capture.html"))) return []
  const browser = await lancerNavigateur()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent: UA })
    await page.goto("file://" + join(base, "capture.html"), { waitUntil: "domcontentloaded", timeout: 60_000 })
    // ce que le buyer veut changer d'abord : le titre, l'accroche, le bouton : pas le menu
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
/** Les trois pas d'un test, du fichier de spec à la balise publiée. Partagé : test écrit à la
 *  main par le buyer, ou proposé par le brain. */
async function pipelineTest(job: Job, c: string, camp: string, id: string, base: string, specPath: string) {
  const d = dossier(c, camp)
    const maj = async (patch: Partial<Test>) => {
      const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
      const t = all.find((x) => x.id === id); if (t) Object.assign(t, patch)
      await ecrireJson(fichiersDe(d).tests, all)
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
    await maj({ etat: "pret", erreur: undefined })
    finir(job, true, { id })
}

async function creerTest(c: string, camp: string, entree: { titre: string; pourquoi: string; edits: Array<{ anchor: string; text: string }> }) {
  const d = dossier(c, camp); const base = fichiersDe(d).baseline
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  let id = slugify(entree.titre).slice(0, 40) || "test"
  while (tests.some((t) => t.id === id)) id += "-2"
  const empreintes = await lireJson<Array<{ a: string; role: string; text: string }>>(fichiersDe(d).ancres, [])
  const txt = await textes(c, camp)
  const edits = entree.edits.map((e) => ({ anchor: e.anchor, text: e.text, avant: txt.find((t) => t.anchor === e.anchor)?.text ?? "" }))
  const job = nouveauJob("test")
  const teste = edits.map((e) => `« ${e.avant.slice(0, 60)} » devient « ${e.text.slice(0, 60)} »`).join(" · ")
  const test: Test = { id, titre: entree.titre, teste, pourquoi: entree.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id }
  tests.push(test)
  await ecrireJson(fichiersDe(d).tests, tests)

  const spec = {
    nom: id,
    hypothese: `Si ${teste}, alors les conversions augmentent, parce que ${entree.pourquoi}`.slice(0, 600).padEnd(20, "."),
    metrique: "conversions Google Ads sur le trafic payant",
    risque: "test défini à la main par le media buyer : à relire avant lancement",
    diagnostic: { regle: "media-buyer", signal: `édition manuelle : ${entree.titre}`, priorite: "MEDIUM", confiance: "Medium", preuve: "intuition du media buyer : pas de règle KB" },
    edits: edits.map((e) => {
      const emp = empreintes.find((x) => x.a === e.anchor)
      return { anchor: e.anchor, op: "set", text: e.text, pourquoi: entree.pourquoi, ...(emp ? { attendu: { role: emp.role, text: emp.text } } : {}) }
    }),
  }
  const specPath = fichiersDe(d).spec(id)
  await ecrireJson(specPath, spec)

  pipelineTest(job, c, camp, id, base, specPath)
  return { job, id }
}

/** Le brain : écrit context.json, puis signaux → jugement → diagnostic → 3 specs (job). */
async function lancerBrain(c: string, camp: string, contexte: unknown): Promise<Job> {
  const d = dossier(c, camp)
  const v = Contexte.safeParse(contexte)
  if (!v.success) throw Object.assign(new Error("Il manque au moins ce que promet l’annonce et comment se conclut la vente : " + v.error.issues.map((i) => i.path.join(".")).join(", ")), { code: 400 })
  await ecrireJson(fichiersDe(d).contexte, v.data)
  const job = nouveauJob("brain")
  job.campagne = d
  ;(async () => {
    dire(job, "1 · LPWS lit la page : titres, boutons, preuves, prix")
    dire(job, "2 · puis juge ce qui ne se compte pas, et compare à l’annonce")
    dire(job, "3 · puis écrit trois variantes, une par cible")
    const code = await lancer(job, TSX, [join(ROOT, "engine/variant/run.ts"), resolve(d), "--refaire"])
    finir(job, code === 0)
  })()
  return job
}

/** Une proposition du brain devient un test : même pipeline qu'un test écrit à la main. */
async function creerTestDepuisProposition(c: string, camp: string, nom: string) {
  const d = dossier(c, camp); const base = fichiersDe(d).baseline
  const props = await lireJson<Array<{ nom: string; titre: string; teste: string; pourquoi: string; regle: string }>>(fichiersDe(d).propositions, [])
  const p = props.find((x) => x.nom === nom)
  if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
  const specPath = fichiersDe(d).spec(nom)
  if (!existsSync(specPath)) throw Object.assign(new Error("la spec de cette proposition a disparu"), { code: 404 })
  const spec = await lireJson<any>(specPath, {})
  let tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  if (tests.some((t) => t.id === nom && t.etat !== "echec")) throw Object.assign(new Error("ce test existe déjà"), { code: 409 })
  tests = tests.filter((t) => t.id !== nom)
  const txt = await textes(c, camp)
  const edits = (spec.edits ?? []).map((e: any) => ({ anchor: e.anchor, text: e.text ?? `${e.op} ${e.before ? "avant " + e.before : e.after ? "après " + e.after : ""}`.trim(), avant: txt.find((t) => t.anchor === e.anchor)?.text ?? e.attendu?.text ?? "" }))
  const job = nouveauJob("test")
  tests.push({ id: nom, titre: p.titre, teste: p.teste, pourquoi: p.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id })
  await ecrireJson(fichiersDe(d).tests, tests)
  pipelineTest(job, c, camp, nom, base, specPath)
  return { job, id: nom }
}

/** reconstruit loader + config avec TOUTES les specs des tests vivants de la page */
async function construireTag(job: Job, c: string, camp: string): Promise<number> {
  const d = dossier(c, camp); const base = fichiersDe(d).baseline
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const specs = tests.filter((t) => t.etat !== "echec").map((t) => fichiersDe(d).spec(t.id)).filter((p) => existsSync(p))
  if (!specs.length) return 0
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const code = await lancer(job, TSX, [join(ROOT, "engine/deploy/tag/build.ts"), base, ...specs, "--base", BASE_TAGS, "--url", meta.source])
  if (code !== 0) return code
  await appliquerParts(c, camp)
  return 0
}
/** la part de trafic de chaque variante vient de tests.json, pas du build (qui met la même partout) */
async function appliquerParts(c: string, camp: string) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const f = fichiersDe(d).configTag(slugify(meta.client ?? c))
  const cfg = await lireJson<any>(f, null)
  if (!cfg) return
  cfg.actif = true
  for (const v of cfg.variantes) { const t = tests.find((x) => x.id === v.nom); v.part = t && t.etat === "live" ? t.part : 0 }
  await ecrireJson(f, cfg)
}
/** copie loader + config dans ui/dist et pousse sur Vercel : l'URL que GTM connaît */
async function publierTag(job: Job, c: string, camp: string): Promise<number> {
  const d = dossier(c, camp)
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const slug = slugify(meta.client ?? c)
  await mkdir(join(DIST, "t"), { recursive: true }); await mkdir(join(DIST, "v"), { recursive: true })
  await copyFile(fichiersDe(d).loader, join(DIST, "t", `${slug}.js`))

  /* UN CLIENT, PLUSIEURS PAGES, UNE SEULE CONFIG.
   * La balise est par client (t/<client>.js) et sa config aussi (v/<client>.json), mais chaque
   * page construit la sienne dans son dossier : publier la config d'une page écrasait les
   * variantes de l'autre : le test de la page A disparaissait dès qu'on touchait à la page B.
   * On fusionne donc ici toutes les pages du client ; le loader sait déjà filtrer par URL. */
  const cdir = join(CLIENTS_ROOT, c)
  const fusion: any = { actif: true, delaiMasque: 0, delaiMax: 0, variantes: [] as any[] }
  for (const camp of await readdir(cdir)) {
    const f = fichiersDe(join(cdir, camp)).configTag(slug)
    const cfg = await lireJson<any>(f, null)
    if (!cfg) continue
    // seule tests.json fait foi : une config construite par un outil (tag:check, un essai à la
    // main) sans test derrière est un reste, pas une variante à servir : constaté : une variante
    // de Jira partait à 100 % du trafic sans qu'aucun test n'existe
    const testsCamp = await lireJson<Test[]>(fichiersDe(join(cdir, camp)).tests, [])
    fusion.delaiMasque = Math.max(fusion.delaiMasque, Math.round(cfg.delaiMasque ?? 0))
    fusion.delaiMax = Math.max(fusion.delaiMax, Math.round(cfg.delaiMax ?? 0))
    for (const v of cfg.variantes ?? []) {
      const t = testsCamp.find((x) => x.id === v.nom)
      if (!t || t.etat === "echec") continue
      if (fusion.variantes.some((x: any) => x.nom === v.nom && x.page === v.page)) continue
      fusion.variantes.push({ ...v, part: t.etat === "live" ? t.part : 0 })
    }
  }
  if (!fusion.delaiMasque) fusion.delaiMasque = 1200
  if (!fusion.delaiMax) fusion.delaiMax = fusion.delaiMasque + 2000
  await ecrireJson(join(DIST, "v", `${slug}.json`), fusion)

  // le même dossier sert AUSSI la démo statique (ui:deploy) : déployer l'un sans l'autre
  // efface l'autre en production : c'est ainsi que t/<client>.js est passé en 404 sur Vercel.
  // On garantit donc que la page d'accueil est là avant de pousser quoi que ce soit.
  if (!existsSync(join(DIST, "index.html"))) {
    dire(job, "la démo statique n’est pas dans ui/dist : on la reconstruit pour ne pas l’effacer en ligne")
    const code = await lancer(job, TSX, [join(ROOT, "ui", "build.ts")])
    if (code !== 0) return code
  }
  await ecrireJson(join(DIST, "vercel.json"), {
    headers: [
      { source: "/v/(.*)", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "no-cache" }] },
      { source: "/t/(.*)", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=60" }] },
    ],
  })
  if (process.env.LPWS_SANS_VERCEL) { dire(job, "(publication Vercel sautée : LPWS_SANS_VERCEL)"); return 0 }
  return lancer(job, ...VERCEL(["deploy", "--prod", "--yes"]), DIST)
}

/** le CLI Vercel n’est pas forcément installé en global : npx le télécharge une fois et le garde en cache */
function VERCEL(args: string[]): [string, string[]] {
  const global = (process.env.PATH ?? "").split(":").some((d) => existsSync(join(d, "vercel")))
  return global ? ["vercel", args] : ["npx", ["--yes", "vercel@latest", ...args]]
}

async function changerEtat(c: string, camp: string, id: string, etat: "live" | "stop", part: number) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const t = tests.find((x) => x.id === id)
  if (!t) throw new Error("test inconnu")
  /* PAS DE MISE EN LIGNE SANS BALISE.
   * Constaté en rejouant le parcours : le test passait « En ligne · 50 % » alors que la balise
   * n'était sur aucune page. Le buyer croyait tester, personne ne voyait la variante. On sonde
   * donc la vraie page au moment de lancer (il vient peut-être de publier GTM sans cliquer
   * « Vérifier »), et on refuse franchement si elle ne répond pas. */
  if (etat === "live") {
    const ex = await lireJson<Express>(fichiersDe(d).express, { installe: false })
    const sonde = ex.installe ? ex : await sonderBalise(c, camp)
    if (!sonde.installe)
      throw Object.assign(new Error("La balise Express n’est pas encore sur la page : personne ne verrait la variante. Installez-la (Connexion → Express), publiez dans GTM, puis lancez le test."), { code: 409 })
  }
  const avant = tests.map((o) => [o.id, o.etat, o.part] as const)
  if (etat === "live") { t.etat = "live"; t.part = part || 50; t.lanceLe = new Date().toISOString(); for (const o of tests) if (o !== t && o.etat === "live") o.etat = "stop" }
  else { t.etat = "stop" }
  await ecrireJson(fichiersDe(d).tests, tests)
  await appliquerParts(c, camp)
  const job = nouveauJob("config")
  ;(async () => {
    dire(job, etat === "live" ? `mise en ligne : ${t.part} % des visiteurs verront la variante` : "arrêt : l’original reprend 100 % du trafic")
    const code = await publierTag(job, c, camp)
    // l'état affiché doit être l'état EN LIGNE : si la publication rate, on revient en arrière et on dit pourquoi
    const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
    const cible = all.find((x) => x.id === id)
    if (code !== 0) {
      for (const [oid, oetat, opart] of avant) { const o = all.find((x) => x.id === oid); if (o) { o.etat = oetat; o.part = opart } }
      if (cible) cible.erreur = "La publication sur Vercel a échoué, rien n’a changé en ligne : " + job.lignes.slice(-3).join(" / ")
    } else if (cible) delete cible.erreur
    await ecrireJson(fichiersDe(d).tests, all)
    if (code !== 0) await appliquerParts(c, camp)
    finir(job, code === 0)
  })()
  return job
}

/* ---------- la balise est-elle vraiment posée ? on ouvre la vraie page ---------- */
/** Ouvre la vraie page et cherche la balise. Le résultat est écrit dans express.json. */
async function sonderBalise(c: string, camp: string, job?: Job): Promise<Express> {
  const d = dossier(c, camp)
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const browser = await lancerNavigateur()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent: UA })
    let demande = false
    page.on("request", (r) => { if (r.url().startsWith(BASE_TAGS + "/t/")) demande = true })
    if (job) dire(job, `ouverture de ${meta.source}`)
    await page.goto(meta.source, { waitUntil: "domcontentloaded", timeout: 45_000 })
    await page.waitForFunction(() => (window as any).__lpws, { timeout: 12_000 }).catch(() => null)
    const info = await page.evaluate(() => (window as any).__lpws ?? null)
    const ex: Express = { installe: !!info || demande, verifieLe: new Date().toISOString(), version: info?.version, mode: info?.mode,
      detail: info ? `balise active (${info.mode}), version servie : ${info.version}` : demande ? "balise demandée par la page, mais pas encore exécutée au moment de la lecture" : "aucune trace de la balise sur la page : GTM ne l’a pas encore publiée" }
    await ecrireJson(fichiersDe(d).express, ex)
    return ex
  } finally { await browser.close() }
}

async function verifier(c: string, camp: string): Promise<Job> {
  const job = nouveauJob("verification")
  ;(async () => {
    try {
      const ex = await sonderBalise(c, camp, job)
      dire(job, ex.detail!)
      finir(job, ex.installe, ex)
    } catch (e) { dire(job, String(e)); finir(job, false) }
  })()
  return job
}

/* ---------- http ---------- */
const body = (req: IncomingMessage) => new Promise<any>((ok, ko) => { let s = ""; req.on("data", (d) => s += d); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}) } catch (e) { ko(e) } }) })

/** Hébergée en ligne, l'interface est derrière un mot de passe (LPWS_MOT_DE_PASSE) : un seul,
 *  partagé entre Yann et kabylesystem, le navigateur le retient. Sans la variable : rien ne change en local. */
const MOT_DE_PASSE = process.env.LPWS_MOT_DE_PASSE ?? ""
function autorise(req: IncomingMessage, res: ServerResponse): boolean {
  if (!MOT_DE_PASSE) return true
  const [, b64 = ""] = (req.headers.authorization ?? "").split(" ")
  const donne = Buffer.from(b64, "base64").toString("utf8").split(":").slice(1).join(":")
  if (donne === MOT_DE_PASSE) return true
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="LPWS", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" })
  res.end("LPWS : mot de passe requis")
  return false
}

createServer(async (req, res) => {
  try {
    if (!autorise(req, res)) return
    const url = new URL(req.url ?? "/", "http://localhost")
    const p = url.pathname
    const seg = p.split("/").filter(Boolean)
    if (p === "/") { res.writeHead(200, { "content-type": mimeDe(UI) }); res.end(await readFile(UI)); return }
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
      if (seg[4] === "contexte" && req.method === "POST") return json(res, 202, { job: (await lancerBrain(c, camp, await body(req))).id })
      if (seg[4] === "propositions" && seg[5] && seg[6] === "refuser" && req.method === "POST") {
        const f = fichiersDe(dossier(c, camp)).propositions
        const props = await lireJson<any[]>(f, [])
        const p = props.find((x) => x.nom === seg[5]); if (!p) return json(res, 404, { erreur: "proposition inconnue" })
        // gardée, pas effacée : une variante refusée par le buyer est un signal sur nos diagnostics (feuille de route 4.1)
        p.refusee = true; p.refuseeLe = new Date().toISOString(); p.raison = String((await body(req)).raison ?? "")
        await ecrireJson(f, props); return json(res, 200, { ok: true })
      }
      if (seg[4] === "propositions" && seg[5] && req.method === "POST") { const r = await creerTestDepuisProposition(c, camp, seg[5]); return json(res, 202, { job: r.job.id, id: r.id }) }
    }
    if (p.startsWith("/assets/")) return envoyerFichier(res, join(ROOT, "ui", "assets"), decodeURIComponent(p.slice(8)))
    if (p.startsWith("/files/")) return envoyerFichier(res, join(ROOT, CLIENTS_ROOT), decodeURIComponent(p.slice(7)))
    if ((seg[0] === "t" || seg[0] === "v") && seg[1])
      return envoyerFichier(res, join(DIST, seg[0]), decodeURIComponent(seg[1]), { "access-control-allow-origin": "*", "cache-control": "no-cache" })
    res.writeHead(404); res.end()
  } catch (e) { json(res, Number((e as { code?: number })?.code) || 500, { erreur: String((e as Error)?.message ?? e) }) }
}).listen(PORT, process.env.LPWS_HOTE ?? "127.0.0.1", () => step(SCOPE, `interface → http://${process.env.LPWS_HOTE ?? "localhost"}:${PORT} · tag publié sur ${BASE_TAGS}`))
