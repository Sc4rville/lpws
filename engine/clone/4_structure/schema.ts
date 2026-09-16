/**
 * schema.ts — LE CONTRAT `page.json` : la représentation structurée d'une landing page.
 *
 * Posé avant même que la structuration soit construite, parce que tout le produit repose
 * dessus : les variantes s'expriment comme des éditions de `page.json`, et `apply` réécrit
 * ces éditions dans le HTML via les ancres `data-lpws` (cf. 1_acquire/mark.ts).
 *
 * Règle d'or : un slot pointe TOUJOURS vers une ancre `data-lpws` existante. Jamais de
 * sélecteur CSS calculé, jamais de réécriture libre du HTML.
 *
 * La sortie du typage (réflexion, faite par le skill) est validée par ce schéma avant
 * d'être écrite — une structuration invalide ne doit jamais passer pour une fiche propre.
 */
import { z } from "zod"

/** Ancre vers le DOM capturé : la valeur d'un attribut data-lpws ("e42"). */
export const Anchor = z.string().regex(/^e\d+$/)

/** Un slot = un emplacement éditable par une variante. */
export const Slot = z.object({
  anchor: Anchor,
  kind: z.enum([
    "headline",    // titre principal de la section
    "subhead",     // sous-titre / accroche secondaire
    "body",        // paragraphe
    "bullet",      // item de liste (bénéfice, feature…)
    "cta",         // bouton / lien d'action — label éditable, href éditable
    "img",         // visuel
    "form-field",  // champ de formulaire (label/placeholder)
    "quote",       // témoignage, citation
    "stat",        // chiffre clé
    "other",
  ]),
  /** contenu actuel (celui du client) — la baseline que les variantes éditent */
  text: z.string().optional(),
  href: z.string().optional(), // cta uniquement
  src: z.string().optional(),  // img uniquement
})

/** Une section de haut niveau de la LP, typée pour raisonner en marketeur. */
export const Section = z.object({
  anchor: Anchor,
  type: z.enum([
    "nav", "hero", "logos", "features", "how-it-works", "social-proof",
    "pricing", "faq", "cta", "form", "footer", "other",
  ]),
  /** une ligne : ce que la section fait dans l'argumentaire (rempli au typage) */
  role: z.string().optional(),
  slots: z.array(Slot),
})

export const PageJson = z.object({
  source: z.string().url(),
  capturedAt: z.string(),
  sections: z.array(Section),
})

export type Slot = z.infer<typeof Slot>
export type Section = z.infer<typeof Section>
export type PageJson = z.infer<typeof PageJson>
