/**
 * compte.ts — LE COMPTE DU BUYER : son palier, son essai, son code partenaire, sa marque (pour
 * le rapport en marque blanche) et ses MANDATS (docs/recherche/business-model.md §4–7 ;
 * feuille de route 3.4, 3.5, 3.6).
 *
 * Une instance LPWS = un compte buyer (clients/compte.json). Le multi-utilisateur (plusieurs
 * buyers d'une agence, des droits par personne) est une décision d'hébergement encore ouverte :
 * ce module en pose le contrat — ce qu'un compte a le droit de faire — sans l'inventer.
 *
 * LE MANDAT n'est pas une option : un buyer ne met rien en ligne sur la page d'un client qui ne
 * l'a pas mandaté (§7 : c'est ce qui distingue l'Atelier d'un outil de scraping). Il le déclare
 * une fois par client, daté, avec le nom de qui l'a donné.
 */
import { readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { lireJson, ecrireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import { CLIENTS_ROOT } from "../shared/paths.ts"
import { PALIERS, ESSAI_JOURS, PALIER_ESSAI, type IdPalier, type Palier } from "./paliers.ts"

export const Mandat = z.object({
  /** qui, chez le client, a donné le mandat */
  par: z.string().min(2),
  signeLe: z.string(),
  /** ce que le buyer déclare, mot pour mot : c'est ce texte qui fait foi */
  declaration: z.string(),
})
export type Mandat = z.infer<typeof Mandat>

export const Compte = z.object({
  palier: z.enum(["atelier", "solo", "agence", "regime"]).default("atelier"),
  facturation: z.enum(["mensuelle", "annuelle"]).default("mensuelle"),
  buyer: z.object({ nom: z.string().default(""), email: z.string().default("") }).default({ nom: "", email: "" }),
  /** la marque du rapport client en marque blanche (Agence, Régime) */
  marque: z.object({ nom: z.string().default(""), couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111214"), logo: z.string().optional() }).default({ nom: "", couleur: "#111214" }),
  essai: z.object({ debut: z.string(), fin: z.string() }).optional(),
  codePartenaire: z.string().optional(),
  stripe: z.object({ session: z.string().optional(), client: z.string().optional(), abonnement: z.string().optional(), statut: z.string().optional() }).optional(),
  mandats: z.record(z.string(), Mandat).default({}),
  /** conditions d'utilisation acceptées (version, date) */
  conditions: z.object({ version: z.string(), accepteesLe: z.string() }).optional(),
})
export type Compte = z.infer<typeof Compte>

const FICHIER_COMPTE = join(CLIENTS_ROOT, "compte.json")
export const VERSION_CONDITIONS = "2026-09"
export const DECLARATION_MANDAT = (client: string, par: string) =>
  `Je déclare être mandaté par ${client} (mandat donné par ${par}) pour tester des versions de ses pages, installer la balise LPWS sur son site et lire les données de performance nécessaires à la mesure. Je m'engage à retirer la balise à la fin du mandat.`

/** Le compte, ou un compte neuf si le fichier n'existe pas. Un fichier existant mais invalide lève : on ne l'écrase pas. */
export async function lireCompte(f = FICHIER_COMPTE): Promise<Compte> {
  if (!existsSync(f)) return Compte.parse({})
  const r = Compte.safeParse(await lireJson<unknown>(f, null))
  if (!r.success) throw new Error(`${f} illisible, rien n'est écrit tant qu'il n'est pas corrigé : ${r.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")}`)
  return r.data
}
export async function ecrireCompte(c: Compte, f = FICHIER_COMPTE): Promise<void> { await ecrireJson(f, Compte.parse(c)) }

/** Statuts d'abonnement Stripe qui ouvrent le palier payé ; `past_due` : Stripe relance encore le paiement. */
const ABONNEMENT_OUVERT = ["active", "trialing", "past_due"]

/** Le palier en vigueur : l'essai en cours l'emporte sur l'Atelier, jamais sur un palier payé. Un abonnement Stripe impayé ou suspendu ramène à l'Atelier. */
export function palierEnVigueur(c0: Compte, maintenant = Date.now()): Palier & { enEssai: boolean; joursEssai: number | null } {
  const c = c0.stripe?.statut && !ABONNEMENT_OUVERT.includes(c0.stripe.statut) ? { ...c0, palier: "atelier" as const } : c0
  const essai = c.essai && Date.parse(c.essai.fin) > maintenant
  const joursEssai = essai ? Math.ceil((Date.parse(c.essai!.fin) - maintenant) / 86_400_000) : null
  if (c.palier === "atelier" && essai) return { ...PALIERS[PALIER_ESSAI], enEssai: true, joursEssai }
  return { ...PALIERS[c.palier], enEssai: false, joursEssai: null }
}

export function demarrerEssai(c: Compte, maintenant = new Date()): Compte {
  if (c.essai) throw Object.assign(new Error("L’essai a déjà été utilisé sur ce compte."), { code: 409 })
  if (c.palier !== "atelier") throw Object.assign(new Error("Le compte a déjà un palier payé."), { code: 409 })
  return { ...c, essai: { debut: maintenant.toISOString(), fin: new Date(maintenant.getTime() + ESSAI_JOURS * 86_400_000).toISOString() } }
}

/**
 * Les clients actifs du mois : au moins un test en ligne à un moment du mois civil en cours.
 * Un test arrêté le 3 compte pour le mois ; un client qui n'a fait que copier et auditer, non.
 */
export async function clientsActifs(racine = CLIENTS_ROOT, maintenant = new Date()): Promise<string[]> {
  if (!existsSync(racine)) return []
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString()
  const actifs: string[] = []
  for (const c of await readdir(racine, { withFileTypes: true })) {
    if (!c.isDirectory()) continue
    let actif = false
    for (const k of await readdir(join(racine, c.name), { withFileTypes: true })) {
      if (!k.isDirectory()) continue
      const tests = await lireJson<Test[]>(fichiersDe(join(racine, c.name, k.name)).tests, [])
      if (tests.some((t) => t.lanceLe && (t.etat === "live" || t.etat === "gagnant" || (t.retireLe ?? t.finLe ?? t.lanceLe) >= debutMois))) { actif = true; break }
    }
    if (actif) actifs.push(c.name)
  }
  return actifs
}

export type Droit = { ok: true; note?: string } | { ok: false; raison: string; action: "mandat" | "palier" | "limite" }

/** A-t-on le droit de mettre un test en ligne sur ce client ? La réponse dit quoi faire sinon. */
export async function peutLancer(c: Compte, client: string, racine = CLIENTS_ROOT): Promise<Droit> {
  if (!c.mandats[client])
    return { ok: false, action: "mandat", raison: "Aucun mandat déclaré pour ce client : LPWS ne met rien en ligne sur un site sans l’accord écrit de son propriétaire. Déclarez le mandat (Compte → Mandats), une fois." }
  const p = palierEnVigueur(c)
  if (!p.miseEnLigne)
    return { ok: false, action: "palier", raison: "L’Atelier prépare et diagnostique, il ne met pas en ligne. Démarrez l’essai de 14 jours (sans carte) ou passez en Solo pour lancer ce test." }
  const actifs = await clientsActifs(racine)
  if (p.clientsActifs === null || actifs.includes(client) || actifs.length < p.clientsActifs) return { ok: true }
  // Stripe ne facture que l'abonnement : un client en plus n'y serait jamais payé
  if (p.parClientEnPlus !== null && c.stripe?.abonnement)
    return { ok: false, action: "limite", raison: `${p.nom} inclut ${p.clientsActifs} clients actifs par mois, et ${actifs.length} le sont déjà. Les clients en plus ne sont pas encore facturables en ligne : écrivez-nous pour passer au Régime, ou attendez le mois prochain.` }
  if (p.parClientEnPlus !== null)
    return { ok: true, note: `${actifs.length + 1}ᵉ client actif ce mois-ci : ${p.parClientEnPlus} $ en plus de l’abonnement ${p.nom}.` }
  return { ok: false, action: "limite", raison: `${p.nom} inclut ${p.clientsActifs} clients actifs par mois, et ${actifs.length} le sont déjà (${actifs.join(", ")}). Passez en Agence, ou attendez le mois prochain.` }
}

/** Ce que coûte le mois, à ce jour : l'abonnement + les clients en plus. `null` = sur devis. */
export function factureDuMois(c: Compte, actifs: number): { total: number | null; detail: string } {
  const p = palierEnVigueur(c)
  const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`
  if (p.enEssai) return { total: 0, detail: `Essai ${p.nom} : encore ${pl(p.joursEssai ?? 0, "jour")}, sans carte.` }
  const base = c.facturation === "annuelle" ? p.prixAnnuelMois : p.prixMois
  if (base === null) return { total: null, detail: `${p.nom} : sur devis.` }
  const enPlus = p.clientsActifs !== null && p.parClientEnPlus !== null ? Math.max(0, actifs - p.clientsActifs) : 0
  const total = base + enPlus * (p.parClientEnPlus ?? 0)
  return { total, detail: `${p.nom} ${base} $${enPlus ? ` + ${pl(enPlus, "client")} × ${p.parClientEnPlus} $` : ""} · ${pl(actifs, "client")} ${actifs > 1 ? "actifs" : "actif"} ce mois-ci` }
}
