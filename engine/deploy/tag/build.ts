/**
 * build.ts — produit les DEUX pièces de la voie tag, et fait le travail difficile ICI.
 *
 *   loader.js          collé UNE FOIS dans le GTM du client, puis jamais retouché
 *   v/<client>.json    la config servie — c'est elle qu'on change pour piloter
 *
 * LA DÉCISION D'ARCHITECTURE DE CE FICHIER. La première version envoyait les empreintes au
 * navigateur du visiteur, qui refaisait le rapprochement à chaque chargement : ~700 ms de
 * calcul et 97 à 188 Ko de charge utile, page masquée 1,5 s, bandes non résolues. Disqualifiant
 * sur une page dont le Quality Score dépend de la vitesse.
 *
 * Alors on le fait ici. On ouvre la VRAIE page du client, on la laisse se former comme le
 * clone le fait, on rapproche une fois — le temps est gratuit à la construction — et on en
 * tire un sélecteur CSS court, vérifié unique. Le visiteur ne reçoit que ça.
 *
 * Un sélecteur peut périmer. Il voyage donc avec un TÉMOIN (rôle + début de texte) que le
 * runtime revérifie avant d'écrire : le sélecteur dit où regarder, le témoin dit si c'est bien
 * lui. Et une cible qu'on n'arrive pas à résoudre ICI fait échouer la construction, franchement,
 * plutôt que de partir en production et d'échouer en silence chez le visiteur.
 *
 * Usage : npm run tag -- <dossier-baseline> <spec.json> [...] [--part 50] [--base <url>]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { build } from "esbuild"
import { lancerNavigateur } from "../../shared/navigateur.ts"
import { VariantSpec } from "../../apply/spec.ts"
import { markDom } from "../../clone/1_acquire/mark.ts"
import { fingerprintDom, type Empreinte } from "../../clone/1_acquire/fingerprint.ts"
import { relier } from "../../clone/1_acquire/relink.ts"
import { autoScroll } from "../../clone/1_acquire/render.ts"
import { resoudreCibles, type Cible } from "./selector.ts"
import type { ConfigServie, EditTag, VarianteServie } from "./loader.ts"
import { slugify } from "../../shared/paths.ts"
import { step, fail, timed } from "../../shared/log.ts"

const SCOPE = "deploy/tag"

/**
 * Les verbes que le tag sait faire. `duplicate` en fait partie : c'est notre « ajouter une
 * section », et il ne génère aucun markup — il recopie un bloc du client. Seul `compose`
 * manque, parce qu'il FABRIQUE une section à partir du design system récolté : il demande
 * `design.ts`, donc la voie hébergée. Dit franchement, pas contourné.
 */
const VERBES_TAG = new Set(["set", "remove", "move", "swap", "duplicate"])

/** Le script collé dans GTM. Il ne contient AUCUNE variante : juste où aller les chercher. */
export async function buildLoader(client: string, base: string, cfg: ConfigServie): Promise<string> {
  const bundle = await build({
    entryPoints: [new URL("./loader.ts", import.meta.url).pathname],
    bundle: true, format: "iife", target: "es2019", minify: true, write: false,
    define: {
      __LPWS_BASE__: JSON.stringify(base),
      __LPWS_CLIENT__: JSON.stringify(client),
      // la config est AUSSI figée dans le loader : sur un site à CSP stricte le fetch est
      // refusé par le navigateur, et c'est le seul moyen que la variante s'applique quand même
      __LPWS_CFG__: JSON.stringify(cfg),
    },
    legalComments: "none",
  })
  return bundle.outputFiles[0].text
}

/**
 * Ouvre la page vivante, la laisse se former, et résout les ancres de la capture en sélecteurs.
 *
 * La préparation compte autant que le rapprochement : sans scroll, la moitié de la page n'est
 * pas rendue et les bandes, repérées par géométrie, n'existent pas encore. C'est exactement ce
 * qui faisait échouer l'ancienne version côté visiteur — ici on peut se le permettre.
 */
