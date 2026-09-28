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
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { Contexte } from "./contexte.ts"
import { extraireSignaux, SignauxMecaniques } from "./signaux.ts"
import { corpsDe, juger, SignauxJuges } from "./jugement.ts"
import { diagnostiquer, type Diagnostic } from "./diagnostic.ts"
import { ecrireVariantes } from "./variantes.ts"
import { FAMILLES } from "./regles.ts"
import { step, fail, timed } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { ecrireJson, lireCache, lireValide } from "../shared/json.ts"
import { campagne as fichiersDe } from "../shared/campagne.ts"

const SCOPE = "variant"

export async function brain(campagne: string, opts: { refaire?: boolean; sansJugement?: boolean; sansVariantes?: boolean } = {}) {
  const f = fichiersDe(campagne)
  const base = f.baseline
  if (!existsSync(f.capture)) fail(SCOPE, `${f.capture} introuvable : cloner la page d'abord`)

  if (!existsSync(f.contexte))
    fail(SCOPE, `${f.contexte} manquant. Le brain ne devine pas ce que promet une annonce. Minimum :\n` +
      `  { "annonce": { "titre": "<titre de l'annonce>", "description": "...", "motsCles": ["..."] }, "vente": "libre-service" | "commercial" | "achat" }`)
  const ctx = await lireValide(Contexte, f.contexte).catch((e: Error) => fail(SCOPE, e.message))

  // 1. compter
  let m: SignauxMecaniques
  // un cache d'avant un nouveau capteur ne passe plus le schéma : on recompte, on ne plante pas
  const cache = opts.refaire ? null : await lireCache(SignauxMecaniques, f.signaux)
  if (cache) { m = cache; step(SCOPE, "signaux : cache") }
  else {
    if (!opts.refaire && existsSync(f.signaux)) step(SCOPE, "signaux : le cache date d'avant un nouveau capteur, on recompte")
    m = await timed(SCOPE, "signaux mécaniques (deux tailles d'écran)", () => extraireSignaux(base))
    await ecrireJson(f.signaux, m)
  }
  step(SCOPE, `titre « ${m.hero.titre.slice(0, 60)} » · ${m.ctas.length} boutons · nav ${m.nav.presente ? m.nav.liens + " liens" : "absente"} · ${m.sections.length} sections`)

  // 2. juger
  let j: SignauxJuges | null = null
  if (!opts.sansJugement) {
    j = opts.refaire ? null : await lireCache(SignauxJuges, f.jugement)
    if (j) step(SCOPE, "jugement : cache")
    else {
      const corps = corpsDe(await readFile(f.capture, "utf8"))
      j = await timed(SCOPE, "jugement (8 questions typées, sur le plan)", () => juger(m, ctx, corps))
      if (j) await ecrireJson(f.jugement, j)
    }
  }

  // 3. joindre
  const d: Diagnostic = diagnostiquer({ m, j }, ctx)
  await ecrireJson(f.diagnostic, d)
  step(SCOPE, `diagnostic : ${d.tests.length} test(s) possible(s), ${d.conseils.length} conseil(s), ${d.nonEvaluables.length} non évaluable(s), régime ${d.regime}`)
  for (const k of d.tests) step(SCOPE, `  TEST    ${String(k.score).padStart(3)} ${k.strategique ? "★" : " "} [${FAMILLES[k.famille]}] ${k.signal}`)
  for (const k of d.conseils) step(SCOPE, `  CONSEIL ${String(k.score).padStart(3)}   [${FAMILLES[k.famille]}] ${k.signal}`)
  if (d.nonEvaluables.length) step(SCOPE, `  non évaluables : ${d.nonEvaluables.map((x) => x.id).join(", ")}`)

  // 4. écrire
  if (opts.sansVariantes) return { d, variantes: [] }
  const langue = /lang="fr/i.test(await readFile(f.capture, "utf8").then((h) => h.slice(0, 400))) ? "français" : "la langue de la page (probablement anglais)"
  const variantes = await timed(SCOPE, "écriture des variantes (sur le plan)", () => ecrireVariantes(campagne, d.tests, m, ctx, langue))
  // ce que l'interface montre au buyer : la proposition, sa raison, sa source — il choisit
  const propositions = variantes.map((v) => {
    const k = d.tests.find((x) => x.id === v.regle)
    return { nom: v.nom, titre: v.titre, teste: v.teste, regle: v.regle, score: k?.score ?? 0,
      pourquoi: k?.pourquoi ?? "", signal: k?.signal ?? "", sources: k?.sources ?? [], fichier: v.fichier, proposeLe: new Date().toISOString() }
  })
  await ecrireJson(f.propositions, propositions)
  step(SCOPE, `${variantes.length} variante(s) prête(s) pour apply`)
  return { d, variantes }
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs(["--refaire", "--sans-jugement", "--sans-variantes"])
  const [campagne] = args.libres
  if (!campagne) fail(SCOPE, "usage : npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]")
  await brain(campagne, { refaire: args.drapeau("--refaire"), sansJugement: args.drapeau("--sans-jugement"), sansVariantes: args.drapeau("--sans-variantes") })
}
