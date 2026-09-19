/**
 * lcp.ts — ce que le tag coûte VRAIMENT à la page, mesuré là où Google le regarde.
 *
 * Le juge du tag mesure le retard sur la CIBLE : la page révélée au moment où son titre serait
 * apparu de toute façon ne retarde rien, et c'est vrai. Mais le masque cache `body` en entier :
 * pendant ce temps le visiteur ne voit pas non plus le menu, le fond, les squelettes — tout ce
 * que la page aurait affiché plus tôt. Ce coût-là n'apparaît pas dans le retard sur la cible.
 *
 * Donc on mesure le Largest Contentful Paint, avec et sans le tag, plusieurs fois, et on
 * regarde l'écart des médianes. C'est ce chiffre qui se paie en Quality Score, pas le mien.
 *
 * Usage : npm run lcp -- <dossier-baseline> <spec.json> [--tirs 5]
 */
import { lancerNavigateur } from "../../shared/navigateur.ts"
import { type Browser } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { buildTag } from "./build.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "deploy/tag/lcp"
const BASE = "https://cfg.lpws.test"

const SONDE = `(function(){ if(window.top!==window.self) return;
  window.__lcp=0;
  try{ new PerformanceObserver(function(l){ var e=l.getEntries(); window.__lcp=Math.round(e[e.length-1].startTime) })
    .observe({type:'largest-contentful-paint',buffered:true}) }catch(e){}
})();`

async function mesure(b: Browser, url: string, loader: string | null, cfg: unknown, client: string, attente: number): Promise<number> {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.addInitScript({ content: SONDE })
  if (cfg) await p.route(`${BASE}/v/${client}.json`, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(cfg) }))
  if (loader) await p.addInitScript({ content: loader })
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
    await p.waitForTimeout(attente)
    return await p.evaluate(() => (window as unknown as { __lcp?: number }).__lcp ?? 0)
  } finally { await p.close() }
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export async function mesurerLcp(baseline: string, specPath: string, tirs = 5) {
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const url = meta.source
  const { cfg, client, loader } = await buildTag(baseline, [specPath], { part: 100, base: BASE })
  const attente = cfg.delaiMax + 1_500

  const b = await lancerNavigateur()
  try {
    const sans: number[] = []
    const avec: number[] = []
    // alterné, pour que la charge réseau et processeur pèse pareil sur les deux séries
    for (let i = 0; i < tirs; i++) {
      sans.push(await mesure(b, url, null, null, client, attente))
      avec.push(await mesure(b, url, loader, cfg, client, attente))
    }
    const mSans = median(sans), mAvec = median(avec)
    step(SCOPE, `sans le tag : ${sans.join(", ")} ms → médiane ${mSans}`)
    step(SCOPE, `avec le tag : ${avec.join(", ")} ms → médiane ${mAvec}`)
    step(SCOPE, `ÉCART DE LCP : ${mAvec - mSans > 0 ? "+" : ""}${mAvec - mSans} ms`)
    return { sans, avec, ecart: mAvec - mSans }
  } finally { await b.close() }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/lcp.ts")) {
  const args = process.argv.slice(2)
  const libres = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
  const [baseline, spec] = libres
  const i = args.indexOf("--tirs")
  if (!baseline || !spec) fail(SCOPE, "usage : npm run lcp -- <dossier-baseline> <spec.json> [--tirs 5]")
  await mesurerLcp(baseline, spec, i >= 0 ? Number(args[i + 1]) : 5)
}
