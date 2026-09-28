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
 *   variants/<nom>/      apply      variante rendue + delta
 *   tags/                deploy     loader.js + v/<client>.json
 *   tests.json           ui         l'état des tests (prep → live → stop)
 *   express.json         ui         la balise est-elle posée ?
 *   mesure.json          buyer      propriété GA4 + compte de service
 *   resultats.json       measure    sessions et conversions par version
 *   audit.json           audit      le diagnostic tracking de la vraie page
 *   surveillance/        surveille  un relevé daté par passage + alertes.json
 *
 * Et au niveau du client, `clients/<client>/` : experiences.json (la mémoire, toutes campagnes).
 */
import { join, dirname } from "node:path"
import { z } from "zod"

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
    variante: (nom: string) => join(dir, "variants", nom),
    tags: join(dir, "tags"),
    loader: join(dir, "tags", "loader.js"),
    configTag: (client: string) => join(dir, "tags", "v", `${client}.json`),
    tests: join(dir, "tests.json"),
    express: join(dir, "express.json"),
    mesure: join(dir, "mesure.json"),
    resultats: join(dir, "resultats.json"),
    audit: join(dir, "audit.json"),
    surveillance: join(dir, "surveillance"),
    releve: (quand: string) => join(dir, "surveillance", `${quand}.json`),
    alertes: join(dir, "surveillance", "alertes.json"),
    /** la mémoire est au niveau du client : une hypothèse perdue sur une page l'est pour ses autres pages */
    experiences: join(dirname(dir), "experiences.json"),
  }
}
export type Campagne = ReturnType<typeof campagne>

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
  edits: z.array(z.object({ anchor: z.string(), text: z.string(), avant: z.string() })),
  erreur: z.string().optional(),
  job: z.string().optional(),
  /** la règle du brain qui a produit ce test, si c'en est un */
  regle: z.string().optional(),
  /** le plan fixé au lancement : combien de visiteurs, combien de jours (measure/puissance.ts) */
  plan: z.object({
    taux: z.number(), visiteursJour: z.number(), part: z.number(), hausse: z.number(),
    nParVersion: z.number(), jours: z.number(), hausseEn8Semaines: z.number(), conclura: z.boolean(), phrase: z.string(),
  }).optional(),
  finLe: z.string().optional(),
})
export type Test = z.infer<typeof Test>

/** La balise Express vue sur la vraie page. */
export type Express = { installe: boolean; verifieLe?: string; version?: string; mode?: string; detail?: string }