async function resoudreSurLeLive(
  url: string, capturees: Empreinte[], ancres: string[], budgetMasque: number,
): Promise<{ cibles: Record<string, Cible>; manquees: string[]; tardives: string[]; apparitionMax: number; urlFinale: string; perdParametres: boolean; stats: string }> {
  const browser = await lancerNavigateur()
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    })
    // cf. note __name dans 1_acquire/render.ts : esbuild nomme les fonctions injectées
    await page.addInitScript({ content: "window.__name = (f) => f" })
    // ON LIT LA PAGE TELLE QUE LE CLIENT L'A FAITE, PAS TELLE QUE NOTRE TAG LA MONTRE.
    // Un test déjà en ligne change le titre : sans `lpws=off`, la cible du titre ne se retrouve
    // plus (« e11 non résolue » sur la démo Relay, avec la variante 1 servie à 100 %).
    const urlNeutre = url + (url.includes("?") ? "&" : "?") + "lpws=off"
    await page.goto(urlNeutre, { waitUntil: "domcontentloaded", timeout: 60_000 })
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    // L'ADRESSE QUI COMPTE EST CELLE OÙ LE VISITEUR ATTERRIT, pas celle qu'on a tapée.
    // monday.com/work-management répond 301 vers monday.com/ : la config disait « page :
    // /work-management », le loader comparait à « / », concluait « pas cette page » et
    // servait l'original à tout le monde — 0 chargement sur 3, cible pourtant résolue.
    const atterrie = new URL(page.url()); atterrie.searchParams.delete("lpws"); atterrie.hash = ""
    const urlFinale = atterrie.toString()
    await page.evaluate(autoScroll)
    await page.waitForFunction(
      () => [...document.images].every((im) => !im.src || im.complete),
      undefined, { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(600)

    await page.evaluate(markDom)
    const vivantes: Empreinte[] = await page.evaluate(fingerprintDom)
    const rapport = relier(capturees, vivantes)
    const lien = new Map(rapport.retrouves.map((l) => [l.avant, l.apres]))

    const versLive = ancres.map((a) => lien.get(a)).filter((a): a is string => !!a)
    const derives = await page.evaluate(resoudreCibles, { ancres: versLive })

    const brutes: Record<string, Cible> = {}
    const manquees: string[] = []
    for (const a of ancres) {
      const vivante = lien.get(a)
      const c = vivante ? derives[vivante] : null
      if (c) brutes[a] = c
      else manquees.push(a)
    }

    /* ——— la seconde passe, et elle n'est pas optionnelle ———
     * Les sélecteurs ci-dessus sont dérivés sur une page complètement chargée et scrollée.
     * Le visiteur, lui, arrive sur une page à moitié formée. On rouvre donc la page telle
     * qu'elle s'ouvre et on vérifie chacun dessus, en repartant du témoin quand il ne tient
     * pas. Mesuré sur atlassian.com : le sélecteur par classe du titre tenait dès 200 ms, le
     * chemin positionnel du paragraphe ne désignait rien du tout. */
    // la page de la phase 1 reste lourde et animée : la fermer, sinon elle vole le processeur
    // à la seconde et fausse la mesure du « ce que voit le visiteur »
    await page.close()

    const tot = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await tot.addInitScript({ content: "window.__name = (f) => f" })
    await tot.goto(urlNeutre, { waitUntil: "domcontentloaded", timeout: 60_000 })

    /* ON MESURE QUAND LA CIBLE ARRIVE, ON NE LE DEVINE PAS.
     *
     * C'est la correction qui débloque les sites rendus par JavaScript. Le budget de masque
     * était une constante (800 ms, puis 1 500) : sur atlassian.com le titre du hero est
     * fabriqué par le JS du site et arrive après, le masque se levait avant, et l'édition
     * était alors refusée pour ne pas faire clignoter une zone déjà peinte. Résultat mesuré :
     * 1 chargement sur 3.
     *
     * Et masquer pendant que le site n'a lui-même rien affiché ne coûte RIEN : on révèle au
     * moment où sa page se serait affichée de toute façon. Le budget doit donc venir de la
     * page, pas d'une constante. On chronomètre ici, une fois, et on l'inscrit dans la config.
     */
    const apparitions: Record<string, number> = {}
    const t0 = Date.now()
    let auMasque: Record<string, Cible | null> = {}
    for (let i = 0; i < 24; i++) {
      auMasque = await tot.evaluate(resoudreCibles, { cibles: brutes })
      for (const [a, c] of Object.entries(auMasque))
        if (c && apparitions[a] === undefined) apparitions[a] = Date.now() - t0
      if (Object.keys(brutes).every((a) => apparitions[a] !== undefined)) break
      await tot.waitForTimeout(150)
    }

    const cibles: Record<string, Cible> = {}
    const tardives: string[] = []
    for (const a of Object.keys(brutes)) {
      const c = auMasque[a]
      if (c) {
        cibles[a] = c
        if (apparitions[a] > budgetMasque) tardives.push(a)
      } else manquees.push(a)
    }
    const apparitionMax = Math.max(0, ...Object.values(apparitions))

    /* LA REDIRECTION GARDE-T-ELLE LES PARAMÈTRES ?
     * monday.com/work-management?lpws=x répond 301 vers monday.com/ — sans le paramètre. Pour
     * nous, le lien d'aperçu meurt. Pour le client, c'est bien pire et il ne le sait pas : le
     * gclid de Google Ads est perdu de la même façon, donc son attribution aussi. C'est un
     * diagnostic qui vaut de l'or pour le buyer, on le sort ici. */
    let perdParametres = false
    if (urlFinale.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
      await tot.goto(url + (url.includes("?") ? "&" : "?") + "lpws=__sonde", { waitUntil: "domcontentloaded", timeout: 60_000 })
      perdParametres = !(await tot.evaluate(() => location.search.includes("lpws=__sonde")))
    }

    const s = rapport.stats
    return {
      cibles, manquees, tardives, apparitionMax, urlFinale, perdParametres,
      stats: `${s.retrouves}/${s.avant} ancres re-liées sur le live · ${s.ambigus} ambiguës · ${s.perdus} perdues`
        + ` · cible la plus tardive à ${apparitionMax} ms`,
    }
  } finally { await browser.close() }
}

