/**
 * check.ts — LE JUGE du tag, et le seul test de la machine qui se fait contre la VRAIE page.
 *
 * Tout le reste se juge contre une capture. Ici on juge contre le site tel qu'il est en ce
 * moment, que personne n'a marqué ni figé — c'est-à-dire la seule chose que le visiteur verra.
 *
 * Quatre scénarios, parce que ce sont les quatre promesses faites au media buyer :
 *   variante  l'empreinte retrouve la cible sur un DOM jamais capturé, et l'édition atterrit
 *             au bon endroit (on RELIT la page, on ne croit pas le tag sur parole)
 *   témoin    sans tag, la page est intacte — une variante qui fuit détruit la comparaison
 *   aperçu    `?lpws=<nom>` force la variante : le lien qu'il envoie à son client avant de
 *             dépenser un euro, même avec 0 % du trafic
 *   stop      `actif: false` coupe tout, sans republier le conteneur GTM
 *
 * La config est servie par interception : on prouve le chemin réseau du loader sans rien
 * héberger.
 *
 * Usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]
 */
import { chromium } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { buildTag } from "./build.ts"
import type { ConfigServie } from "./loader.ts"
import { VariantSpec } from "../../apply/spec.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "deploy/tag/check"
const BASE = "https://cfg.lpws.test"

type Vu = {
  version: string; applique: number; abandons: string[]; masqueMs: number; mode: string
  cspBloque: boolean; textes: string[]; remises: number
}

async function ouvrir(
  url: string, loader: string | null, cfg: ConfigServie | null, client: string, suffixe: string,
  attente: number,
): Promise<Vu> {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  })
  // la CSP du site peut refuser notre domaine AVANT que l'interception serve quoi que ce soit :
  // on note le refus, c'est lui qui décide du mode piloté ou figé
  let cspBloque = false
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspBloque = true
  })
  if (cfg) {
    await page.route(`${BASE}/v/${client}.json`, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(cfg) }))
  }
  if (loader) await page.addInitScript({ content: loader })

  try {
    await page.goto(url + (url.includes("?") ? "&" : "?") + suffixe,
      { waitUntil: "domcontentloaded", timeout: 45_000 })
    // ATTENDRE QUE LE TAG AIT FINI, pas un délai rond.
    // Le juge lisait à 3 000 ms alors que le budget du tag peut aller à 4 825 ms sur un site
    // rendu en JavaScript : il enregistrait « 0 édition » sur des chargements qui posaient la
    // variante juste après. Trois passages de suite accusaient le tag d'un défaut qui était le
    // mien — 8/9 rapportés, 9/9 réels.
    await page.waitForTimeout(attente)
    const vu = await page.evaluate(() => {
      const w = window as unknown as {
        __lpws?: { version: string; applique: number; abandons: string[]; mode: string; remises?: number }
        __lpwsMasque?: number
      }
      return {
        version: w.__lpws?.version ?? "aucun-tag",
        applique: w.__lpws?.applique ?? 0,
        abandons: w.__lpws?.abandons ?? [],
        masqueMs: w.__lpwsMasque ?? 0,
        mode: w.__lpws?.mode ?? "aucun",
        remises: w.__lpws?.remises ?? 0,
        // pas de troncature : un texte de variante plus long que la limite passait pour absent
        textes: [...document.querySelectorAll("[data-lpws-edited],[data-lpws-added]")]
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()),
      }
    })
    return { ...vu, cspBloque }
  } finally { await browser.close() }
}

