/**
 * run.ts — orchestrateur de la famille VARIANT, le brain : page + contexte → diagnostic → 3 variantes.
 *
 *   baseline/ + context.json
 *      → signaux.json      ce qu'on compte sur la page (script)
 *      → jugement.json     ce qu'on juge (modèle, questions typées, validé par schéma)
 *      → diagnostic.json   règles déclenchées, classées, en deux listes : tests et conseils
 *      → specs/*.json      trois variantes prêtes pour `apply`, au contrat de spec.ts
 *
 * La mémoire du client passe avant l'écriture : une règle dont la variante a perdu chez lui
 * (experiences.json, toutes pages), ou que le buyer a refusée, n'est pas reproposée — et on dit
 * pourquoi dans le diagnostic.
 *
 * Chaque étape est mise en cache dans le dossier de la campagne et se rejoue seule avec
 * `--refaire`. Sans context.json, on s'arrête et on dit exactement ce qu'il faut : le brain ne
 * devine pas ce que promet une annonce.
 *
 * DÉCLINER : une proposition existante → N variantes de plus sur le même constat, différentes de
 * tout ce qui a déjà été proposé pour lui, avec la consigne du buyer s'il en donne une. Mêmes
 * garde-fous, mêmes specs ; elles s'ajoutent aux propositions, juste après leur source.
 *
 * Usage : npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes]
 *         npm run brain -- clients/<client>/<campagne> --decliner <nom> [--consigne "plus court"] [--n 3]
 */
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { Contexte } from "./contexte.ts"
import { extraireSignaux, SignauxMecaniques } from "./signaux.ts"
import { corpsDe, juger, SignauxJuges } from "./jugement.ts"
import { diagnostiquer, type Constat, type Diagnostic } from "./diagnostic.ts"
import { ecrireVariantes, type VarianteProduite } from "./variantes.ts"
import { langueDe } from "./garde.ts"
import { FAMILLES } from "./regles.ts"
import { step, fail, timed } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { ecrireJson, lireCache, lireJson, lireValide } from "../shared/json.ts"
import { campagne as fichiersDe } from "../shared/campagne.ts"
import { aEviter, bilanRegles, historique } from "../measure/experience.ts"

const SCOPE = "variant"

export type Proposition = {
  nom: string; titre: string; teste: string; regle: string; score: number; pourquoi: string; signal: string
  sources: string[]; bilan?: Constat["bilan"]; fichier: string; proposeLe: string; refusee?: boolean; declineDe?: string; consigne?: string
}

/** ce que l'interface montre au buyer : la proposition, sa raison, sa source — il choisit */
const versPropositions = (variantes: VarianteProduite[], tests: Diagnostic["tests"], plus: Partial<Proposition> = {}): Proposition[] =>
  variantes.map((v) => {
    const k = tests.find((x) => x.id === v.regle)
    return { nom: v.nom, titre: v.titre, teste: v.teste, regle: v.regle, score: k?.score ?? 0,
      pourquoi: k?.pourquoi ?? "", signal: k?.signal ?? "", sources: k?.sources ?? [], bilan: k?.bilan, fichier: v.fichier, proposeLe: new Date().toISOString(), ...plus }
  })

export async function brain(campagne: string, opts: { refaire?: boolean; sansJugement?: boolean; sansVariantes?: boolean } = {}) {
  const f = fichiersDe(campagne)
  const base = f.baseline
  process.env.LPWS_CAMPAGNE = campagne // le journal des coûts range chaque appel modèle par page
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
  const d: Diagnostic = diagnostiquer({ m, j }, ctx, await bilanRegles(dirname(dirname(campagne))))
  const eviter = aEviter(await historique(dirname(campagne)))
  d.ecartes = d.tests.filter((k) => eviter.has(k.id)).map((k) => ({ id: k.id, signal: k.signal, raison: eviter.get(k.id)! }))
  d.tests = d.tests.filter((k) => !eviter.has(k.id))
  await ecrireJson(f.diagnostic, d)
  step(SCOPE, `diagnostic : ${d.tests.length} test(s) possible(s), ${d.conseils.length} conseil(s), ${d.nonEvaluables.length} non évaluable(s), régime ${d.regime}`)
  const bilan = (k: { bilan?: { gagnes: number; perdus: number; nuls: number } }) =>
    k.bilan ? ` (nos tests : ${k.bilan.gagnes} gagné(s), ${k.bilan.perdus} perdu(s), ${k.bilan.nuls} nul(s))` : ""
  for (const k of d.tests) step(SCOPE, `  TEST    ${String(k.score).padStart(3)} ${k.strategique ? "★" : " "} [${FAMILLES[k.famille]}] ${k.signal}${bilan(k)}`)
  for (const k of d.conseils) step(SCOPE, `  CONSEIL ${String(k.score).padStart(3)}   [${FAMILLES[k.famille]}] ${k.signal}`)
  for (const k of d.ecartes) step(SCOPE, `  ÉCARTÉ  ${k.id} : ${k.raison}`)
  if (d.nonEvaluables.length) step(SCOPE, `  non évaluables : ${d.nonEvaluables.map((x) => x.id).join(", ")}`)

  // 4. écrire
  if (opts.sansVariantes) return { d, variantes: [] }
  const langue = langueDe(await readFile(f.capture, "utf8"))
  const variantes = await timed(SCOPE, "écriture des variantes (sur le plan)", () => ecrireVariantes(campagne, d.tests, m, ctx, langue, d.regime))
  const propositions = versPropositions(variantes, d.tests)
  // les refus du buyer restent : ils sont la mémoire de ce qu'il ne veut pas (feuille de route 4.1)
  const refusees = (await lireJson<Proposition[]>(f.propositions, [])).filter((p) => p.refusee && !propositions.some((n) => n.nom === p.nom))
  await ecrireJson(f.propositions, [...propositions, ...refusees])
  step(SCOPE, `${variantes.length} variante(s) prête(s) pour apply`)
  return { d, variantes }
}

