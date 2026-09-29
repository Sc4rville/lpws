/**
 * server.ts : la v1 : l'interface du media buyer branchée sur la machine.
 *
 * Un serveur local (node:http, zéro dépendance) qui sert ui/index.html et pilote les familles
 * existantes en SOUS-PROCESSUS : clone, apply, tag : parce qu'elles sortent du processus
 * en cas d'échec (`fail`), et qu'un échec de capture ne doit pas tuer l'interface.
 *
 *   GET  /                                  l'interface (source, sans captures embarquées :
 *                                           elles sont servies depuis clients/)
 *   GET  /api/etat                          les clients, leurs pages, leurs tests, leur connexion
 *   POST /api/clients            {url}      onboarder une page : lance la capture (job)
 *   GET  /api/jobs/<id>                     suivre un job (lignes, état)
 *   GET  /api/clients/<c>/<camp>/textes     les textes de la page qu'un test peut changer
 *   POST /api/clients/<c>/<camp>/tests      {titre, pourquoi, edits:[{anchor,text}]} → variante + tag (job)
 *   POST /api/clients/<c>/<camp>/tests/<id> {etat:'live'|'stop'|'gagnant', part} → config republiée (job) ; archivée dans experiences.json à l'arrêt
 *   POST /api/clients/<c>/<camp>/propositions/<nom>/decliner {consigne?, n?} → n (1-3) variantes de plus (job)
 *   POST /api/clients/<c>/<camp>/verifier   la balise est-elle posée sur la vraie page ? (job)
 *   POST /api/clients/<c>/<camp>/audit      l'audit tracking de la vraie page (job)
 *   POST /api/clients/<c>/<camp>/surveiller un relevé de surveillance maintenant (job)
 *   POST /api/clients/<c>/<camp>/mandat     {par} le mandat du client, déclaré par le buyer
 *   GET  /api/clients/<c>/<camp>/rapport/<id>  le rapport client (HTML autonome)
 *   POST /api/audit              {url}      l'audit gratuit d'une page quelconque (job)
 *   GET  /api/conclure?taux&visiteurs&hausse&part   « peut-on conclure ? »
 *   GET  /api/compte · POST /api/compte · POST /api/compte/essai · POST /api/compte/abonnement
 *   POST /api/stripe/webhook                 événements Stripe (signés, hors mot de passe)
 *   GET  /files/<chemin>                    clients/ en statique (captures)
 *   GET  /t/<client>.js · /v/<client>.json  les fichiers du tag, tels que Vercel les sert
 *
 * Les fichiers du tag sont poussés sur Vercel (ui/dist → https://lpws.vercel.app) à chaque
 * création, lancement ou arrêt : GTM exige une URL stable en https, et elle doit répondre
 * depuis n'importe quel site (CORS ouvert, cf. vercel.json).
 *
 * L'état des tests vit dans clients/<client>/<campagne>/tests.json ; la connexion Express dans
 * express.json. Jamais dans le repo.
 *
 * Le détail vit dans ui/server/ : config · jobs · etat · pipeline (tests) · tag (balise) · compte · suivi (audit, surveillance).
 *
 * Usage : npm run ui:serve   →   http://localhost:4700
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { CLIENTS_ROOT, slugify } from "../engine/shared/paths.ts"
import { step } from "../engine/shared/log.ts"
import { lireJson, ecrireJson } from "../engine/shared/json.ts"
import { envoyerFichier, envoyerJson as json } from "../engine/shared/http.ts"
import { mimeDe } from "../engine/shared/mime.ts"
import { campagne as fichiersDe } from "../engine/shared/campagne.ts"
import { pageAvecStats } from "./stats-embarque.ts"
import { ROOT, DIST, BASE_TAGS, dossier } from "./server/config.ts"
import { jobs } from "./server/jobs.ts"
import { etat, nomDuSite } from "./server/etat.ts"
import { FICHIER_COMPTE, FACTURATION, resumeCompte } from "./server/compte.ts"
import { lancerAudit, lancerSurveillance, tourDeSurveillance } from "./server/suivi.ts"
import { dossierAudit } from "../engine/audit/audit.ts"
import { verifierAdresse } from "./server/adresse.ts"
import { planifier, mdePour } from "../engine/measure/stats.ts"
import { rapportHtml } from "../engine/rapport/rapport.ts"
import { lireCompte, ecrireCompte, demarrerEssai, Compte, DECLARATION_MANDAT, VERSION_CONDITIONS } from "../engine/compte/compte.ts"
import { sessionPaiement, signatureValide, appliquerEvenement } from "../engine/compte/stripe.ts"
import { capturer, textes, creerTest, lancerBrain, creerTestDepuisProposition, lancerDeclinaison, changerEtat, refuserProposition } from "./server/pipeline.ts"
import { verifier } from "./server/tag.ts"
import { etatIntentions, importerIntentions, deciderIntentions, genererVariantes, propositionIntentions, simuler, connecter, configurerMesure, mesurerIntentions, authentifierSync, synchroniserCorps } from "./server/intentions.ts"

const SCOPE = "ui"
const PORT = Number(process.env.PORT ?? 4700)
const UI = join(ROOT, "ui", "index.html")

/* ---------- http ---------- */
const lireBrut = (req: IncomingMessage, max: number) => new Promise<Buffer>((ok, ko) => {
  const lots: Buffer[] = []; let n = 0
  req.on("data", (d: Buffer) => { n += d.length; if (n > max) { ko(Object.assign(new Error("corps trop volumineux"), { code: 413 })); req.destroy() } else lots.push(d) })
  req.on("end", () => ok(Buffer.concat(lots)))
  req.on("error", ko)
})
const body = async (req: IncomingMessage, max = 2_000_000) => {
  const brut = await lireBrut(req, max)
  try { return brut.length ? JSON.parse(brut.toString("utf8")) : {} }
  catch { throw Object.assign(new Error("JSON invalide"), { code: 400 }) }
}

