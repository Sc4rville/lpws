/**
 * build.ts — une VariantSpec → un tag autonome à coller dans le Google Tag Manager du client.
 *
 * C'est la voie de livraison SANS DNS ni hébergement : la variante s'applique sur la vraie
 * page, à la vraie URL. Le media buyer a déjà l'accès GTM (c'est par là qu'il pose son suivi
 * de conversion), donc l'entrée ne demande aucun nouvel accès à son client.
 *
 * Le tag embarque, pour chaque édition, l'EMPREINTE de sa cible relevée à la capture — pas
 * son numéro d'ancre, qui ne veut rien dire sur une page qu'on n'a pas capturée. Le
 * rapprochement se fait dans le navigateur, avec exactement le même calcul que hors ligne.
 *
 * Usage : npm run tag -- <dossier-baseline> <spec.json> [--part 50] [--delai 1500]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { build } from "esbuild"
import { VariantSpec } from "../../apply/spec.ts"
import type { Empreinte } from "../../clone/1_acquire/fingerprint.ts"
import type { ConfigTag, EditTag } from "./runtime.ts"
import { step, fail } from "../../shared/log.ts"

const SCOPE = "deploy/tag"

/**
 * Les verbes que le tag sait faire. `duplicate` en fait partie : c'est notre « ajouter une
 * section », et il ne génère aucun markup — il recopie un bloc du client. Seul `compose`
 * manque, parce qu'il FABRIQUE une section à partir du design system récolté : il demande
 * `design.ts`, donc la voie hébergée. Dit franchement, pas contourné.
 */
const VERBES_TAG = new Set(["set", "remove", "move", "swap", "duplicate"])

export async function buildTag(
  baseline: string, specPath: string, part = 50, delaiMax = 1500,
): Promise<{ fichier: string; edits: number; octets: number }> {
  const parsed = VariantSpec.safeParse(JSON.parse(await readFile(specPath, "utf8")))
  if (!parsed.success)
    fail(SCOPE, `spec invalide (${specPath}) :\n` +
      parsed.error.issues.map((i) => `  · ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n"))
  const spec = parsed.data

  let empreintes: Empreinte[]
  try { empreintes = JSON.parse(await readFile(join(baseline, "anchors.json"), "utf8")) }
  catch { return fail(SCOPE, `pas d'anchors.json dans ${baseline} — recapturer la page`) }
  const parAncre = new Map(empreintes.map((e) => [e.a, e]))

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

  const cfg: ConfigTag = { nom: spec.nom, part, delaiMax, edits }

  const bundle = await build({
    entryPoints: [new URL("./runtime.ts", import.meta.url).pathname],
    bundle: true, format: "iife", target: "es2019", minify: true, write: false,
    define: { __LPWS__: JSON.stringify(cfg) },
    legalComments: "none",
  })
  const code = bundle.outputFiles[0].text

  const entete = `/* LPWS — variante "${spec.nom}"\n`
    + `   hypothèse : ${spec.hypothese}\n`
    + `   métrique  : ${spec.metrique}\n`
    + `   risque    : ${spec.risque}\n`
    + `   ${part}% du trafic · révélation forcée à ${delaiMax}ms · abandon si une cible est ambiguë */\n`

  const dir = join(baseline, "..", "tags")
  await mkdir(dir, { recursive: true })
  const fichier = join(dir, `${spec.nom}.js`)
  await writeFile(fichier, entete + code)

  step(SCOPE, `${spec.nom} → ${fichier} · ${edits.length} édition(s) · ${(code.length / 1024).toFixed(1)} Ko`)
  return { fichier, edits: edits.length, octets: code.length }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tag/build.ts")) {
  const args = process.argv.slice(2)
  const [baseline, spec] = args.filter((a) => !a.startsWith("--"))
  const val = (n: string, d: number) => {
    const i = args.indexOf("--" + n)
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d
  }
  if (!baseline || !spec) fail(SCOPE, "usage : npm run tag -- <dossier-baseline> <spec.json> [--part 50] [--delai 1500]")
  await buildTag(baseline, spec, val("part", 50), val("delai", 1500))
}
