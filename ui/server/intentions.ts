import { existsSync } from "node:fs"
import { chmod, readFile } from "node:fs/promises"
import { randomBytes, createHash, timingSafeEqual } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"
import { EtatIntentions, analyser, ciblagePour, creerEtat } from "../../engine/intent/analyse.ts"
import { importerBuffer } from "../../engine/intent/import.ts"
import { scriptGoogleAds } from "../../engine/intent/google-script.ts"
import { DemandePersonnalisation } from "../../engine/intent/personnaliser.ts"
import { Intention, SUFFIXE_URL_FINALE, Termes } from "../../engine/intent/schema.ts"
import { Ciblage } from "../../engine/intent/ciblage.ts"
import { choisirPourClic } from "../../engine/intent/routage.ts"
import { VariantSpec } from "../../engine/apply/spec.ts"
import { campagne as fichiersDe } from "../../engine/shared/campagne.ts"
import { ecrireJson, ecarts, lireJson, lireValide } from "../../engine/shared/json.ts"
import { CLIENTS_ROOT, slugify } from "../../engine/shared/paths.ts"
import { ROOT, TSX, dossier } from "./config.ts"
import { jobs, nouveauJob, dire, finir, lancer, type Job } from "./jobs.ts"
import { verrouillerCampagne } from "./verrou.ts"

const err = (message: string, code = 400) => Object.assign(new Error(message), { code })

const IMPORT = z.object({
  nom: z.string().max(180),
  base64: z.string().max(7_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\r?\n?$|^$/, "base64 invalide"),
  marques: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
})

function base64Canonique(v: string): Buffer {
  const compact = v.replace(/\r?\n/g, "")
  const buf = Buffer.from(compact, "base64")
  if (!compact.length || buf.toString("base64") !== compact) throw err("base64 invalide : le fichier n’a pas été lu correctement")
  return buf
}

const DECISIONS = z.object({
  revision: z.string().regex(/^[a-f0-9]{32}$/),
  decisions: z.record(z.string().regex(/^[a-f0-9]{24}$/), Intention.nullable()),
})

const CONNEXION = z.object({
  compte: z.string().regex(/^\d{10}$/),
  campagnes: z.array(z.string().regex(/^\d+$/)).min(1).max(50),
})

const MESURE = z.object({ propriete: z.string().regex(/^\d+$/) })
const SIMULER = z.object({ url: z.string().max(3_000) })

type Connexion = { hachage: string; compte: string; campagnes: string[]; creeLe: string; derniereSync?: string }
type MesureFile = { propriete: string; compteDeService: string }

export function publicDisponible(): boolean {
  if (!process.env.LPWS_MOT_DE_PASSE) return false
  try {
    const u = new URL(process.env.LPWS_URL_PUBLIQUE ?? "")
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return false
    const h = u.hostname.toLowerCase()
    if (h === "localhost" || h.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(h)
      || h === "::1" || h === "[::1]" || /^\[(0:)+1\]$/.test(h)) return false
    if (/^10\.|^127\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^0\./.test(h)) return false
    if (/^(fe80:|fc|fd)/i.test(h)) return false
    return true
  } catch { return false }
}

export async function etatIntentions(c: string, camp: string) {
  const d = dossier(c, camp)
  const f = fichiersDe(d)
  let analyse: ReturnType<typeof analyser> | null = null
  if (existsSync(f.intents)) analyse = analyser(await lireValide(EtatIntentions, f.intents), c, camp)
  const connexion = await lireJson<Connexion | null>(f.intentsConnexion, null)
  const mesure = await lireJson<MesureFile | null>(f.mesure, null)
  let serviceEmail: string | undefined
  const cheminSA = mesure?.compteDeService ?? process.env.LPWS_GA4_COMPTE_DE_SERVICE
  if (cheminSA) {
    try { serviceEmail = JSON.parse(await readFile(cheminSA, "utf8")).client_email } catch { serviceEmail = undefined }
  }
  const job = [...jobs.values()].reverse().find((j) => j.type === "intentions" && j.campagne === d)
  return {
    analyse, suffixe: SUFFIXE_URL_FINALE,
    connexion: {
      configure: !!connexion,
      ...(connexion ? { compte: connexion.compte, campagnes: connexion.campagnes, derniereSync: connexion.derniereSync } : {}),
      publicDisponible: publicDisponible(),
    },
    mesure: { configure: !!mesure, propriete: mesure?.propriete, serviceEmail, serviceDisponible: !!cheminSA && !!serviceEmail },
    ...(job ? { job: { id: job.id, etat: job.etat, sujet: job.sujet } } : {}),
  }
}

