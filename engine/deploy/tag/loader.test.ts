import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { chromium, type Browser } from "playwright"
import { buildLoader } from "./build.ts"
import type { ConfigServie } from "./loader.ts"
import type { Ciblage } from "../../intent/ciblage.ts"

const fraction = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}
const gclidDans = (experience: string, part: number, dedans: boolean) => {
  for (let i = 0; ; i++) {
    const id = "gclid-" + i
    const ok = fraction(experience + ":" + id) * 100 < part
    if (ok === dedans) return id
  }
}

const ciblage = (motCle: string, intention: Ciblage["intention"] = "prix"): Ciblage =>
  ({ intention, revision: "r1", routes: [{ motCle }] })

const CLIENT = "fixture"
let server: Server
let base: string
let browser: Browser
let servie: ConfigServie | null = null

const pageHtml = (extra = "") => `<!doctype html><html><head><meta charset="utf-8">
<script>window.dataLayer=[];window.gtag=(...a)=>{(window.__gtagCalls=window.__gtagCalls||[]).push(a)}</script>
<script src="/t/${CLIENT}.js"></script></head>
<body><p class="prix">Prix : 49 €</p><p class="accroche">Une accroche simple</p>${extra}</body></html>`

before(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x")
    if (u.pathname === `/v/${CLIENT}.json`) {
      if (!servie) { res.writeHead(500).end("ko"); return }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(servie))
    } else if (u.pathname === `/t/${CLIENT}.js`) {
      res.writeHead(200, { "content-type": "text/javascript" }).end(loaderJs)
    } else {
      res.writeHead(200, { "content-type": "text/html" }).end(pageHtml())
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  browser = await chromium.launch({ channel: "chromium", args: ["--no-sandbox"] })
})
after(async () => { await browser.close(); server.close() })

let loaderJs = ""
async function reconstruire(cfg: ConfigServie) {
  loaderJs = await buildLoader(CLIENT, base, cfg)
}
const editsPrix = [{ op: "set" as const, cible: { sel: ".prix", role: "text", texte: "prix : 49 €" }, text: "Prix : 29 €", pourquoi: "t" }]
const editsAlt = [{ op: "set" as const, cible: { sel: ".accroche", role: "text", texte: "une accroche simple" }, text: "L'alternative sérieuse", pourquoi: "t" }]

async function ouvrir(chemin: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const erreurs: string[] = []
  page.on("pageerror", (e) => erreurs.push(String(e)))
  await page.goto(base + chemin, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => (window as any).__lpws, { timeout: 8_000 })
  const lpws = await page.evaluate(() => (window as any).__lpws)
  const dl = await page.evaluate(() => (window as any).dataLayer)
  const gtag = await page.evaluate(() => (window as any).__gtagCalls ?? [])
  const prix = await page.locator(".prix").textContent()
  const accroche = await page.locator(".accroche").textContent()
  await ctx.close()
  return { lpws, dl, gtag, prix, accroche, erreurs }
}

test("une variante ciblée « prix » édite le prix, l'alternative ne reçoit rien", async () => {
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 100, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher"), experience: "expprix00000000000000000000000aa" },
    { nom: "v-alt", part: 100, page: base + "/", edits: editsAlt, ciblage: ciblage("alternative nike", "alternative"), experience: "expalt000000000000000000000000bb" },
  ] }
  servie = cfg
  await reconstruire(cfg)
  const r = await ouvrir("/?lpws_kw=chaussures+pas+cher")
  assert.equal(r.prix, "Prix : 29 €")
  assert.equal(r.accroche, "Une accroche simple", "l'édition de l'autre intention ne doit pas fuiter")
  assert.equal(r.lpws.version, "v-prix")
  assert.equal(r.lpws.intention, "prix")
  assert.equal(r.lpws.experience, "expprix00000000000000000000000aa")
  const ev = r.dl.find((e: any) => e.event?.startsWith("lpws"))
  assert.equal(ev.event, "lpws_variante")
  assert.equal(ev.lpws_intention, "prix")
  assert.equal(ev.lpws_experience, "expprix00000000000000000000000aa")
  assert.deepEqual(r.gtag.map((c: any) => c[1]), ["user_properties"])
  assert.equal(r.erreurs.length, 0)
})