/** Hébergée en ligne, l'interface est derrière un mot de passe (LPWS_MOT_DE_PASSE) : un seul,
 *  partagé entre Yann et kabylesystem, le navigateur le retient. Sans la variable : rien ne change en local. */
const MOT_DE_PASSE = process.env.LPWS_MOT_DE_PASSE ?? ""
function autorise(req: IncomingMessage, res: ServerResponse): boolean {
  if (!MOT_DE_PASSE) return true
  const [, b64 = ""] = (req.headers.authorization ?? "").split(" ")
  const donne = Buffer.from(b64, "base64").toString("utf8").split(":").slice(1).join(":")
  if (donne === MOT_DE_PASSE) return true
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="LPWS", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" })
  res.end("LPWS : mot de passe requis")
  return false
}

createServer(async (req, res) => {
  try {
    // le connecteur Google Ads Scripts a son jeton Bearer, pas le mot de passe de l'interface ;
    // l'authentification passe avant la lecture du corps
    const segBrut = (req.url ?? "").split("?")[0].split("/").filter(Boolean).map(decodeURIComponent)
    if (req.method === "POST" && segBrut.length === 5 && segBrut[0] === "api" && segBrut[1] === "intents" && segBrut[4] === "sync") {
      const auth = req.headers.authorization ?? ""
      await authentifierSync(segBrut[2], segBrut[3], auth.startsWith("Bearer ") ? auth.slice(7).trim() : undefined)
      const brut = await lireBrut(req, 5_000_000)
      return json(res, 200, await synchroniserCorps(segBrut[2], segBrut[3], brut))
    }
    // Stripe n'a pas le mot de passe : sa requête est authentifiée par sa signature
    if (req.url === "/api/stripe/webhook" && req.method === "POST") {
      const brut = await new Promise<string>((ok) => { let s = ""; req.on("data", (d) => s += d); req.on("end", () => ok(s)) })
      if (!signatureValide(brut, req.headers["stripe-signature"] as string | undefined)) return json(res, 400, { erreur: "signature Stripe invalide" })
      await ecrireCompte(appliquerEvenement(await lireCompte(FICHIER_COMPTE), JSON.parse(brut)), FICHIER_COMPTE)
      return json(res, 200, { recu: true })
    }
    if (!autorise(req, res)) return
    const url = new URL(req.url ?? "/", "http://localhost")
    const p = url.pathname
    const seg = p.split("/").filter(Boolean)
    if (p === "/") { res.writeHead(200, { "content-type": mimeDe(UI) }); res.end(await pageAvecStats(await readFile(UI, "utf8"))); return }
    if (p === "/api/etat") return json(res, 200, await etat())
    if (p === "/api/intents/exemple.csv" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lpws-termes-synthetiques-exemple.csv"', "x-lpws-contenu": "synthetique" })
      res.end(await readFile(join(ROOT, "engine/intent/exemple.csv"))); return
    }
    if (p === "/api/clients" && req.method === "POST") {
      const { url: u } = await body(req)
      let cible: URL
      try { cible = new URL(String(u ?? "").trim()) ; if (!/^https?:$/.test(cible.protocol)) throw 0 } catch { return json(res, 400, { erreur: "Collez l’adresse complète de la page, avec https://" }) }
      await verifierAdresse(cible)
      const r = await capturer(cible.toString())
      return json(res, 202, { job: r.job.id, client: r.client, campagne: r.campagne, id: `${r.client}/${r.campagne}` })
    }
    if (p === "/api/compte" && req.method === "GET") return json(res, 200, await resumeCompte())
    if (p === "/api/compte" && req.method === "POST") {
      const b = await body(req); const c0 = await lireCompte(FICHIER_COMPTE)
      const r = Compte.safeParse({ ...c0, ...(b.buyer ? { buyer: { ...c0.buyer, ...b.buyer } } : {}), ...(b.marque ? { marque: { ...c0.marque, ...b.marque } } : {}),
        ...(b.facturation ? { facturation: b.facturation } : {}), ...(b.codePartenaire !== undefined ? { codePartenaire: String(b.codePartenaire).trim() || undefined } : {}),
        ...(b.conditions ? { conditions: { version: VERSION_CONDITIONS, accepteesLe: new Date().toISOString() } } : {}),
        // sans paiement en SaaS, le palier se change à la main (instance d'équipe, Régime sur devis)
        ...(b.palier && !FACTURATION ? { palier: b.palier } : {}) })
      if (!r.success) return json(res, 400, { erreur: r.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ") })
      await ecrireCompte(r.data, FICHIER_COMPTE); return json(res, 200, await resumeCompte())
    }
    if (p === "/api/compte/essai" && req.method === "POST") { await ecrireCompte(demarrerEssai(await lireCompte(FICHIER_COMPTE)), FICHIER_COMPTE); return json(res, 200, await resumeCompte()) }
    if (p === "/api/compte/abonnement" && req.method === "POST") {
      const b = await body(req)
      const retour = process.env.LPWS_URL_PUBLIQUE ?? `http://${req.headers.host}`
      const c0 = await lireCompte(FICHIER_COMPTE)
      const s = await sessionPaiement(c0, b.palier, retour)
      await ecrireCompte({ ...c0, stripe: { ...c0.stripe, session: s.id } }, FICHIER_COMPTE)
      return json(res, 200, { url: s.url })
    }
    if (p === "/api/conclure") {
      const q = url.searchParams
      const taux = Number(q.get("taux")?.replace(",", ".")) / 100, visiteursJour = Number(q.get("visiteurs"))
      if (!(taux > 0 && taux < 1) || !(visiteursJour > 0)) return json(res, 400, { erreur: "Il faut un taux de conversion (en %) et des visiteurs par jour." })
      const hausse = Number(q.get("hausse")?.replace(",", ".")) / 100, part = Number(q.get("part")) / 100
      return json(res, 200, planifier({ tauxBase: taux, visiteursJour, mde: hausse > 0 ? hausse : mdePour(visiteursJour * 30.4), part: part > 0 && part < 1 ? part : 0.5 }))
    }
    if (p === "/api/audit" && req.method === "POST") {
      const { url: u } = await body(req)
      let cible: URL
      try { cible = new URL(String(u ?? "").trim()); if (!/^https?:$/.test(cible.protocol)) throw 0 } catch { return json(res, 400, { erreur: "Collez l’adresse complète de la page, avec https://" }) }
      await verifierAdresse(cible)
      return json(res, 202, { job: lancerAudit(cible.toString(), join(ROOT, dossierAudit(cible.toString()))).id })
    }
    if (seg[0] === "api" && seg[1] === "jobs" && seg[2]) { const j = jobs.get(seg[2]); return j ? json(res, 200, j) : json(res, 404, { erreur: "job inconnu" }) }
    if (seg[0] === "api" && seg[1] === "clients" && seg[2] && seg[3]) {
      const [c, camp] = [seg[2], seg[3]]
      if (!existsSync(dossier(c, camp))) return json(res, 404, { erreur: "client inconnu" })
      if (seg[4] === "textes") return json(res, 200, await textes(c, camp))
      if (seg[4] === "tests" && !seg[5] && req.method === "POST") {
        const b = await body(req)
        if (!b.titre || !Array.isArray(b.edits) || !b.edits.length || b.edits.some((e: any) => !e.anchor || !e.text)) return json(res, 400, { erreur: "Il faut un titre et au moins un texte à changer." })
        const r = await creerTest(c, camp, { titre: String(b.titre), pourquoi: String(b.pourquoi || "le media buyer veut le vérifier"), edits: b.edits, ciblage: b.ciblage })
        return json(res, 202, { job: r.job.id, id: r.id })
      }
      if (seg[4] === "tests" && seg[5] && req.method === "POST") {
        const b = await body(req)
        const job = await changerEtat(c, camp, seg[5], b.etat === "live" || b.etat === "gagnant" ? b.etat : "stop", Number(b.part) || 50, b.reprise === true)
        return json(res, 202, { job: job.id })
      }
      if (seg[4] === "verifier" && req.method === "POST") return json(res, 202, { job: (await verifier(c, camp)).id })
      if (seg[4] === "audit" && req.method === "POST") {
        const meta = await lireJson<any>(fichiersDe(dossier(c, camp)).meta, null)
        if (!meta?.source) return json(res, 409, { erreur: "La page n’est pas encore copiée." })
        return json(res, 202, { job: lancerAudit(meta.source, dossier(c, camp)).id })
      }
      if (seg[4] === "surveiller" && req.method === "POST") return json(res, 202, { job: lancerSurveillance(dossier(c, camp)).id })
      if (seg[4] === "mandat" && req.method === "POST") {
        const par = String((await body(req)).par ?? "").trim()
        if (par.length < 2) return json(res, 400, { erreur: "Qui, chez le client, a donné le mandat ? (nom et fonction)" })
        const compte = await lireCompte(FICHIER_COMPTE)
        compte.mandats[c] = { par, signeLe: new Date().toISOString(), declaration: DECLARATION_MANDAT(await nomDuSite(dossier(c, camp), c), par) }
        await ecrireCompte(compte, FICHIER_COMPTE); return json(res, 200, compte.mandats[c])
      }
      if (seg[4] === "rapport" && seg[5] && req.method === "GET") {
        const html = await rapportHtml(dossier(c, camp), decodeURIComponent(seg[5]), await lireCompte(FICHIER_COMPTE))
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-disposition": `inline; filename="rapport-${slugify(seg[5])}.html"` }); res.end(html); return
      }
      if (seg[4] === "contexte" && req.method === "POST") return json(res, 202, { job: (await lancerBrain(c, camp, await body(req))).id })
      if (seg[4] === "intentions" && !seg[5] && req.method === "GET") return json(res, 200, await etatIntentions(c, camp))
      if (seg[4] === "intentions" && seg[5] === "import" && req.method === "POST")
        return json(res, 200, await importerIntentions(c, camp, await body(req, 7_000_000)))
      if (seg[4] === "intentions" && seg[5] === "decisions" && req.method === "POST")
        return json(res, 200, await deciderIntentions(c, camp, await body(req)))
      if (seg[4] === "intentions" && seg[5] === "generer" && req.method === "POST")
        return json(res, 202, { job: (await genererVariantes(c, camp, await body(req))).id })
      if (seg[4] === "intentions" && seg[5] === "propositions" && seg[6] && req.method === "GET")
        return json(res, 200, await propositionIntentions(c, camp, seg[6]))
      if (seg[4] === "intentions" && seg[5] === "simuler" && req.method === "POST")
        return json(res, 200, await simuler(c, camp, await body(req)))
      if (seg[4] === "intentions" && seg[5] === "connexion" && req.method === "POST")
        return json(res, 200, await connecter(c, camp, await body(req)))
      if (seg[4] === "intentions" && seg[5] === "mesure" && req.method === "POST")
        return json(res, 200, await configurerMesure(c, camp, await body(req)))
      if (seg[4] === "intentions" && seg[5] === "mesurer" && req.method === "POST")
        return json(res, 202, { job: (await mesurerIntentions(c, camp)).id })
      if (seg[4] === "propositions" && seg[5] && !seg[6] && req.method === "GET")
        return json(res, 200, await propositionIntentions(c, camp, seg[5]))
      if (seg[4] === "propositions" && seg[5] && seg[6] === "refuser" && req.method === "POST")
        return json(res, 200, await refuserProposition(c, camp, seg[5], await body(req)))
      if (seg[4] === "propositions" && seg[5] && seg[6] === "decliner" && req.method === "POST")
        return json(res, 202, { job: (await lancerDeclinaison(c, camp, seg[5], await body(req))).id })
      if (seg[4] === "propositions" && seg[5] && req.method === "POST") { const r = await creerTestDepuisProposition(c, camp, seg[5]); return json(res, 202, { job: r.job.id, id: r.id }) }
    }
    if (p.startsWith("/assets/")) return envoyerFichier(res, join(ROOT, "ui", "assets"), decodeURIComponent(p.slice(8)))
    if (p.startsWith("/files/")) return envoyerFichier(res, join(ROOT, CLIENTS_ROOT), decodeURIComponent(p.slice(7)))
    if ((seg[0] === "t" || seg[0] === "v") && seg[1])
      return envoyerFichier(res, join(DIST, seg[0]), decodeURIComponent(seg[1]), { "access-control-allow-origin": "*", "cache-control": "no-cache" })
    res.writeHead(404); res.end()
  } catch (e) { json(res, Number((e as { code?: number })?.code) || 500, { erreur: String((e as Error)?.message ?? e), action: (e as { action?: string })?.action }) }
}).listen(PORT, process.env.LPWS_HOTE ?? "127.0.0.1", () => step(SCOPE, `interface → http://${process.env.LPWS_HOTE ?? "localhost"}:${PORT} · tag publié sur ${BASE_TAGS}`))

if (process.env.LPWS_SURVEILLANCE) {
  let enCours = false
  const tour = async () => { if (enCours) return; enCours = true; try { await tourDeSurveillance(SCOPE) } catch (e) { step(SCOPE, `surveillance : ${(e as Error).message}`) } finally { enCours = false } }
  setInterval(tour, 3_600_000); setTimeout(tour, 30_000)
  step(SCOPE, "surveillance automatique active (LPWS_SURVEILLANCE)")
}