export async function importerIntentions(c: string, camp: string, corps: unknown) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const v = IMPORT.safeParse(corps)
    if (!v.success) throw err("import invalide : " + ecarts(v.error))
    const buf = base64Canonique(v.data.base64)
    if (buf.length > 5_000_000) throw err("Export trop volumineux : 5 Mo maximum")
    const etat = EtatIntentions.parse(creerEtat(importerBuffer(buf, v.data.nom || "export.csv"), v.data.marques))
    await ecrireJson(fichiersDe(d).intents, etat)
    return etatIntentions(c, camp)
  } catch (e) {
    throw e instanceof Error && (e as { code?: number }).code ? e : err((e as Error).message)
  } finally { liberer() }
}

export async function deciderIntentions(c: string, camp: string, corps: unknown) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const v = DECISIONS.safeParse(corps)
    if (!v.success) throw err("décisions invalides : " + ecarts(v.error))
    const etat = await lireValide(EtatIntentions, fichiersDe(d).intents)
    const a = analyser(etat, c, camp)
    if (a.revision !== v.data.revision)
      throw err("Le rapport a changé depuis votre relecture : rechargez la vue puis tranchez à nouveau.", 409)
    const ids = new Set(a.routes.map((r) => r.id))
    for (const id of Object.keys(v.data.decisions))
      if (!ids.has(id)) throw err(`route inconnue : ${id}`)
    const decisions = { ...etat.decisions, ...v.data.decisions }
    const suivant = EtatIntentions.parse({ ...etat, decisions })
    await ecrireJson(fichiersDe(d).intents, suivant)
    return etatIntentions(c, camp)
  } catch (e) {
    throw e instanceof Error && (e as { code?: number }).code ? e : err((e as Error).message)
  } finally { liberer() }
}

export async function genererVariantes(c: string, camp: string, corps: unknown): Promise<Job> {
  const d = dossier(c, camp)
  const v = DemandePersonnalisation.safeParse(corps)
  if (!v.success) throw err("demande invalide : " + ecarts(v.error))
  const f = fichiersDe(d)
  if (!existsSync(f.capture)) throw err("La page n’est pas encore copiée.", 409)
  if (!existsSync(f.contexte)) throw err("Le contexte de l’annonce est requis : remplissez-le d’abord (vue Variantes).", 409)
  if (!v.data.source) {
    const etat = await lireValide(EtatIntentions, f.intents).catch((e: Error) => { throw err(e.message, 409) })
    try { ciblagePour(etat, v.data.intention) } catch (e) { throw err((e as Error).message, 409) }
  }
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const job = nouveauJob("intentions")
    job.campagne = d; job.sujet = v.data.intention
    const consigne = v.data.consigne.replace(/\s+/g, " ").trim().replace(/^-+\s*/, "")
    ;(async () => {
      dire(job, `LPWS écrit ${v.data.n} variante(s) pour l’intention « ${v.data.intention} »${consigne ? ` : « ${consigne} »` : ""}`)
      const args = [join(ROOT, "engine/intent/personnaliser.ts"), resolve(d), "--intention", v.data.intention, "--n", String(v.data.n)]
      if (consigne) args.push("--consigne", consigne)
      if (v.data.source) args.push("--source", v.data.source)
      finir(job, (await lancer(job, TSX, args)) === 0)
    })().catch((e) => { dire(job, String(e)); finir(job, false) }).finally(liberer)
    return job
  } catch (e) { liberer(); throw e }
}

