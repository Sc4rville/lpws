/**
 * campagne.ts — L'ARBORESCENCE D'UNE CAMPAGNE, déclarée une fois.
 *
 * Toute la donnée d'une page vit sous `clients/<client>/<campagne>/`. Chaque famille y lit ce
 * que la précédente a écrit : ce module est le contrat entre elles. Aucune famille, ni
 * l'interface, n'assemble elle-même un nom de fichier d'état.
 *
 *   baseline/            clone      le clone fidèle + meta.json, anchors.json, verify.json
 *   capture.json         ui         capture en cours (supprimé à la fin)
 *   context.json         buyer      l'annonce et le mode de vente
 *   signaux.json         variant    ce qui se compte sur la page (cache)
 *   jugement.json        variant    ce qui se juge (cache, modèle validé)
 *   diagnostic.json      variant    règles déclenchées
 *   propositions.json    variant    ce que le buyer choisit
 *   specs/<nom>.json     variant    VariantSpec prêtes pour apply
 *   variantes-refusees.json variant  propositions du modèle refusées par les garde-fous, et pourquoi
 *   variants/<nom>/      apply      variante rendue + delta
 *   tags/                deploy     loader.js + v/<client>.json
 *   tests.json           ui         l'état des tests (prep → live → stop)
 *   express.json         ui         la balise est-elle posée ?
 *   mesure.json          buyer      propriété GA4 + compte de service
 *   resultats.json       measure    sessions et conversions par version
 *   experiences.json     measure    le journal : chaque test arrêté, son échantillon, sa conclusion
 *   audit.json           audit      le diagnostic tracking de la vraie page
 *   surveillance/        surveille  un relevé daté par passage + alertes.json

 */
import { join } from "node:path"
import { z } from "zod"
import { Ciblage } from "../intent/ciblage.ts"

export function campagne(dir: string) {
  const baseline = join(dir, "baseline")
  return {
    dir,
    baseline,
    meta: join(baseline, "meta.json"),
    capture: join(baseline, "capture.html"),
    ancres: join(baseline, "anchors.json"),
    enCours: join(dir, "capture.json"),
    contexte: join(dir, "context.json"),
    signaux: join(dir, "signaux.json"),
    jugement: join(dir, "jugement.json"),
    diagnostic: join(dir, "diagnostic.json"),
    propositions: join(dir, "propositions.json"),
    specs: join(dir, "specs"),
    spec: (nom: string) => join(dir, "specs", `${nom}.json`),
    refusees: join(dir, "variantes-refusees.json"),
    variante: (nom: string) => join(dir, "variants", nom),
    tags: join(dir, "tags"),
    loader: join(dir, "tags", "loader.js"),
    configTag: (client: string) => join(dir, "tags", "v", `${client}.json`),
    tests: join(dir, "tests.json"),
    express: join(dir, "express.json"),
    mesure: join(dir, "mesure.json"),
    resultats: join(dir, "resultats.json"),
    experiences: join(dir, "experiences.json"),
    audit: join(dir, "audit.json"),
    intents: join(dir, "intents", "etat.json"),
    intentsConnexion: join(dir, "intents", "connexion.json"),
    surveillance: join(dir, "surveillance"),
    releve: (quand: string) => join(dir, "surveillance", `${quand}.json`),
    alertes: join(dir, "surveillance", "alertes.json"),
  }
}

const Plan = z.object({
  tauxBase: z.number(), tauxSuppose: z.boolean(), mde: z.number(), part: z.number(),
  controle: z.number(), variante: z.number(), jours: z.number().nullable(),
})

/** Un test du buyer : une variante, sa part de trafic, son cycle de vie. */
export const Test = z.object({
  id: z.string(),
  titre: z.string(),
  teste: z.string(),
  pourquoi: z.string(),
  etat: z.enum(["prep", "pret", "live", "stop", "echec", "gagnant"]),
  part: z.number(),
  creeLe: z.string(),
  lanceLe: z.string().optional(),
  /** la fin de la collecte (arrêt ou déploiement) : le verdict archivé se lit à cette date */
  finLe: z.string().optional(),
  /** le jour où un gagnant déployé a cessé d'être servi : il a occupé le client jusque-là (clients actifs du mois) */
  retireLe: z.string().optional(),
  /** l'horizon fixé AU LANCEMENT (engine/measure/stats.ts) : on ne le recalcule pas en regardant */
  plan: Plan.optional(),
  /** les lancements terminés qu'une relance a remplacés : leur fenêtre reste mesurable même sans ligne au journal */
  anciens: z.array(z.object({ lanceLe: z.string(), finLe: z.string(), part: z.number(), plan: Plan.optional(), experience: z.string().optional() })).optional(),
  edits: z.array(z.object({ anchor: z.string(), text: z.string(), avant: z.string() })),
  erreur: z.string().optional(),
  job: z.string().optional(),
  /** la règle du brain qui a produit ce test, si c'en est un */
  regle: z.string().optional(),
  ciblage: Ciblage.optional(),
  experience: z.string().regex(/^[a-f0-9]{32}$/).optional(),
})
export type Test = z.infer<typeof Test>

/** La balise Express vue sur la vraie page. */
export type Express = { installe: boolean; verifieLe?: string; version?: string; mode?: string; capacite?: string; detail?: string }

const Compte = z.object({ n: z.number(), c: z.number() })

/** Une expérience terminée : ce qui a été testé, sur qui, et ce qu'on a le droit d'en dire. */
export const Experience = z.object({
  test: z.string(),
  titre: z.string(),
  teste: z.string(),
  pourquoi: z.string(),
  edits: Test.shape.edits,
  part: z.number(),
  lanceLe: z.string().optional(),
  arreteLe: z.string(),
  controle: Compte.nullable(),
  variante: Compte.nullable(),
  luLe: z.string().nullable(),
  source: z.enum(["ga4", "exemple"]).nullable(),
  hausse: z.object({ lo: z.number(), mid: z.number(), hi: z.number() }).nullable(),
  conclusion: z.enum(["gagnant", "perdant", "non concluant", "trop tôt", "sans données", "répartition faussée"]),
  /** la règle du brain qui a produit la variante (absente pour un test écrit à la main) */
  regle: z.string().optional(),
  /** l'horizon fixé au lancement, et le verdict rendu à l'arrêt contre lui */
  plan: Test.shape.plan,
  verdict: z.string().optional(),
  /** la variante a été déployée à 100 % (reste vrai si l'original est remis ensuite) */
  deploye: z.boolean().optional(),
  ciblage: Test.shape.ciblage,
  experience: Test.shape.experience,
})
export type Experience = z.infer<typeof Experience>
