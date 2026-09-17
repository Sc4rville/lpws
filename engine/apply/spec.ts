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
 * Les six verbes. Volontairement peu nombreux : chacun préserve le design system du client
 * par construction — les cinq premiers ne fabriquent aucun markup, et le sixième n'en
 * fabrique qu'avec les classes récoltées sur la page même.
 *
 *   set        remplacer texte / href / src / placeholder
 *   remove     retirer l'élément (nav d'une LP payante, badge bloat, section hors-sujet)
 *   move       déplacer avant/après une autre ancre (remonter la preuve au-dessus du pli)
 *   duplicate  CLONER un bloc existant et le replacer — c'est notre « ajouter une section » :
 *              on ne génère jamais de HTML, on réutilise celui du client et on le remplit.
 *              Les descendants de la copie sont re-clés avec un suffixe (`e42` → `e42-b`),
 *              donc les éditions suivantes de la même spec peuvent les viser.
 *   swap       échanger deux blocs de place (inverser deux sections)
 *   compose    CRÉER une section entière qui n'existe nulle part sur la page, à partir du
 *              DESIGN SYSTEM récolté (cf. design.ts) : on n'écrit aucune règle CSS, on
 *              réemploie les classes du client pour chaque rôle (titre, carte, bouton…).
 *              C'est la seule façon d'ajouter un type de section absent de la page.
 */
/** Le contenu d'une section composée — en langage humain, pas en HTML. */
export const Contenu = z.object({
  titre: z.string().min(2),
  accroche: z.string().optional(),
  colonnes: z.array(z.object({ titre: z.string().min(2), texte: z.string().min(2) })).optional(),
  cta: z.object({ label: z.string().min(2), href: z.string().optional() }).optional(),
})

/**
 * Ce que l'ancre désignait quand la spec a été écrite. Une ancre est un RANG : le client
 * ajoute une bannière et `e231` ne pointe plus le titre du héros mais un lien « Register
 * now ». Sans ce témoin, `apply` écrirait au mauvais endroit sans lever une erreur.
 * Relevé depuis `anchors.json` (cf. clone/1_acquire/fingerprint.ts).
 */
export const Attendu = z.object({
  role: z.enum(["heading", "text", "link", "media", "field", "bande", "autre"]),
  /** le texte au moment de l'écriture, normalisé — tronqué, c'est un témoin, pas une copie */
  text: z.string(),
})

export const Edit = z.object({
  /** la cible : requise partout SAUF pour `compose`, qui ne part d'aucun élément existant */
  anchor: Anchor.optional(),
  /** témoin d'identité de la cible — apply REFUSE si l'ancre désigne autre chose */
  attendu: Attendu.optional(),
  /** pourquoi CETTE édition sert l'hypothèse (une ligne, lisible par un humain) */
  pourquoi: z.string().min(3),
  op: z.enum(["set", "remove", "move", "duplicate", "swap", "compose"]).default("set"),

  // op "set"
  text: z.string().optional(),
  href: z.string().optional(),
  src: z.string().optional(),
  placeholder: z.string().optional(),

  // op "move" / "duplicate" : où poser le bloc
  before: Anchor.optional(),
  after: Anchor.optional(),

  // op "duplicate" : suffixe des ancres de la copie ("b" → e42-b) ; "compose" : nom de la
  // nouvelle section ("objections" → data-lpws="c-objections") ; "swap" : l'autre bloc
  as: z.string().regex(/^[a-z0-9]+$/).optional(),
  with: Anchor.optional(),

  // op "compose"
  gabarit: z.enum(["colonnes", "bandeau"]).optional(),
  ton: z.enum(["clair", "sombre"]).default("clair"),
  contenu: Contenu.optional(),
}).superRefine((e, ctx) => {
  const err = (message: string) => ctx.addIssue({ code: "custom", message })
  if (e.op !== "compose" && !e.anchor) err(`op '${e.op}' : 'anchor' est requis`)
  if (e.op === "compose") {
    if (!e.gabarit) err("op 'compose' : 'gabarit' est requis (colonnes | bandeau)")
    if (!e.contenu) err("op 'compose' : 'contenu' est requis")
    if (!e.as) err("op 'compose' : 'as' est requis (nom de la nouvelle section)")
    if (!e.before && !e.after) err("op 'compose' : il faut dire où — 'before' ou 'after'")
    if (e.gabarit === "colonnes" && !e.contenu?.colonnes?.length)
      err("gabarit 'colonnes' : il faut au moins une colonne dans 'contenu.colonnes'")
  }
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

export type Attendu = z.infer<typeof Attendu>
export type Contenu = z.infer<typeof Contenu>
export type Edit = z.infer<typeof Edit>
export type VariantSpec = z.infer<typeof VariantSpec>