export async function propositionIntentions(c: string, camp: string, nom: string) {
  const f = fichiersDe(dossier(c, camp))
  const props = await lireJson<Array<{ nom: string } & Record<string, unknown>>>(f.propositions, [])
  const p = props.find((x) => x.nom === nom)
  if (!p) throw err("proposition inconnue", 404)
  const spec = await lireValide(VariantSpec, f.spec(p.nom)).catch((e: Error) => { throw err(e.message, 404) })
  return { proposition: p, spec }
}

export async function simuler(c: string, camp: string, corps: unknown) {
  const d = dossier(c, camp)
  const f = fichiersDe(d)
  const v = SIMULER.safeParse(corps)
  if (!v.success) throw err("url invalide")
  const meta = await lireJson<{ source?: string; client?: string }>(f.meta, {})
  if (!meta.source) throw err("La page n’est pas encore copiée.", 409)
  const etat = existsSync(f.intents) ? await lireValide(EtatIntentions, f.intents) : null
  const a = etat ? analyser(etat, c, camp) : null
  const parIntention = new Map<string, Ciblage["routes"]>()
  if (a) for (const r of a.routes) {
    if (!r.intention) continue
    const l = parIntention.get(r.intention) ?? []
    l.push({ motCle: r.motCle, campagneId: r.campagneId, groupeId: r.groupeId })
    parIntention.set(r.intention, l)
  }
  const variantes = [...parIntention.entries()].map(([intention, routes]) =>
    ({ nom: intention, part: 100, page: meta.source!, edits: [], ciblage: Ciblage.parse({ intention, revision: a!.revision, routes }) }))
  const projection = choisirPourClic({ actif: true, variantes }, v.data.url, "simulation")
  let actuelle: ReturnType<typeof choisirPourClic> | null = null
  const cfg = await lireJson<{ actif: boolean; variantes: Array<{ nom: string; part: number; page: string; ciblage?: Ciblage; experience?: string }> } | null>(
    f.configTag(slugify(meta.client ?? c)), null)
  if (cfg) actuelle = choisirPourClic({ actif: cfg.actif, variantes: cfg.variantes }, v.data.url, "simulation")
  return {
    projection: true,
    intention: projection.intention, motif: projection.motif, nom: projection.variante?.nom ?? null,
    actuelle: actuelle ? { nom: actuelle.variante?.nom ?? null, motif: actuelle.motif, label: "configuration locale" } : null,
  }
}

export async function connecter(c: string, camp: string, corps: unknown) {
  const d = dossier(c, camp)
  const v = CONNEXION.safeParse(corps)
  if (!v.success) throw err("Indiquez l’identifiant du compte (10 chiffres) et au moins une campagne.", 400)
  const pub = process.env.LPWS_URL_PUBLIQUE
  if (!pub || !publicDisponible())
    throw err("La synchronisation automatique exige une instance publique en HTTPS avec accès privé (LPWS_URL_PUBLIQUE + LPWS_MOT_DE_PASSE). L’import CSV reste disponible localement.", 409)
  const jeton = randomBytes(32).toString("hex")
  const script = scriptGoogleAds({ endpoint: `${pub.replace(/\/$/, "")}/api/intents/${c}/${camp}/sync`, jeton, compte: v.data.compte, campagnes: v.data.campagnes })
  const connexion: Connexion = {
    hachage: createHash("sha256").update(jeton).digest("hex"),
    compte: v.data.compte, campagnes: v.data.campagnes, creeLe: new Date().toISOString(),
  }
  const liberer = verrouillerCampagne(dirname(d))
  try {
    await ecrireJson(fichiersDe(d).intentsConnexion, connexion)
    await chmod(fichiersDe(d).intentsConnexion, 0o600)
  } finally { liberer() }
  return { script }
}

const dernieresSync = new Map<string, number>()

export async function authentifierSync(c: string, camp: string, jeton: string | undefined): Promise<void> {
  if (!jeton) throw err("jeton Bearer requis", 401)
  const connexion = await lireJson<Connexion | null>(fichiersDe(dossier(c, camp)).intentsConnexion, null)
  if (!connexion) throw err("connecteur non configuré", 404)
  const recu = createHash("sha256").update(jeton ?? "").digest()
  const attendu = Buffer.from(connexion.hachage, "hex")
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) throw err("jeton invalide", 401)
}

