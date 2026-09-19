/**
 * run.ts — orchestrateur de la famille VARIANT, le brain : page + contexte → diagnostic → 3 variantes.
 *
 *   baseline/ + context.json
 *      → signaux.json      ce qu'on compte sur la page (script)
 *      → jugement.json     ce qu'on juge (modèle, questions typées, validé par schéma)
 *      → diagnostic.json   règles déclenchées, classées, en deux listes : tests et conseils
 *      → specs/*.json      trois variantes prêtes pour `apply`, au contrat de spec.ts
 *
 * Chaque étape est mise en cache dans le dossier de la campagne et se rejoue seule avec
 * `--refaire`. Sans context.json, on s'arrête et on dit exactement ce qu'il faut : le brain ne
 * devine pas ce que promet une annonce.
 *
 * Usage : npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]
 */
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { Contexte } from "./contexte.ts"
import { extraireSignaux, SignauxMecaniques } from "./signaux.ts"
import { corpsDe, juger, SignauxJuges } from "./jugement.ts"
import { diagnostiquer, type Diagnostic } from "./diagnostic.ts"
import { ecrireVariantes } from "./variantes.ts"
import { FAMILLES } from "./regles.ts"
import { step, fail, timed } from "../shared/log.ts"

const SCOPE = "variant"

export async function brain(campagne: string, opts: { refaire?: boolean; sansJugement?: boolean; sansVariantes?: boolean } = {}) {
  const base = join(campagne, "baseline")
  if (!existsSync(join(base, "capture.html"))) fail(SCOPE, `${base}/capture.html introuvable : cloner la page d'abord`)

  const fCtx = join(campagne, "context.json")
  if (!existsSync(fCtx))
    fail(SCOPE, `${fCtx} manquant. Le brain ne devine pas ce que promet une annonce. Minimum :\n` +
      `  { "annonce": { "titre": "<titre de l'annonce>", "description": "...", "motsCles": ["..."] }, "vente": "libre-service" | "commercial" | "achat" }`)
  const ctxParse = Contexte.safeParse(JSON.parse(await readFile(fCtx, "utf8")))
  if (!ctxParse.success)
    fail(SCOPE, `context.json invalide :\n` + ctxParse.error.issues.map((i) => `  · ${i.path.join(".")} : ${i.message}`).join("\n"))
  const ctx = ctxParse.data

  // 1. compter
  const fSig = join(campagne, "signaux.json")
  let m: SignauxMecaniques
  // un cache d'avant un nouveau capteur ne passe plus le schéma : on recompte, on ne plante pas
  const cache = !opts.refaire && existsSync(fSig) ? SignauxMecaniques.safeParse(JSON.parse(await readFile(fSig, "utf8"))) : null
  if (cache?.success) { m = cache.data; step(SCOPE, "signaux : cache") }
  else {
    if (cache) step(SCOPE, "signaux : le cache date d'avant un nouveau capteur, on recompte")
    m = await timed(SCOPE, "signaux mécaniques (deux tailles d'écran)", () => extraireSignaux(base))
    await writeFile(fSig, JSON.stringify(m, null, 2))
  }
  step(SCOPE, `titre « ${m.hero.titre.slice(0, 60)} » · ${m.ctas.length} boutons · nav ${m.nav.presente ? m.nav.liens + " liens" : "absente"} · ${m.sections.length} sections`)

  // 2. juger
  const fJug = join(campagne, "jugement.json")
  let j: SignauxJuges | null = null
  if (!opts.sansJugement) {
    if (!opts.refaire && existsSync(fJug)) { j = SignauxJuges.parse(JSON.parse(await readFile(fJug, "utf8"))); step(SCOPE, "jugement : cache") }
    else {
      const corps = corpsDe(await readFile(join(base, "capture.html"), "utf8"))
      j = await timed(SCOPE, "jugement (8 questions typées, sur le plan)", () => juger(m, ctx, corps))
      if (j) await writeFile(fJug, JSON.stringify(j, null, 2))
    }
  }

  // 3. joindre
  const d: Diagnostic = diagnostiquer({ m, j }, ctx)
  await writeFile(join(campagne, "diagnostic.json"), JSON.stringify(d, null, 2))
  step(SCOPE, `diagnostic : ${d.tests.length} test(s) possible(s), ${d.conseils.length} conseil(s), ${d.nonEvaluables.length} non évaluable(s), régime ${d.regime}`)
  for (const k of d.tests) step(SCOPE, `  TEST    ${String(k.score).padStart(3)} ${k.strategique ? "★" : " "} [${FAMILLES[k.famille]}] ${k.signal}`)
  for (const k of d.conseils) step(SCOPE, `  CONSEIL ${String(k.score).padStart(3)}   [${FAMILLES[k.famille]}] ${k.signal}`)
  if (d.nonEvaluables.length) step(SCOPE, `  non évaluables : ${d.nonEvaluables.map((x) => x.id).join(", ")}`)

  // 4. écrire
  if (opts.sansVariantes) return { d, variantes: [] }
  const langue = /lang="fr/i.test(await readFile(join(base, "capture.html"), "utf8").then((h) => h.slice(0, 400))) ? "français" : "la langue de la page (probablement anglais)"
  const variantes = await timed(SCOPE, "écriture des variantes (sur le plan)", () => ecrireVariantes(campagne, d.tests, m, ctx, langue))
  // ce que l'interface montre au buyer : la proposition, sa raison, sa source — il choisit
  const propositions = variantes.map((v) => {
    const k = d.tests.find((x) => x.id === v.regle)
    return { nom: v.nom, titre: v.titre, teste: v.teste, regle: v.regle, score: k?.score ?? 0,
      pourquoi: k?.pourquoi ?? "", signal: k?.signal ?? "", sources: k?.sources ?? [], fichier: v.fichier, proposeLe: new Date().toISOString() }
  })
  await writeFile(join(campagne, "propositions.json"), JSON.stringify(propositions, null, 2))
  step(SCOPE, `${variantes.length} variante(s) prête(s) pour apply`)
  return { d, variantes }
}

/* CLI */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("variant/run.ts")) {
  const args = process.argv.slice(2)
  const campagne = args.find((a) => !a.startsWith("--"))
  if (!campagne) fail(SCOPE, "usage : npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]")
  await brain(campagne, { refaire: args.includes("--refaire"), sansJugement: args.includes("--sans-jugement"), sansVariantes: args.includes("--sans-variantes") })
}