/** Le texte que chaque édition d'une spec écrit, ou ce qu'elle fait : la liste « déjà proposé ». */
async function ecritures(fichier: string): Promise<string[]> {
  const spec = await lireJson<{ edits?: Array<{ op?: string; text?: string; anchor: string; before?: string; after?: string }> }>(fichier, {})
  return (spec.edits ?? []).map((e) => !e.op || e.op === "set" ? e.text ?? "" : `${e.op} ${e.anchor}${e.before ? " avant " + e.before : e.after ? " après " + e.after : ""}`).filter(Boolean)
}

export async function decliner(campagne: string, source: string, opts: { n?: number; consigne?: string } = {}) {
  const f = fichiersDe(campagne)
  process.env.LPWS_CAMPAGNE = campagne
  const n = Number.isFinite(opts.n) ? Math.min(3, Math.max(1, Math.round(opts.n!))) : 3
  const consigne = opts.consigne?.trim().slice(0, 300) || undefined
  const ctx = await lireValide(Contexte, f.contexte).catch((e: Error) => fail(SCOPE, e.message))
  const m = await lireCache(SignauxMecaniques, f.signaux)
  const d = await lireJson<Diagnostic | null>(f.diagnostic, null)
  if (!m || !d) fail(SCOPE, "pas de diagnostic pour cette page : lancer l'analyse avant de décliner")
  const props = await lireJson<Proposition[]>(f.propositions, [])
  const p = props.find((x) => x.nom === source)
  if (!p) fail(SCOPE, `proposition inconnue : ${source}`)
  const k = d.tests.find((x) => x.id === p.regle)
  if (!k?.test) fail(SCOPE, `« ${p.titre} » ne vient pas d'un constat testable du diagnostic actuel (${p.regle}) : relancer l'analyse`)
  const deja = [...new Set((await Promise.all(props.filter((x) => x.regle === p.regle).map((x) => ecritures(x.fichier)))).flat())]
  step(SCOPE, `décliner « ${p.titre} » : ${n} variante(s) sur ${k.id}${consigne ? ` · consigne : ${consigne}` : ""} · ${deja.length} écriture(s) déjà proposée(s)`)

  const langue = langueDe(await readFile(f.capture, "utf8"))
  const variantes = await timed(SCOPE, "écriture des déclinaisons (sur le plan)", () => ecrireVariantes(campagne, [k], m, ctx, langue, d.regime, { n, consigne, deja }))
  const nouvelles = versPropositions(variantes, d.tests, { declineDe: source, ...(consigne ? { consigne } : {}) })
  // relues juste avant d'écrire : le buyer a pu refuser ou lancer une proposition pendant l'écriture
  const maintenant = await lireJson<Proposition[]>(f.propositions, [])
  const i = maintenant.findIndex((x) => x.nom === source)
  maintenant.splice(i < 0 ? maintenant.length : i + 1, 0, ...nouvelles)
  await ecrireJson(f.propositions, maintenant)
  step(SCOPE, `${nouvelles.length} déclinaison(s) ajoutée(s) aux propositions`)
  if (!nouvelles.length) fail(SCOPE, "aucune déclinaison n'a passé les garde-fous (détail dans variantes-refusees.json)")
  return nouvelles
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs(["--refaire", "--sans-jugement", "--sans-variantes"])
  const [campagne] = args.libres
  if (!campagne) fail(SCOPE, "usage : npm run brain -- clients/<client>/<campagne> [--refaire] [--sans-jugement] [--sans-variantes] | --decliner <nom> [--consigne \"…\"] [--n 3]")
  const source = args.option("--decliner")
  if (source) { await decliner(campagne, source, { n: Number(args.option("--n") ?? 3), consigne: args.option("--consigne") }); process.exit(0) }
  await brain(campagne, { refaire: args.drapeau("--refaire"), sansJugement: args.drapeau("--sans-jugement"), sansVariantes: args.drapeau("--sans-variantes") })
}