/** Traduit une VariantSpec en variante servie : les ancres deviennent des sélecteurs vérifiés. */
async function traduire(
  specPath: string, part: number, page: string, cibles: Record<string, Cible>,
): Promise<VarianteServie> {
  const spec = VariantSpec.parse(JSON.parse(await readFile(specPath, "utf8")))
  const edits: EditTag[] = []
  for (const e of spec.edits) {
    const op = (e.op ?? "set") as EditTag["op"]
    const secondaire = e.with ?? e.before ?? e.after
    edits.push({
      op, cible: cibles[e.anchor!], cible2: secondaire ? cibles[secondaire] : undefined,
      sens: e.before ? "before" : e.after ? "after" : undefined,
      text: e.text, href: e.href, src: e.src, placeholder: e.placeholder,
      pourquoi: e.pourquoi,
    })
  }
  return { nom: spec.nom, part, page, edits }
}

export async function buildTag(
  baseline: string, specPaths: string[],
  opts: { part?: number; base?: string; delaiMasque?: number; delaiMax?: number; url?: string } = {},
) {
  const part = opts.part ?? 50
  const base = opts.base ?? "https://lpws.local"
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const url = opts.url ?? meta.source
  if (!url) fail(SCOPE, `pas de source dans ${baseline}/meta.json`)
  const client = slugify(meta.client ?? new URL(url).hostname)

  let capturees: Empreinte[]
  try { capturees = JSON.parse(await readFile(join(baseline, "anchors.json"), "utf8")) }
  catch { return fail(SCOPE, `pas d'anchors.json dans ${baseline} — recapturer la page`) }
  const parAncre = new Map(capturees.map((e) => [e.a, e]))

  // toutes les ancres dont les specs ont besoin, cibles principales ET secondaires
  const besoins = new Set<string>()
  for (const p of specPaths) {
    const spec = VariantSpec.safeParse(JSON.parse(await readFile(p, "utf8")))
    if (!spec.success)
      fail(SCOPE, `spec invalide (${p}) :\n` +
        spec.error.issues.map((i) => `  · ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n"))
    for (const e of spec.data.edits) {
      const op = e.op ?? "set"
      if (!VERBES_TAG.has(op))
        fail(SCOPE, `verbe '${op}' impossible en tag : seul 'compose' fabrique une section à ` +
          `partir du design system récolté, et ça demande la voie hébergée (npm run deploy).`)
      if (e.anchor) besoins.add(e.anchor)
      const sec = e.with ?? e.before ?? e.after
      if (sec) besoins.add(sec)
    }
  }
  for (const a of besoins)
    if (!parAncre.has(a)) fail(SCOPE, `ancre ${a} absente d'anchors.json — la spec et la capture ne vont pas ensemble`)

  const budgetMasque = opts.delaiMasque ?? 1500
  const { cibles, manquees, tardives, apparitionMax, urlFinale, perdParametres, stats } = await timed(SCOPE,
    `résolution sur la page vivante (${url})`,
    () => resoudreSurLeLive(url, capturees, [...besoins], budgetMasque))
  step(SCOPE, stats)
  const memeAdresse = (a: string, b: string) =>
    a.replace(/^(https?:\/\/)www\./, "$1").replace(/\/$/, "") === b.replace(/^(https?:\/\/)www\./, "$1").replace(/\/$/, "")
  if (!memeAdresse(url, urlFinale))
    step(SCOPE, `la page redirige : ${url} → ${urlFinale}. C'est cette adresse-là que la balise surveillera.`)
  if (perdParametres)
    step(SCOPE, `ATTENTION — la redirection PERD les paramètres d'URL. Le lien d'aperçu doit viser ${urlFinale}, `
      + `et surtout : un clic Google Ads vers ${url} perd son gclid en route — l'attribution du client est cassée `
      + `avant même le test. À lui dire : mettre ${urlFinale} en URL finale de ses annonces.`)
  /* LE BUDGET DOIT ABSORBER LA VARIANCE DU SITE, PAS SEULEMENT SA MESURE DU JOUR.
   *
   * La même page a été chronométrée à 971 ms et à 2 062 ms selon le moment de la construction.
   * Avec une marge fixe de 400 ms, le budget issu de la mesure basse laissait passer un
   * chargement sur neuf sans variante : la cible arrivait après la levée du masque, et écrire
   * à ce moment-là aurait fait clignoter la page, donc on abandonnait.
   *
   * Une marge PROPORTIONNELLE absorbe cette variance. Et elle ne coûte rien : le masque se
   * lève dès que la cible est posée, jamais à l'expiration du budget. Un budget large ne
   * rallonge le masque que sur les chargements où la page elle-même traîne — c'est-à-dire là
   * où elle n'avait de toute façon rien à montrer. Vérifié au LCP : écart de ±8 ms avec et
   * sans le tag, très en dessous du bruit du site (±2 000 ms).
   */
  const masqueRetenu = Math.round(Math.min(Math.max(apparitionMax * 1.8, apparitionMax + 800, 1_200), 4_000))
  if (tardives.length > 0)
    step(SCOPE, `budget de masque porté à ${masqueRetenu} ms : ${tardives.join(", ")} n'arrive(nt) `
      + `qu'après ${budgetMasque} ms (le site les fabrique en JavaScript). Masquer jusque-là ne `
      + `retarde rien, la page ne les avait pas affichées non plus.`)

  // échec franc ICI plutôt qu'en silence chez le visiteur : c'est tout l'intérêt de résoudre
  // à la construction
  if (manquees.length > 0)
    fail(SCOPE, `${manquees.length} cible(s) non résolue(s) : ${manquees.join(", ")}\n` +
      (tardives.length
        ? `  → ${tardives.join(", ")} n'existe(nt) PAS au chargement de la page, seulement plus tard.\n` +
          `    Le tag devrait masquer la page en attendant, ce qui coûte du LCP donc du Quality\n` +
          `    Score. Cette variante se livre par la voie hébergée (npm run deploy), pas par tag.\n`
        : "") +
      `  → sinon : la page du client a changé depuis la capture (recapturer), ou la cible est\n` +
      `    ambiguë (plusieurs éléments identiques) : viser un élément reconnaissable.`)

  const variantes: VarianteServie[] = []
  for (const p of specPaths) variantes.push(await traduire(p, part, urlFinale, cibles))

  const cfg: ConfigServie = {
    actif: true,
    delaiMasque: masqueRetenu,
    delaiMax: opts.delaiMax ?? masqueRetenu + 2_000,
    variantes,
  }

  const dir = join(baseline, "..", "tags")
  await mkdir(join(dir, "v"), { recursive: true })
  const fLoader = join(dir, "loader.js")
  const fConfig = join(dir, "v", `${client}.json`)

  const loader = await buildLoader(client, base, cfg)
  const entete = `/* LPWS — à coller UNE FOIS dans le Google Tag Manager de ${client}.\n`
    + `   Ensuite, lancer/changer/arrêter une variante ne touche plus jamais à GTM.\n`
    + `   Bouton stop : passer "actif" à false dans ${base}/v/${client}.json\n`
    + `   Si la CSP du site interdit ce domaine, le loader repasse sur la config figée ci-dessous\n`
    + `   et il faut alors RECOLLER ce fichier pour changer quoi que ce soit, stop compris.\n`
    + `   Prévisualiser : ?lpws=<nom-de-variante> · voir l'original : ?lpws=off */\n`
  await writeFile(fLoader, entete + loader)
  await writeFile(fConfig, JSON.stringify(cfg, null, 2))

  const octetsCfg = JSON.stringify(cfg).length
  step(SCOPE, `loader → ${fLoader} (${(loader.length / 1024).toFixed(1)} Ko, collé une seule fois)`)
  step(SCOPE, `config → ${fConfig} (${(octetsCfg / 1024).toFixed(1)} Ko) · ${variantes.map((v) => `${v.nom} ${v.part}%`).join(" · ")}`)
  for (const [a, c] of Object.entries(cibles)) step(SCOPE, `  ${a} → ${c.sel}`)
  return { fLoader, fConfig, cfg, client, loader, cibles, apparitionMax, urlFinale, perdParametres }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/build.ts")) {
  const args = process.argv.slice(2)
  const libres = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
  const [baseline, ...specs] = libres
  const opt = (n: string) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined }
  if (!baseline || specs.length === 0)
    fail(SCOPE, "usage : npm run tag -- <dossier-baseline> <spec.json> [...] [--part 50] [--base <url>]")
  await buildTag(baseline, specs, {
    part: opt("part") ? Number(opt("part")) : undefined,
    base: opt("base"), url: opt("url"),
    delaiMasque: opt("masque") ? Number(opt("masque")) : undefined,
    delaiMax: opt("delai") ? Number(opt("delai")) : undefined,
  })
}
