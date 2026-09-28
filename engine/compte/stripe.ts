/**
 * stripe.ts — l'abonnement, par Stripe Checkout (feuille de route 3.5, rapport §8 décision 5).
 *
 * Rien n'est branché tant que STRIPE_SECRET_KEY n'est pas défini : l'interface le dit (« le
 * paiement n'est pas encore ouvert ») au lieu d'afficher un bouton qui ne mène nulle part.
 *
 *   STRIPE_SECRET_KEY        la clé secrète du compte Stripe
 *   STRIPE_WEBHOOK_SECRET    le secret de signature du point de terminaison webhook
 *   STRIPE_PRIX_SOLO         price_… mensuel (et STRIPE_PRIX_SOLO_ANNUEL)
 *   STRIPE_PRIX_AGENCE       price_… mensuel (et STRIPE_PRIX_AGENCE_ANNUEL)
 *   STRIPE_PRIX_CLIENT_EN_PLUS  price_… « par client actif » (Agence, facturé à l'usage)
 *
 * Le code partenaire part en métadonnée de l'abonnement : la commission (30 % × 12 mois) se
 * calcule sur les factures payées qui le portent, côté Stripe, sans table à nous.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { Compte } from "./compte.ts"
import type { IdPalier } from "./paliers.ts"

const API = "https://api.stripe.com/v1"

export const stripeConfigure = () => !!process.env.STRIPE_SECRET_KEY

function prixDe(palier: IdPalier, facturation: Compte["facturation"]): string | undefined {
  const k = `STRIPE_PRIX_${palier.toUpperCase()}${facturation === "annuelle" ? "_ANNUEL" : ""}`
  return process.env[k]
}

/** Une page de paiement Stripe pour ce palier ; rend son URL et l’id de la session, seule acceptée ensuite par le webhook. */
export async function sessionPaiement(c: Compte, palier: IdPalier, retour: string): Promise<{ url: string; id: string }> {
  if (!stripeConfigure()) throw Object.assign(new Error("Le paiement n’est pas encore ouvert sur cette instance (STRIPE_SECRET_KEY absent)."), { code: 501 })
  if (palier !== "solo" && palier !== "agence") throw Object.assign(new Error("Ce palier se contracte sur devis, pas en ligne."), { code: 400 })
  const prix = prixDe(palier, c.facturation)
  if (!prix) throw Object.assign(new Error(`Prix Stripe non configuré pour ${palier} (${c.facturation}).`), { code: 501 })
  const f = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": prix,
    "line_items[0][quantity]": "1",
    success_url: `${retour}#compte?paiement=ok`,
    cancel_url: `${retour}#compte?paiement=annule`,
    client_reference_id: palier,
    allow_promotion_codes: "true",
    "subscription_data[metadata][palier]": palier,
  })
  if (c.buyer.email) f.set("customer_email", c.buyer.email)
  if (c.codePartenaire) f.set("subscription_data[metadata][partenaire]", c.codePartenaire)
  const r = await fetch(`${API}/checkout/sessions`, { method: "POST", body: f,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" } })
  const j = await r.json() as { id?: string; url?: string; error?: { message?: string } }
  if (!r.ok || !j.url || !j.id) throw Object.assign(new Error(`Stripe a refusé : ${j.error?.message ?? r.status}`), { code: 502 })
  return { url: j.url, id: j.id }
}

/** Vérifie la signature `Stripe-Signature: t=…,v1=…` (HMAC-SHA256 de `${t}.${corps}`), tolérance 5 min. */
export function signatureValide(corps: string, entete: string | undefined, secret = process.env.STRIPE_WEBHOOK_SECRET ?? "", maintenant = Date.now()): boolean {
  if (!entete || !secret) return false
  const parts = Object.fromEntries(entete.split(",").map((x) => x.split("=") as [string, string]))
  const t = Number(parts.t)
  if (!t || Math.abs(maintenant / 1000 - t) > 300) return false
  const attendu = createHmac("sha256", secret).update(`${t}.${corps}`).digest("hex")
  const recus = entete.split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3))
  return recus.some((v) => v.length === attendu.length && timingSafeEqual(Buffer.from(v), Buffer.from(attendu)))
}

type Evenement = { type: string; data: { object: Record<string, any> } }

/** Ce qu'un événement Stripe change au compte. Les autres événements sont ignorés. */
export function appliquerEvenement(c: Compte, e: Evenement): Compte {
  const o = e.data.object
  if (e.type === "checkout.session.completed") {
    if (!c.stripe?.session || o.id !== c.stripe.session) return c
    const palier = (o.client_reference_id ?? o.metadata?.palier) as IdPalier | undefined
    if (palier !== "solo" && palier !== "agence") return c
    return { ...c, palier, stripe: { session: o.id, client: o.customer, abonnement: o.subscription, statut: "active" } }
  }
  if (e.type === "customer.subscription.updated" && c.stripe?.abonnement === o.id)
    return { ...c, stripe: { ...c.stripe, statut: o.status } }
  if (e.type === "customer.subscription.deleted" && c.stripe?.abonnement === o.id)
    return { ...c, palier: "atelier", stripe: { ...c.stripe, statut: "canceled" } }
  return c
}
