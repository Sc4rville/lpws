/**
 * config.ts — LE CONTRAT de livraison : ce qu'il faut savoir du client pour publier une
 * variante sans lui coûter sa mesure.
 *
 * Une variante mise en ligne n'est pas un fichier de plus : c'est une page vers laquelle un
 * media buyer envoie du trafic PAYANT. Trois choses doivent survivre au trajet, et aucune
 * ne se devine :
 *   - l'identifiant de clic (gclid & co) — sans lui, Google ne sait plus quelle annonce a
 *     produit la vente, le reporting du buyer s'effondre et l'enchère automatique se dégrade ;
 *   - les pixels du client — le clone est servi sans JS, donc sans mesure si on ne la remet pas ;
 *   - le parcours — le clone n'a pas de formulaire vivant : ses CTA doivent pointer vers le
 *     vrai tunnel du client.
 *
 * Rien n'est optionnel par confort : ce qui manque est refusé ou rapporté, jamais supposé.
 */
import { z } from "zod"
import { Anchor } from "../clone/4_structure/schema.ts"

/** Les paramètres qu'une plateforme publicitaire colle à l'URL et qui DOIVENT survivre. */
export const PARAMS_CLIC = [
  "gclid", "gbraid", "wbraid",   // Google Ads (web, et iOS app sans gclid)
  "msclkid",                      // Microsoft Ads
  "fbclid", "ttclid", "li_fat_id", // Meta, TikTok, LinkedIn
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "keyword", "matchtype", "device", "campaignid", "adgroupid", "creative", "network", "placement",
] as const

export const Pixels = z.object({
  /** identifiant de mesure GA4 / Google Ads ("G-XXXX", "AW-XXXX") */
  gtag: z.array(z.string().regex(/^(G|AW|GT)-[A-Z0-9-]+$/i)).default([]),
  meta: z.string().regex(/^\d{10,20}$/).optional(),
  /**
   * Consent Mode v2 : en Europe, charger les pixels sans consentement est illégal ET
   * casse la mesure (Google jette les hits non consentis). On démarre donc en refus, et
   * c'est la bannière du client qui débloque. `false` = hors UE, assumé explicitement.
   */
  consentModeV2: z.boolean().default(true),
})

export const DeployConfig = z.object({
  /**
   * L'URL de la page d'origine chez le client. Sert de `canonical` : une variante ne doit
   * JAMAIS entrer en concurrence de référencement avec la page qu'elle teste.
   */
  canonical: z.string().url(),
  /**
   * Où le visiteur doit réellement aller en cliquant. Le clone est servi sans JS : ses
   * formulaires sont morts. Une variante honnête renvoie vers le vrai tunnel du client,
   * paramètres de clic recollés à l'arrivée.
   */
  cta: z.array(z.object({
    anchor: Anchor,
    href: z.string().url(),
  })).min(1, "au moins un CTA : une page d'atterrissage sans sortie ne se livre pas"),
  pixels: Pixels.default({ gtag: [], consentModeV2: true }),
  /**
   * Domaines vers lesquels décorer les liens sortants. Par défaut : l'hôte du canonical et
   * ceux des CTA — on ne colle pas l'identifiant de clic du buyer sur un lien tiers.
   */
  domainesSuivis: z.array(z.string()).default([]),
})

export type DeployConfig = z.infer<typeof DeployConfig>
