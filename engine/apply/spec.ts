/**
 * spec.ts — LE CONTRAT d'une variante : ce qu'un moment de réflexion doit produire.
 *
 * Une variante n'est PAS « une nouvelle page ». C'est **une hypothèse** et les quelques
 * éditions ancrées qui la testent. Le schéma force cette discipline : sans hypothèse, sans
 * métrique attendue et sans diagnostic d'origine, la sortie est refusée — on ne génère pas
 * « en mieux », on teste une idée nommée.
 *
 * Aujourd'hui ces fichiers sont écrits à la main (le brain n'existe pas). Demain c'est le
 * skill `variant` qui les produit, et cette validation zod est la même — c'est la règle
 * maison : toute sortie de skill passe un schéma avant d'être écrite.
 *
 * Règle d'or héritée de 4_structure/schema.ts : une édition pointe TOUJOURS vers une ancre
 * `data-lpws` existante. Jamais de sélecteur calculé, jamais de réécriture libre du HTML.
 */
import { z } from "zod"
import { Anchor } from "../clone/4_structure/schema.ts"

/**
 * Les cinq verbes. Volontairement peu nombreux : chacun préserve le design system du
 * client par construction, parce qu'aucun ne fabrique de markup.
 *
 *   set        remplacer texte / href / src / placeholder
 *   remove     retirer l'élément (nav d'une LP payante, badge bloat, section hors-sujet)
 *   move       déplacer avant/après une autre ancre (remonter la preuve au-dessus du pli)
 *   duplicate  CLONER un bloc existant et le replacer — c'est notre « ajouter une section » :
 *              on ne génère jamais de HTML, on réutilise celui du client et on le remplit.
 *              Les descendants de la copie sont re-clés avec un suffixe (`e42` → `e42-b`),
 *              donc les éditions suivantes de la même spec peuvent les viser.
 *   swap       échanger deux blocs de place (inverser deux sections)
 */
export const Edit = z.object({
  anchor: Anchor,
  /** pourquoi CETTE édition sert l'hypothèse (une ligne, lisible par un humain) */
  pourquoi: z.string().min(3),
  op: z.enum(["set", "remove", "move", "duplicate", "swap"]).default("set"),

  // op "set"
  text: z.string().optional(),
  href: z.string().optional(),
  src: z.string().optional(),
  placeholder: z.string().optional(),

  // op "move" / "duplicate" : où poser le bloc
  before: Anchor.optional(),
  after: Anchor.optional(),

  // op "duplicate" : suffixe des ancres de la copie ("b" → e42-b) ; "swap" : l'autre bloc
  as: z.string().regex(/^[a-z0-9]+$/).optional(),
  with: Anchor.optional(),
}).superRefine((e, ctx) => {
  const err = (message: string) => ctx.addIssue({ code: "custom", message })
  if (e.op === "set" && e.text === undefined && e.href === undefined
      && e.src === undefined && e.placeholder === undefined)
    err("op 'set' : il faut changer au moins un attribut (text/href/src/placeholder)")
  if ((e.op === "move" || e.op === "duplicate") && !e.before && !e.after)
    err(`op '${e.op}' : il faut dire où — 'before' ou 'after'`)
  if (e.op === "duplicate" && !e.as)
    err("op 'duplicate' : 'as' est requis (suffixe des ancres de la copie, ex. \"b\")")
  if (e.op === "swap" && !e.with)
    err("op 'swap' : 'with' est requis (l'ancre de l'autre bloc)")
})

/** Le diagnostic qui a JUSTIFIÉ la variante — sa traçabilité jusqu'à la preuve. */
export const Diagnostic = z.object({
  regle: z.string(),                    // identifiant/nom de la règle KB déclenchée
  signal: z.string(),                   // ce qui a été observé sur la page
  priorite: z.enum(["HIGH", "MEDIUM", "LOW"]),
  confiance: z.enum(["Very High", "High", "Medium", "Low", "Anecdotal"]),
  preuve: z.string(),                   // la source, remontable
})

export const VariantSpec = z.object({
  nom: z.string().regex(/^[a-z0-9-]+$/), // kebab-case : c'est un nom de dossier
  hypothese: z.string().min(20),         // « si on ... alors ... parce que ... »
  metrique: z.string().min(3),           // ce qui doit bouger
  risque: z.string().min(3),             // ce que ça peut casser (marge, qualité, légal)
  diagnostic: Diagnostic,
  edits: z.array(Edit).min(1),
})

export type Edit = z.infer<typeof Edit>
export type VariantSpec = z.infer<typeof VariantSpec>
