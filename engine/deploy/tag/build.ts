/**
 * build.ts — produit les DEUX pièces de la voie tag, et la séparation est tout l'intérêt.
 *
 *   loader.js          collé UNE FOIS dans le GTM du client, puis jamais retouché
 *   v/<client>.json    la config servie — c'est elle qu'on change pour piloter
 *
 * Avant cette séparation, chaque variante était un tag à recréer dans Google Tag Manager,
 * avec republication du conteneur. Personne ne teste dix variantes à ce prix-là, et tester
 * dix variantes est exactement ce qu'on vend. Maintenant : lancer, changer la part de trafic
 * ou tout arrêter ne touche plus jamais à GTM.
 *
 * Le tag embarque, pour chaque édition, l'EMPREINTE de sa cible relevée à la capture — pas son
 * numéro d'ancre, qui ne veut rien dire sur une page qu'on n'a pas capturée.
 *
 * Usage : npm run tag -- <dossier-baseline> <spec.json> [...] [--part 50] [--base <url>]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { build } from "esbuild"
import { VariantSpec } from "../../apply/spec.ts"
import type { Empreinte } from "../../clone/1_acquire/fingerprint.ts"
import type { ConfigServie, EditTag, VarianteServie } from "./loader.ts"
import { slugify } from "../../shared/paths.ts"
import { step, fail } from "../../shared/log.ts"

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
      // la config est AUSSI figée dans le loader : sur un site à CSP stricte, le fetch est
      // refusé par le navigateur et c'est le seul moyen que la variante s'applique quand même
      __LPWS_CFG__: JSON.stringify(cfg),
    },
    legalComments: "none",
  })
  return bundle.outputFiles[0].text
}

/** Traduit une VariantSpec en variante servie : les ancres deviennent des empreintes. */
async function traduire(baseline: string, specPath: string, part: number): Promise<VarianteServie> {
  const parsed = VariantSpec.safeParse(JSON.parse(await readFile(specPath, "utf8")))
  if (!parsed.success)
    fail(SCOPE, `spec invalide (${specPath}) :\n` +
      parsed.error.issues.map((i) => `  · ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n"))
  const spec = parsed.data

  let empreintes: Empreinte[]
  try { empreintes = JSON.parse(await readFile(join(baseline, "anchors.json"), "utf8")) }
  catch { return fail(SCOPE, `pas d'anchors.json dans ${baseline} — recapturer la page`) }
  const parAncre = new Map(empreintes.map((e) => [e.a, e]))

  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  if (!meta.source) fail(SCOPE, `pas de source dans ${baseline}/meta.json`)

  const edits: EditTag[] = []
  for (const e of spec.edits) {
    const op = e.op ?? "set"
    if (!VERBES_TAG.has(op))
      fail(SCOPE, `verbe '${op}' impossible en tag : seul 'compose' fabrique une section à partir ` +
        `du design system récolté, et ça demande la voie hébergée (npm run deploy).`)
    const emp = e.anchor ? parAncre.get(e.anchor) : undefined
    if (!emp) fail(SCOPE, `ancre ${e.anchor} absente d'anchors.json — la spec et la capture ne vont pas ensemble`)

    const secondaire = e.with ?? e.before ?? e.after
    const emp2 = secondaire ? parAncre.get(secondaire) : undefined
    if (secondaire && !emp2) fail(SCOPE, `ancre secondaire ${secondaire} absente d'anchors.json`)

    edits.push({
      op: op as EditTag["op"], emp, emp2,
      sens: e.before ? "before" : e.after ? "after" : undefined,
      text: e.text, href: e.href, src: e.src, placeholder: e.placeholder,
      pourquoi: e.pourquoi,
    })
  }
  return { nom: spec.nom, part, page: meta.source, edits }
}

export async function buildTag(
  baseline: string, specPaths: string[], opts: { part?: number; base?: string; delaiMax?: number } = {},
) {
  const part = opts.part ?? 50
  const base = opts.base ?? "https://lpws.local"
  const meta = JSON.parse(await readFile(join(baseline, "meta.json"), "utf8"))
  const client = slugify(meta.client ?? new URL(meta.source).hostname)

  const variantes: VarianteServie[] = []
  for (const p of specPaths) variantes.push(await traduire(baseline, p, part))

  /**
   * TOUTES les empreintes de la capture partent avec la config, pas seulement les cibles.
   *
   * Mesuré, et c'est contre-intuitif : envoyer les trois cibles d'une variante (même
   * entourées de 80 repères choisis) donne 0 cible résolue sur Jira, alors que le jeu
   * complet en résout 471 sur 471. La raison est dans le rapprochement lui-même : il
   * attribue un pour un. Quand les jumeaux d'un élément sont dans le jeu, ils se font
   * prendre par leur propre meilleur candidat et libèrent la cible ; quand ils manquent, ils
   * restent en concurrence pour toujours et la cible est déclarée ambiguë à vie.
   *
   * Le prix est raisonnable : 97 Ko pour Jira, 188 Ko pour HubSpot, soit 10 à 22 Ko une fois
   * gzippés sur le fil — et GTM sert son conteneur gzippé.
   */
  const amers: Empreinte[] = JSON.parse(await readFile(join(baseline, "anchors.json"), "utf8"))
  const cfg: ConfigServie = { actif: true, delaiMax: opts.delaiMax ?? 1500, amers, variantes }

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

  step(SCOPE, `loader → ${fLoader} (${(loader.length / 1024).toFixed(1)} Ko, collé une seule fois)`)
  step(SCOPE, `config → ${fConfig} · ${variantes.length} variante(s) : ${variantes.map((v) => `${v.nom} ${v.part}%`).join(" · ")} · ${cfg.amers.length} amers`)
  return { fLoader, fConfig, cfg, client, loader }
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
    base: opt("base"),
    delaiMax: opt("delai") ? Number(opt("delai")) : undefined,
  })
}
