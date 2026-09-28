/**
 * paliers.ts — LA GRILLE, telle que proposée (docs/recherche/business-model.md §4) et le droit
 * qu'elle donne. Hypothèse à valider par les entretiens buyers : les montants et les plafonds
 * se changent ICI, nulle part ailleurs.
 *
 * L'unité est le CLIENT ACTIF PAR MOIS : un client du buyer qui a eu au moins un test en ligne
 * dans le mois. Copier une page, la diagnostiquer, l'auditer ne rend pas un client actif :
 * l'Atelier gratuit est un vrai produit, pas un essai déguisé.
 */
export type IdPalier = "atelier" | "solo" | "agence" | "regime"
export type Palier = {
  id: IdPalier
  nom: string
  /** $ par mois, `null` = sur devis */
  prixMois: number | null
  /** remise annuelle : 20 % partout sur le marché */
  prixAnnuelMois: number | null
  /** clients actifs inclus ; `null` = illimité */
  clientsActifs: number | null
  /** $ par client actif au-delà de l'inclus ; `null` = pas de dépassement, on bloque */
  parClientEnPlus: number | null
  visiteursInclus: number | null
  miseEnLigne: boolean
  /** heures entre deux passages de la surveillance ; `null` = pas de surveillance */
  surveillanceH: number | null
  alertes: boolean
  marqueBlanche: boolean
  intention: boolean
  integralNatif: boolean
  /** plafond (invisible à l'écran) de diagnostics par mois : il protège la marge, ce n'est pas un « crédit » */
  diagnosticsMois: number | null
}

export const PALIERS: Record<IdPalier, Palier> = {
  atelier: { id: "atelier", nom: "Atelier", prixMois: 0, prixAnnuelMois: 0, clientsActifs: 0, parClientEnPlus: null, visiteursInclus: 0,
    miseEnLigne: false, surveillanceH: null, alertes: false, marqueBlanche: false, intention: false, integralNatif: false, diagnosticsMois: 5 },
  solo: { id: "solo", nom: "Solo", prixMois: 149, prixAnnuelMois: 119, clientsActifs: 3, parClientEnPlus: null, visiteursInclus: 50_000,
    miseEnLigne: true, surveillanceH: 24 * 7, alertes: false, marqueBlanche: false, intention: false, integralNatif: false, diagnosticsMois: 30 },
  agence: { id: "agence", nom: "Agence", prixMois: 399, prixAnnuelMois: 319, clientsActifs: 15, parClientEnPlus: 20, visiteursInclus: 250_000,
    miseEnLigne: true, surveillanceH: 24, alertes: true, marqueBlanche: true, intention: true, integralNatif: false, diagnosticsMois: 150 },
  regime: { id: "regime", nom: "Régime", prixMois: null, prixAnnuelMois: null, clientsActifs: null, parClientEnPlus: null, visiteursInclus: null,
    miseEnLigne: true, surveillanceH: 1, alertes: true, marqueBlanche: true, intention: true, integralNatif: true, diagnosticsMois: null },
}

/** 14 jours sans carte : la norme du marché (Unbounce, Augmentic, Swipe Pages) */
export const ESSAI_JOURS = 14
/** le palier que l'essai ouvre */
export const PALIER_ESSAI: IdPalier = "solo"
