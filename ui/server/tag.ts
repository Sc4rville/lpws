/** tag.ts : la balise Express : construire, répartir le trafic, publier sur Vercel, sonder la vraie page. */
import { readdir, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { lancerNavigateur, UA } from "../../engine/shared/navigateur.ts"
import { buildLoader } from "../../engine/deploy/tag/build.ts"
import type { ConfigServie, VarianteServie } from "../../engine/deploy/tag/loader.ts"
import { CLIENTS_ROOT, slugify } from "../../engine/shared/paths.ts"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test, type Express } from "../../engine/shared/campagne.ts"
import { ROOT, DIST, TSX, BASE_TAGS, dossier } from "./config.ts"
import { type Job, nouveauJob, dire, finir, lancer } from "./jobs.ts"

/** reconstruit loader + config avec TOUTES les specs des tests vivants de la page */
export async function construireTag(job: Job, c: string, camp: string): Promise<number> {
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
/** part, audience et lancement d'une variante servie : tests.json fait foi, jamais le build.
 *  L'expérience ne sort que pour un test qui collecte : un gagnant déployé sert tout le monde. */
const enrichie = (v: VarianteServie, t?: Test): VarianteServie => ({
  ...v,
  part: t && (t.etat === "live" || t.etat === "gagnant") ? t.part : 0,
  ciblage: t?.ciblage,
  experience: t && t.etat === "live" ? t.experience : undefined,
})

/** la part de trafic de chaque variante vient de tests.json, pas du build (qui met la même partout) */
export async function appliquerParts(c: string, camp: string) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const f = fichiersDe(d).configTag(slugify(meta.client ?? c))
  const cfg = await lireJson<any>(f, null)
  if (!cfg) return
  cfg.actif = true
  cfg.strict = true
  for (const v of cfg.variantes) {
    const t = tests.find((x) => x.id === v.nom)
    Object.assign(v, enrichie(v, t))
  }
  await ecrireJson(f, cfg)
}
/** ui/dist/v/<client>.json : la config servie, reconstruite depuis les tests.json de toutes les pages du client */
export async function ecrireConfigClient(c: string, camp: string) {
  const meta = await lireJson<any>(fichiersDe(dossier(c, camp)).meta, {})
  const slug = slugify(meta.client ?? c)
  await mkdir(join(DIST, "v"), { recursive: true })
  /* UN CLIENT, PLUSIEURS PAGES, UNE SEULE CONFIG.
   * La balise est par client (t/<client>.js) et sa config aussi (v/<client>.json), mais chaque
   * page construit la sienne dans son dossier : publier la config d'une page écrasait les
   * variantes de l'autre : le test de la page A disparaissait dès qu'on touchait à la page B.
   * On fusionne donc ici toutes les pages du client ; le loader sait déjà filtrer par URL. */
  const cdir = join(CLIENTS_ROOT, c)
  const fusion: any = { actif: true, strict: true, delaiMasque: 0, delaiMax: 0, variantes: [] as any[] }
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
      fusion.variantes.push(enrichie(v, t))
    }
  }
  if (!fusion.delaiMasque) fusion.delaiMasque = 1200
  if (!fusion.delaiMax) fusion.delaiMax = fusion.delaiMasque + 2000
  await ecrireJson(join(DIST, "v", `${slug}.json`), fusion)
}
/** copie loader + config dans ui/dist et pousse sur Vercel : l'URL que GTM connaît */
export async function publierTag(job: Job, c: string, camp: string): Promise<number> {
  const d = dossier(c, camp)
  const meta = await lireJson<any>(fichiersDe(d).meta, {})
  const slug = slugify(meta.client ?? c)
  await mkdir(join(DIST, "t"), { recursive: true }); await mkdir(join(DIST, "v"), { recursive: true })

  await ecrireConfigClient(c, camp)

  /* Le loader embarque une copie figée de la config (repli sous CSP) : copier celui du build
   * resservirait les variantes d'alors — arrêtées, re-partagées, déployées depuis. On le
   * régénère donc depuis la config fusionnée qui fait foi, strict compris. */
  const fusion = await lireJson<ConfigServie>(join(DIST, "v", `${slug}.json`), { actif: false, strict: true, delaiMasque: 1200, delaiMax: 3200, variantes: [] })
  await writeFile(join(DIST, "t", `${slug}.js`), await buildLoader(slug, BASE_TAGS, fusion))

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

/* ---------- la balise est-elle vraiment posée ? on ouvre la vraie page ---------- */
/** Ouvre la vraie page et cherche la balise. Le résultat est écrit dans express.json. */
export async function sonderBalise(c: string, camp: string, job?: Job): Promise<Express> {
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
    const ex: Express = { installe: !!info || demande, verifieLe: new Date().toISOString(), version: info?.version, mode: info?.mode, capacite: info?.capacite,
      detail: info ? `balise active (${info.mode}), version servie : ${info.version}` : demande ? "balise demandée par la page, mais pas encore exécutée au moment de la lecture" : "aucune trace de la balise sur la page : GTM ne l’a pas encore publiée" }
    await ecrireJson(fichiersDe(d).express, ex)
    return ex
  } finally { await browser.close() }
}

export async function verifier(c: string, camp: string): Promise<Job> {
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