test("le témoin du même ciblage porte la même intention et la même expérience", async () => {
  const exp = "expctrl00000000000000000000000cc"
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 50, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher"), experience: exp },
  ] }
  servie = cfg
  await reconstruire(cfg)
  const id = gclidDans(exp, 50, false)
  const r = await ouvrir(`/?lpws_kw=chaussures+pas+cher&gclid=${id}`)
  assert.equal(r.prix, "Prix : 49 €", "l'original est servi")
  assert.equal(r.lpws.version, "controle")
  assert.equal(r.lpws.intention, "prix")
  assert.equal(r.lpws.experience, exp)
  // même clic, même lancement : rechargement identique
  const r2 = await ouvrir(`/?lpws_kw=chaussures+pas+cher&gclid=${id}`)
  assert.equal(r2.lpws.version, "controle")
  assert.equal(r.erreurs.length + r2.erreurs.length, 0)
})

test("l'aperçu forcé émet lpws_apercu et ne touche pas les propriétés GA", async () => {
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 100, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher"), experience: "expp" },
  ] }
  servie = cfg
  await reconstruire(cfg)
  const r = await ouvrir("/?lpws=v-prix")
  assert.equal(r.prix, "Prix : 29 €")
  assert.equal(r.lpws.apercu, true)
  const ev = r.dl.find((e: any) => e.event?.startsWith("lpws"))
  assert.equal(ev.event, "lpws_apercu")
  assert.equal(ev.lpws_apercu, true)
  for (const cle of ["lpws_variante", "lpws_intention", "lpws_experience"])
    assert.equal(Object.hasOwn(ev, cle), false, "un aperçu ne remplace pas les variables GA dans GTM")
  assert.equal(r.gtag.length, 0, "aucune propriété utilisateur en aperçu")
  assert.equal(r.erreurs.length, 0)
})

test("sans paramètres d'intention, l'original est servi et annoncé", async () => {
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 100, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher") },
  ] }
  servie = cfg
  await reconstruire(cfg)
  const r = await ouvrir("/")
  assert.equal(r.prix, "Prix : 49 €")
  assert.equal(r.lpws.version, "controle")
  assert.equal(r.lpws.motif, "aucun test éligible")
  assert.equal(r.erreurs.length, 0)
})

test("réseau muet en mode strict : ni la config périmée ni les variantes embarquées ne resservent", async () => {
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 100, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher") },
  ] }
  await reconstruire(cfg)
  servie = null // le fetch échoue
  const ctx = await browser.newContext()
  // une config périmée en cache qui, elle, servirait la variante à 100 %
  await ctx.addInitScript((c: string) => localStorage.setItem("lpws_cfg:" + "fixture", c),
    JSON.stringify({ ...cfg }))
  const page = await ctx.newPage()
  const erreurs: string[] = []
  page.on("pageerror", (e) => erreurs.push(String(e)))
  await page.goto(base + "/?lpws_kw=chaussures+pas+cher", { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => (window as any).__lpws, { timeout: 8_000 })
  const lpws = await page.evaluate(() => (window as any).__lpws)
  assert.equal(await page.locator(".prix").textContent(), "Prix : 49 €")
  assert.equal(lpws.version, "controle")
  assert.equal(lpws.motif, "désactivé")
  assert.equal(erreurs.length, 0)
  await ctx.close()
})

test("hors page testée, le tag se tait : lpws_hors_test, propriétés d'expérience préservées", async () => {
  const cfg: ConfigServie = { actif: true, strict: true, delaiMasque: 300, delaiMax: 1_500, variantes: [
    { nom: "v-prix", part: 100, page: base + "/", edits: editsPrix, ciblage: ciblage("chaussures pas cher"), experience: "expp" },
  ] }
  servie = cfg
  await reconstruire(cfg)
  const r = await ouvrir("/merci") // aucune variante configurée sur cette page
  assert.equal(r.lpws.version, "controle")
  assert.equal(r.lpws.motif, "page hors test")
  const ev = r.dl.find((e: any) => e.event?.startsWith("lpws"))
  assert.equal(ev.event, "lpws_hors_test")
  for (const cle of ["lpws_variante", "lpws_intention", "lpws_experience"])
    assert.equal(Object.hasOwn(ev, cle), false, "le panier conserve les variables dataLayer du clic")
  assert.equal(r.gtag.length, 0, "l'exposé qui convertit ici garde sa variante")
  assert.equal(r.erreurs.length, 0)
})
