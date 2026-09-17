/**
 * test-relink.ts — la preuve : un paragraphe ajouté en haut de page décale toutes les ancres,
 * et le re-liage les retrouve quand même.
 *
 * Rejoue le scénario exact décrit dans la feuille de route (1.1.3) sur une vraie baseline :
 *   capture A  → ancres + empreintes
 *   mutation   → un <p> injecté en haut du body (ce que fait un client qui ajoute une bannière)
 *   capture B  → re-marquage complet, donc numérotation décalée
 *   relier(A,B) → doit retrouver les mêmes éléments malgré le décalage
 */
import { chromium } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { markDom } from "./mark.ts"
import { fingerprintDom, type Empreinte } from "./fingerprint.ts"
import { relier } from "./relink.ts"
import { fail } from "../../shared/log.ts"

const SCOPE = "clone/1_acquire/relink-check"
const dir = process.argv.slice(2).find((a) => !a.startsWith("--"))
if (!dir) fail(SCOPE, "usage : npm run relink:check -- <dossier-baseline>")

// même origine synthétique que le juge : en file:// Chromium refuse les fonts locales,
// et sans fonts la géométrie change, donc les sections aussi
const ORIGIN = "http://clone.lpws"
const MIME: Record<string, string> = {
  html: "text/html", css: "text/css",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", json: "application/json",
}

function nettoieMarquage(): void {
  document.querySelectorAll("[data-lpws]").forEach((e) => e.removeAttribute("data-lpws"))
}

function injecteBanniere(): void {
  const p = document.createElement("p")
  p.textContent = "Nouveau : notre rapport annuel est disponible."
  document.body.insertBefore(p, document.body.firstChild)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript({ content: "window.__name = (f) => f" })
await page.route(`${ORIGIN}/**`, async (route) => {
  const chemin = decodeURIComponent(new URL(route.request().url()).pathname)
  try {
    if (chemin.includes("..")) throw new Error("hors du dossier")
    const body = await readFile(join(dir, "." + chemin))
    const ext = chemin.split(".").pop()?.toLowerCase() ?? ""
    await route.fulfill({ body, contentType: MIME[ext] ?? "application/octet-stream" })
  } catch { await route.fulfill({ status: 404, body: "" }) }
})
await page.goto(`${ORIGIN}/capture.html`, { waitUntil: "load" })
await page.waitForTimeout(600)

// A : l'état tel que la capture l'a figé (on re-marque pour partir d'une base identique)
await page.evaluate(nettoieMarquage)
await page.evaluate(markDom)
const a: Empreinte[] = await page.evaluate(fingerprintDom)

// B : le client ajoute une bannière, la page est recapturée → tout se renumérote
await page.evaluate(injecteBanniere)
await page.evaluate(nettoieMarquage)
await page.evaluate(markDom)
const b: Empreinte[] = await page.evaluate(fingerprintDom)
await browser.close()

const r = relier(a, b)
const s = r.stats

console.log(`\nbaseline : ${dir}`)
console.log(`avant ${s.avant} ancres · après ${s.apres} ancres`)
console.log(`retrouvées ${s.retrouves} (dont ${s.deplaces} DÉPLACÉES) · ambiguës ${s.ambigus} · perdues ${s.perdus}`)
console.log(`taux de re-liage : ${((s.retrouves / s.avant) * 100).toFixed(1)} %`)

// ce que l'ancien système aurait fait : garder le même numéro, donc viser autre chose
const parAncre = new Map(b.map((e) => [e.a, e]))
const avantParAncre = new Map(a.map((e) => [e.a, e]))
let casses = 0
for (const [ancre, av] of avantParAncre) {
  const ap = parAncre.get(ancre)
  if (ap && ap.text !== av.text) casses++
}
console.log(`\nsans re-liage : ${casses} ancres sur ${a.length} désignaient un AUTRE contenu (échec silencieux)`)

const exemples = r.retrouves.filter((x) => x.deplace).slice(0, 5)
console.log(`\nexemples de rattrapage :`)
for (const e of exemples) {
  const av = avantParAncre.get(e.avant)
  console.log(`  ${e.avant} → ${e.apres}  (score ${e.score})  « ${(av?.text ?? "").slice(0, 55)} »`)
}

const perdusParles = r.perdus.filter((p) => p.text).slice(0, 5)
if (perdusParles.length) {
  console.log(`\nperdues avec du texte (à regarder) :`)
  for (const p of perdusParles) console.log(`  ${p.avant} ${p.role} « ${p.text.slice(0, 55)} »`)
}

/* ——— la vérité terrain : la mutation est connue, donc le bon appariement l'est aussi ———
 * Le <p> injecté est le premier enfant du body, donc le premier dans l'ordre du document :
 * il devient `e1` et décale tous les éléments de +1. Les sections, elles, ne bougent pas
 * (un paragraphe ne fait pas une bande). Tout lien qui s'écarte de ça est FAUX. */
const attendu = (ancre: string): string => {
  const m = ancre.match(/^e(\d+)$/)
  return m ? `e${Number(m[1]) + 1}` : ancre
}
let justes = 0, faux: string[] = []
for (const l of r.retrouves) {
  if (l.apres === attendu(l.avant)) justes++
  else faux.push(`${l.avant} → ${l.apres} (attendu ${attendu(l.avant)}, score ${l.score})`)
}
console.log(`\nVÉRITÉ TERRAIN`)
console.log(`  liens justes : ${justes}/${r.retrouves.length} (${((justes / Math.max(r.retrouves.length, 1)) * 100).toFixed(1)} %)`)
console.log(`  liens FAUX   : ${faux.length}`)
for (const f of faux.slice(0, 8)) console.log(`    ${f}`)
console.log(`\n  couverture juste sur l'ensemble : ${((justes / r.stats.avant) * 100).toFixed(1)} % des ancres d'avant`)
console.log(`  (le reste est déclaré ambigu ou perdu, donc REFUSÉ à l'édition, pas appliqué au hasard)`)