export async function checkTag(baseline: string, specPaths: string[], urlLive?: string) {
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const url = urlLive ?? meta.source
  if (!url) fail(SCOPE, "pas d'URL live : passer --url <https://…>")

  // 100 % pour que le scénario « variante » tombe toujours du bon côté ; l'aperçu et le stop
  // sont testés séparément, eux, avec 0 %
  const { cfg, client, loader, apparitionMax } = await buildTag(baseline, specPaths, { part: 100, base: BASE })
  const spec = VariantSpec.parse(JSON.parse(await readFile(specPaths[0], "utf8")))
  const attendus = spec.edits.map((e) => e.text).filter((t): t is string => !!t)


  // marge au-delà du budget du tag : on lit APRÈS qu'il ait rendu son verdict
  const attente = cfg.delaiMax + 1_500
  step(SCOPE, `page vivante : ${url} · lecture à ${attente} ms`)

  /* TROIS FOIS, PAS UNE.
   * Un site vivant n'est pas déterministe : réseau, charge processeur, expériences maison.
   * Un tir unique m'a fait annoncer « valide » puis « refusé » sur la même page à quelques
   * minutes d'écart. Ce qu'un media buyer achète, c'est la fiabilité : on la mesure. */
  const tirs: Vu[] = []
  for (let i = 0; i < 3; i++) tirs.push(await ouvrir(url, loader, cfg, client, `gclid=JUGE-1-${i}`, attente))
  const reussis = tirs.filter((t) => t.applique > 0)
  const variante = reussis[0] ?? tirs[0]
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const temoin = await ouvrir(url, null, null, client, "gclid=JUGE-2", attente)
  const cfg0 = { ...cfg, variantes: cfg.variantes.map((v) => ({ ...v, part: 0 })) }
  const apercu = await ouvrir(url, loader, cfg0, client, `lpws=${spec.nom}`, attente)
  const stop = await ouvrir(url, loader, { ...cfg, actif: false }, client, "gclid=JUGE-4", attente)

  const vus = variante.textes.join(" | ")
  const poses = attendus.filter((t) => vus.includes(t))
  const fuites = attendus.filter((t) => temoin.textes.some((x) => x.includes(t)))

  const echecs: string[] = []
  if (reussis.length < 3)
    echecs.push(`fiabilité ${reussis.length}/3 : la variante ne s'applique pas à tous les chargements`)
  if (variante.version === "aucun-tag") echecs.push("le loader ne s'est pas exécuté")
  if (variante.abandons.length > 0)
    echecs.push(`cibles non résolues sur la page vivante : ${variante.abandons.join(" · ")}`)
  if (poses.length !== attendus.length)
    echecs.push(`${attendus.length - poses.length}/${attendus.length} texte(s) attendus absents de la page rendue`)
  if (fuites.length > 0) echecs.push(`FUITE sur le témoin : ${fuites.join(", ")}`)
  /* LE BON CHIFFRE N'EST PAS LA DURÉE DU MASQUE.
   * Sur atlassian.com la cible n'existe qu'à ~2 000 ms, fabriquée par le JavaScript du site :
   * masquer jusque-là ne retarde rien, on révèle au moment où la page se serait affichée de
   * toute façon. Ce qu'on coûte vraiment, c'est l'ÉCART entre l'apparition naturelle de la
   * cible (chronométrée à la construction) et notre révélation. C'est lui qui se paie en LCP,
   * donc en Quality Score — et il peut être négatif, on révèle alors avant la page. */
  const masqueMedian = median(tirs.map((t) => t.masqueMs))
  const surcout = masqueMedian - apparitionMax
  /* CE CHIFFRE EST INDICATIF, IL NE REFUSE PLUS.
   * Il compare deux mesures bruitées : la durée du masque, et une apparition chronométrée une
   * seule fois à la construction (971, 1 639, 1 763, 1 909 ou 2 062 ms selon le moment, sur la
   * MÊME page). Leur différence hérite des deux bruits et déclenchait de fausses alertes sur
   * des chargements parfaitement sains. Le verdict de vitesse appartient à `npm run lcp`, qui
   * mesure le Largest Contentful Paint avec et sans le tag, en tirs alternés : écart de ±8 ms
   * sur les deux sites du corpus, très en dessous du bruit de la page (±2 000 ms). */
  if (apercu.applique === 0) echecs.push("l'aperçu ?lpws=<nom> n'applique rien à 0 % — le lien de démo au client serait mort")
  // sous CSP le stop distant ne PEUT pas arriver : ce n'est pas un bug du tag, c'est une
  // limite du site, et elle doit être dite au buyer à l'installation — pas découverte après
  if (stop.applique > 0 && !stop.cspBloque)
    echecs.push("le bouton stop ne coupe pas — inacceptable, c'est la condition de confiance")

  const ok = echecs.length === 0
  step(SCOPE, `mode     : ${variante.mode}${variante.cspBloque ? " (CSP du site : config distante refusée)" : ""}`)
  step(SCOPE, `variante : ${reussis.length}/3 chargements appliquent · `
    + `masque médian ${masqueMedian} ms · cible naturelle à ${apparitionMax} ms`
    + ` → retard indicatif ${surcout > 0 ? surcout : 0} ms (verdict vitesse : npm run lcp)`
    + (variante.remises ? ` · ${variante.remises} remise(s) après re-rendu du site` : ""))
  step(SCOPE, `témoin   : ${temoin.applique} édition(s) (doit être 0)`)
  step(SCOPE, `aperçu   : ${apercu.applique} édition(s) à 0 % de trafic (doit être > 0)`)
  step(SCOPE, `stop     : ${stop.applique} édition(s)${stop.cspBloque ? " — CSP : le stop distant n'arrive pas, il faut recoller le loader" : " (doit être 0)"}`)
  for (const e of echecs) step(SCOPE, `ÉCHEC : ${e}`)
  step(SCOPE, ok ? "TAG VALIDE sur la page vivante" : "tag REFUSÉ")
  return { ok, variante, temoin, apercu, stop, echecs }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/check.ts")) {
  const args = process.argv.slice(2)
  const i = args.indexOf("--url")
  const libres = args.filter((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"))
  const [baseline, ...specs] = libres
  if (!baseline || specs.length === 0)
    fail(SCOPE, "usage : npm run tag:check -- <dossier-baseline> <spec.json> [--url <live>]")
  const r = await checkTag(baseline, specs, i >= 0 ? args[i + 1] : undefined)
  if (!r.ok) process.exit(1)
}
