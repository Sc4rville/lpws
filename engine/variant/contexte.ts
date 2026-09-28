/**
 * contexte.ts — LE CONTRAT `context.json` : ce que le media buyer nous dit de la campagne.
 *
 * Les neuf questions du brain (docs/brain.html), rendues supportables : deux sont
 * obligatoires parce que rien ne se juge sans elles (ce que promet l'annonce, comment se
 * conclut la vente), les autres ont un défaut raisonnable ou se déduisent de la page. Chaque
 * champ dit pourquoi il existe : c'est ce texte que l'interface affiche à côté.
 *
 * Aucune règle ne s'exécute sur une supposition silencieuse : un champ absent rend la règle
 * « non évaluable », jamais « fausse ».
 */
import { z } from "zod"

export const Niche = z.enum(["ecom", "saas", "b2b"])
export const Vente = z.enum(["libre-service", "commercial", "achat"])
export const Trafic = z.enum(["google-search", "google-shopping", "meta", "tiktok", "linkedin", "autre"])

export const Annonce = z.object({
  /** le titre de l'annonce, tel qu'il s'affiche (Google : les titres, Meta : le texte principal) */
  titre: z.string().min(3),
  /** la description ou le texte secondaire */
  description: z.string().optional(),
  /** les mots-clés achetés (recherche) ou l'audience visée (social) */
  motsCles: z.array(z.string()).default([]),
})

export const Contexte = z.object({
  /** OBLIGATOIRE — « Que promet la publicité ? » : la comparaison la plus utile qu'on sache faire */
  annonce: Annonce,
  /** OBLIGATOIRE — « Comment se conclut la vente ? » : c'est ce qui décide du bon bouton */
  vente: Vente,
  /** déduit de la vente si absent : achat → ecom, commercial → b2b, libre-service → saas */
  niche: Niche.optional(),
  /** « Qu'est-ce que vous vendez ? » : pré-rempli depuis la page, à corriger d'un mot */
  offre: z.string().optional(),
  /** « À qui ça s'adresse ? » : la preuve n'agit que si le visiteur s'y reconnaît */
  cible: z.string().optional(),
  /** « D'où vient le trafic ? » : défaut google-search, c'est notre cœur */
  trafic: Trafic.default("google-search"),
  /** « Quel est le panier ou le contrat moyen ? » en euros : plus c'est élevé, plus il faut lever le risque */
  panierMoyen: z.number().positive().optional(),
  /** « Quelle marge reste-t-il ? » en % : pour refuser une remise qui ferait vendre plus et gagner moins */
  marge: z.number().min(0).max(100).optional(),
  /** « Combien de visiteurs par mois ? » : en dessous d'un volume, aucun petit test ne conclut */
  visiteursMois: z.number().positive().optional(),
  /** taux de conversion actuel en % : avec visiteursMois, dit AVANT le lancement si un test peut conclure */
  tauxConversion: z.number().positive().max(100).optional(),
  /** coût par clic moyen, en € : le rapport client traduit le taux de conversion en coût par conversion */
  cpc: z.number().positive().optional(),
  /** « Qu'est-ce qu'on n'a pas le droit de dire ? » : les allégations sont étayées par le client, pas inventées */
  limites: z.string().optional(),
})

export type Contexte = z.infer<typeof Contexte>
export type Niche = z.infer<typeof Niche>

/** La niche quand le buyer ne l'a pas dite : le mode de vente la trahit presque toujours. */
export function nicheDe(c: Contexte): Niche {
  if (c.niche) return c.niche
  return c.vente === "achat" ? "ecom" : c.vente === "commercial" ? "b2b" : "saas"
}