export async function synchroniserCorps(c: string, camp: string, brut: Buffer, jeton: string | undefined) {
  const d = dossier(c, camp)
  const f = fichiersDe(d)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const connexion = await lireJson<Connexion | null>(f.intentsConnexion, null)
    if (!connexion) throw err("connecteur non configuré", 404)
    const recu = createHash("sha256").update(jeton ?? "").digest()
    const attendu = Buffer.from(connexion.hachage, "hex")
    if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) throw err("jeton invalide", 401)
    if (brut.length > 5_000_000) throw err("corps trop volumineux", 413)
    const cle = `${c}/${camp}`
    const derniere = dernieresSync.get(cle)
    if (derniere !== undefined && Date.now() - derniere < 60_000) throw err("Une synchronisation a déjà eu lieu dans la minute : elle tourne au plus une fois par heure côté Google Ads.", 429)
    let payload: unknown
    try { payload = JSON.parse(brut.toString("utf8")) } catch { throw err("JSON invalide", 400) }
    const r = Termes.safeParse(payload)
    if (!r.success) throw err("rapport hors contrat", 400)
    if (r.data.source.compte !== connexion.compte) throw err("le rapport ne correspond pas au compte du connecteur", 400)
    const permises = new Set(connexion.campagnes)
    for (const t of r.data.termes)
      if (!t.campagneId || !permises.has(t.campagneId) || !t.groupeId) throw err("le rapport contient des lignes hors des campagnes du connecteur", 400)
    const ancien = existsSync(f.intents) ? await lireValide(EtatIntentions, f.intents) : null
    let etat: EtatIntentions
    try { etat = creerEtat(r.data, ancien?.marques ?? []) } catch (e) { throw err((e as Error).message, 400) }
    if (ancien && etat.revision === ancien.revision) etat.decisions = ancien.decisions
    await ecrireJson(f.intents, EtatIntentions.parse(etat))
    await ecrireJson(f.intentsConnexion, { ...connexion, derniereSync: new Date().toISOString() })
    dernieresSync.set(cle, Date.now())
    return { ok: true }
  } finally { liberer() }
}

export async function configurerMesure(c: string, camp: string, corps: unknown) {
  const d = dossier(c, camp)
  const f = fichiersDe(d)
  const v = MESURE.safeParse(corps)
  if (!v.success) throw err("propriété GA4 invalide (identifiant numérique)")
  const actuel = await lireJson<MesureFile | null>(f.mesure, null)
  const chemin = actuel?.compteDeService ?? process.env.LPWS_GA4_COMPTE_DE_SERVICE
  if (!chemin || !existsSync(chemin)) throw err("Compte de service GA4 non provisionné sur cette instance.", 409)
  let sa: { client_email?: string; private_key?: string }
  try { sa = JSON.parse(await readFile(chemin, "utf8")) } catch { throw err("Le compte de service provisionné est illisible.", 409) }
  if (!sa.client_email || !sa.private_key) throw err("Le compte de service provisionné est incomplet.", 409)
  const liberer = verrouillerCampagne(dirname(d))
  try { await ecrireJson(f.mesure, { propriete: v.data.propriete, compteDeService: chemin }) } finally { liberer() }
  return etatIntentions(c, camp)
}

export async function mesurerIntentions(c: string, camp: string): Promise<Job> {
  const d = dossier(c, camp)
  if (!existsSync(fichiersDe(d).mesure)) throw err("La mesure n’est pas configurée pour cette page (propriété GA4 manquante).", 409)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const job = nouveauJob("intentions")
    job.campagne = d; job.sujet = "mesure"
    ;(async () => {
      dire(job, "lecture de la propriété GA4")
      finir(job, (await lancer(job, TSX, [join(ROOT, "engine/measure/run.ts"), resolve(d)])) === 0)
    })().catch((e) => { dire(job, String(e)); finir(job, false) }).finally(liberer)
    return job
  } catch (e) { liberer(); throw e }
}
