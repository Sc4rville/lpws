/**
 * schema.ts — LE CONTRAT de la brique intention : ce qui entre (les termes de recherche
 * Google Ads) et ce qui sort (des groupes d'intention, et le pont mot-clé → intention).
 *
 * Deux moments, deux données, et le produit tient à ne pas les confondre :
 *   - APRÈS COUP, le rapport « termes de recherche » de Google Ads donne ce que les gens ont
 *     vraiment tapé, avec clics, coût et conversions par terme. C'est `Termes`.
 *   - AU CLIC, Google ne donne PAS la requête : seulement le mot-clé acheté qui a déclenché
 *     l'annonce (`{keyword}` via ValueTrack). C'est pour ça qu'`Intents` porte une table
 *     mot-clé → intention : c'est le pont entre l'analyse et le temps réel.
 *
 * Le classement en intentions est heuristique ici (mécanique) ; un skill pourra l'affiner,
 * et sa sortie devra passer par CE schéma avant d'être écrite.
 */
import { z } from "zod"

/**
 * Sept intentions, volontairement peu nombreuses : chaque groupe doit pouvoir porter un test
 * avec assez de conversions. Dix intentions à 900 clics par jour, c'est dix tests faméliques.
 */
export const INTENTIONS = [
  "transaction",  // prêt à agir : essai gratuit, démo, s'inscrire, acheter
  "alternative",  // cherche à remplacer un concurrent : « X alternative », « X vs Y »
  "prix",         // le budget décide : pricing, gratuit, pas cher, tarifs
  "comparaison",  // en train de choisir : best, top, meilleur, avis, comparatif
  "information",  // apprend : how to, qu'est-ce que, guide, exemple, template
  "marque",       // connaît déjà la marque : nom du client, login, téléchargement
  "categorie",    // requête générique de catégorie — le défaut, à affiner
] as const
export const Intention = z.enum(INTENTIONS)
export type Intention = z.infer<typeof Intention>

export const LIBELLES: Record<Intention, string> = {
  transaction: "Prêt à agir",
  alternative: "Alternative à un concurrent",
  prix: "Prix et budget",
  comparaison: "Comparaison et choix",
  information: "Information et apprentissage",
  marque: "Marque et navigation",
  categorie: "Catégorie générique",
}

/** Une ligne du rapport, normalisée — quelle que soit la langue et le format d'export. */
export const Terme = z.object({
  terme: z.string().min(1),
  /** le mot-clé acheté qui a déclenché l'annonce — c'est lui qu'on reverra au clic */
  motCle: z.string().optional(),
  correspondance: z.enum(["exact", "expression", "large", "inconnue"]).default("inconnue"),
  campagne: z.string().optional(),
  groupeAnnonces: z.string().optional(),
  campagneId: z.string().regex(/^\d+$/).optional(),
  groupeId: z.string().regex(/^\d+$/).optional(),
  impressions: z.number().int().nonnegative().default(0),
  clics: z.number().int().nonnegative().default(0),
  /** en unité monétaire du compte (les micros de l'API sont convertis à l'import) */
  cout: z.number().nonnegative().default(0),
  conversions: z.number().nonnegative().default(0),
})
export type Terme = z.infer<typeof Terme>

export const Termes = z.object({
  source: z.object({
    fichier: z.string(),
    format: z.enum(["csv-google-ads", "csv-script"]),
    langue: z.enum(["fr", "en"]),
    /** la période telle qu'écrite en tête d'export, si présente */
    periode: z.string().optional(),
    compte: z.string().regex(/^\d{10}$/).optional(),
    devise: z.string().regex(/^[A-Z]{3}$/).optional(),
    debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  importeLe: z.string(),
  termes: z.array(Terme).min(1),
  /** lignes du fichier non lues (en-têtes, totaux, vides) — dit, pas caché */
  ignorees: z.number().int().nonnegative().default(0),
})
export type Termes = z.infer<typeof Termes>

/** Le classement d'un terme : l'intention, et POURQUOI (le motif qui a décidé). */
export const Classement = z.object({
  terme: z.string(),
  intention: Intention,
  confiance: z.enum(["haute", "moyenne", "basse"]),
  indice: z.string(),
})
export type Classement = z.infer<typeof Classement>

const Stats = z.object({
  termes: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clics: z.number().int().nonnegative(),
  cout: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  /** null quand il n'y a pas de quoi le calculer — jamais 0 par défaut, ce serait un mensonge */
  tauxConv: z.number().nullable(),
  cpa: z.number().nullable(),
})

export const Groupe = z.object({
  intention: Intention,
  libelle: z.string(),
  /** les termes du groupe, du plus cliqué au moins cliqué */
  termes: z.array(z.string()),
  motsCles: z.array(z.string()),
  groupesAnnonces: z.array(z.string()),
  stats: Stats,
})
export type Groupe = z.infer<typeof Groupe>

export const Intents = z.object({
  client: z.string(),
  campagne: z.string(),
  calculeLe: z.string(),
  methode: z.enum(["heuristique", "skill"]),
  termes: z.number().int().nonnegative(),
  groupes: z.array(Groupe),
  /**
   * LE PONT VERS LE TEMPS RÉEL : mot-clé acheté → intention, par vote pondéré par les clics
   * des termes qu'il a déclenchés. Au clic, le tag lira `lpws_kw` et cherchera ici.
   */
  motsCles: z.record(z.string(), Intention),
  groupesAnnonces: z.record(z.string(), Intention),
  /** classés par défaut, avec peu de certitude — c'est la liste que le skill devra revoir */
  aRevoir: z.array(z.string()),
  notes: z.array(z.string()),
})
export type Intents = z.infer<typeof Intents>

/**
 * Le suffixe d'URL finale à coller UNE FOIS dans Google Ads (compte ou campagne). Google
 * remplace les accolades à chaque clic ; le tag lit ensuite `lpws_kw` pour retrouver
 * l'intention. Les autres servent à la mesure. Aucun de ces paramètres n'est la requête.
 */
export const SUFFIXE_URL_FINALE = "lpws_kw={keyword}&lpws_mt={matchtype}&lpws_ag={adgroupid}&lpws_cp={campaignid}&lpws_dev={device}&lpws_net={network}"
