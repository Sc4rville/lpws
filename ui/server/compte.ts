/** compte.ts : le compte du buyer tel que l'interface le voit (palier, essai, mandats, coûts). */
import { join } from "node:path"
import { CLIENTS_ROOT } from "../../engine/shared/paths.ts"
import { lireCompte, palierEnVigueur, clientsActifs, factureDuMois, VERSION_CONDITIONS } from "../../engine/compte/compte.ts"
import { PALIERS, ESSAI_JOURS } from "../../engine/compte/paliers.ts"
import { stripeConfigure } from "../../engine/compte/stripe.ts"
import { lireCouts, bilanCouts } from "../../engine/compte/couts.ts"
import { ROOT } from "./config.ts"

/** SaaS : les paliers limitent la mise en ligne. Sans la variable (l'instance d'équipe), tout est ouvert : seul le mandat est exigé. */
export const FACTURATION = !!process.env.LPWS_FACTURATION
export const FICHIER_COMPTE = join(ROOT, CLIENTS_ROOT, "compte.json")

export async function resumeCompte() {
  const compte = await lireCompte(FICHIER_COMPTE)
  const p = palierEnVigueur(compte)
  const actifs = await clientsActifs(join(ROOT, CLIENTS_ROOT))
  return { ...compte, facturationActive: FACTURATION, paiementOuvert: stripeConfigure(), palierEnVigueur: p, actifs,
    facture: factureDuMois(compte, actifs.length), paliers: Object.values(PALIERS), essaiJours: ESSAI_JOURS, versionConditions: VERSION_CONDITIONS,
    couts: bilanCouts(await lireCouts(join(ROOT, CLIENTS_ROOT, "couts.jsonl"))) }
}
