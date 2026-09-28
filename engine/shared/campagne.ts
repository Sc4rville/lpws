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
 *   experiences.json     measure    chaque test terminé, son horizon, son issue : la mémoire du client
 */
import { join } from "node:path"
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
    experiences: join(dir, "experiences.json"),
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
  /** arrêt ou déploiement : la date à laquelle le test a cessé de collecter */
  finLe: z.string().optional(),
  /** l'horizon fixé au lancement (stats.ts) : on s'engage avant de regarder */
  plan: z.object({ tauxBase: z.number(), tauxSuppose: z.boolean(), mde: z.number(), part: z.number(), controle: z.number(), variante: z.number(), jours: z.number().nullable() }).optional(),
  edits: z.array(z.object({ anchor: z.string(), text: z.string(), avant: z.string() })),
  erreur: z.string().optional(),
  job: z.string().optional(),
})
export type Test = z.infer<typeof Test>

/** La balise Express vue sur la vraie page. */
export type Express = { installe: boolean; verifieLe?: string; version?: string; mode?: string; detail?: string }
