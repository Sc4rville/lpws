/**
 * ga4.ts — lire dans Google Analytics 4 combien de visiteurs ont vu chaque version, et combien
 * ont converti.
 *
 * C'est le maillon qui manquait à toute la chaîne : la balise dit à GA4 quelle version chaque
 * visiteur a vue (propriété utilisateur `lpws_variante`, cf. deploy/tag/loader.ts), et ici on
 * relit GA4 pour compter, par version, les sessions et les sessions qui ont converti.
 *
 * Une conversion ici = une SESSION avec au moins un « key event » (`sessionKeyEventRate` ×
 * `sessions`), pas le nombre de key events : une session peut en déclencher plusieurs, et le
 * verdict compare des proportions de sessions (binomiales), qui ne peuvent pas dépasser 1.
 *
 * Pourquoi une propriété UTILISATEUR et pas un simple paramètre d'événement : l'achat ou
 * l'inscription est un autre événement, plus tard, qui ne porte pas notre paramètre. Une
 * dimension liée à l'utilisateur, elle, colle à tous ses événements suivants. C'est ce qui
 * permet d'écrire « conversions par version » sans tricher.
 *
 * Accès : un compte de service Google (fichier JSON) que le media buyer ajoute en LECTEUR sur
 * la propriété GA4 du client — le geste standard pour un outil tiers. Aucune bibliothèque
 * Google ici : un JWT signé avec la clé du compte, échangé contre un jeton, une requête REST.
 */
import { createSign } from "node:crypto"

export type CompteDeService = { client_email: string; private_key: string }

export type LigneVersion = { version: string; sessions: number; conversions: number }

const PORTEE = "https://www.googleapis.com/auth/analytics.readonly"

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

/** Un jeton d'accès d'une heure, obtenu avec la clé du compte de service. */
async function jeton(sa: CompteDeService): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const entete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const corps = b64url(JSON.stringify({
    iss: sa.client_email, scope: PORTEE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))
  const signeur = createSign("RSA-SHA256")
  signeur.update(`${entete}.${corps}`)
  const signature = b64url(signeur.sign(sa.private_key))
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${entete}.${corps}.${signature}`,
    }),
  })
  if (!r.ok) throw new Error(`jeton refusé (${r.status}) : ${(await r.text()).slice(0, 200)}`)
  return (await r.json() as { access_token: string }).access_token
}

/**
 * Sessions et conversions par version, entre deux dates (AAAA-MM-JJ).
 *
 * `propriete` est l'identifiant numérique de la propriété GA4 (Admin → Paramètres de la
 * propriété), pas le G-XXXX de la balise.
 */
export async function rapportParVersion(
  sa: CompteDeService, propriete: string, depuis: string, jusqua = "today", experience?: string,
): Promise<LigneVersion[]> {
  if (!/^\d+$/.test(propriete)) throw new Error("Identifiant numérique GA4 invalide")
  if (experience !== undefined && !/^[a-f0-9]{32}$/.test(experience)) throw new Error("Identifiant d'expérience invalide")
  const token = await jeton(sa)
  const corps = {
    dateRanges: [{ startDate: depuis, endDate: jusqua }],
    dimensions: [{ name: "customUser:lpws_variante" }],
    metrics: [{ name: "sessions" }, { name: "sessionKeyEventRate" }],
    ...(experience ? { dimensionFilter: { filter: {
      fieldName: "customUser:lpws_experience", stringFilter: { matchType: "EXACT", value: experience, caseSensitive: true },
    } } } : {}),
    limit: 100_000,
  }
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propriete}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(corps),
  })
  if (!r.ok) throw new Error(`GA4 a répondu ${r.status} : ${(await r.text()).slice(0, 300)}`)
  const brut = await r.json() as { rowCount?: number; rows?: unknown[]; metadata?: { subjectToThresholding?: boolean; dataLossFromOtherRow?: boolean } }
  if ((brut.rowCount ?? 0) > (brut.rows?.length ?? 0)) throw new Error("Rapport GA4 incomplet : trop de versions, aucune mesure enregistrée.")
  if (brut.metadata?.subjectToThresholding || brut.metadata?.dataLossFromOtherRow)
    throw new Error("GA4 masque ou agrège des lignes : comparaison non fiable, aucune mesure enregistrée.")
  return lireRapport(brut)
}

/** Le format brut de GA4 → nos lignes. Séparé pour être testable sans réseau. */
export function lireRapport(brut: unknown): LigneVersion[] {
  const rep = brut as { rows?: Array<{ dimensionValues: { value: string }[]; metricValues: { value: string }[] }> }
  if (!rep || typeof rep !== "object" || (rep.rows !== undefined && !Array.isArray(rep.rows))) throw new Error("Réponse GA4 invalide")
  return (rep.rows ?? []).map((row) => {
    const sessions = Number(row.metricValues?.[0]?.value)
    const taux = Number(row.metricValues?.[1]?.value)
    if (!Number.isInteger(sessions) || sessions < 0 || !Number.isFinite(taux) || taux < 0 || taux > 1)
      throw new Error("Métriques GA4 invalides : sessions ou taux de sessions converties")
    return { version: row.dimensionValues[0]?.value ?? "", sessions, conversions: Math.round(sessions * taux) }
  }).filter((l) => l.version && l.version !== "(not set)")
}
