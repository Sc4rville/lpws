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

/** Ce qu'une édition peut changer sur l'élément ancré. Volontairement étroit. */
export const Edit = z.object({
  anchor: Anchor,
  /** pourquoi CETTE édition sert l'hypothèse (une ligne, lisible par un humain) */
  pourquoi: z.string().min(3),
  text: z.string().optional(),
  href: z.string().optional(),
  src: z.string().optional(),
  placeholder: z.string().optional(),
}).refine(
  (e) => e.text !== undefined || e.href !== undefined || e.src !== undefined || e.placeholder !== undefined,
  { message: "une édition doit changer au moins un attribut" },
)

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
