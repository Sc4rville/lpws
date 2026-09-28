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
 *   POST /api/clients/<c>/<camp>/verifier   la balise est-elle posée sur la vraie page ? (job)
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
 * Le détail vit dans ui/server/ : config · jobs · etat · pipeline (tests) · tag (balise).
 *
 * Usage : npm run ui:serve   →   http://localhost:4700
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { CLIENTS_ROOT } from "../engine/shared/paths.ts"
import { step } from "../engine/shared/log.ts"
import { lireJson, ecrireJson } from "../engine/shared/json.ts"
import { envoyerFichier, envoyerJson as json } from "../engine/shared/http.ts"
import { mimeDe } from "../engine/shared/mime.ts"
import { campagne as fichiersDe } from "../engine/shared/campagne.ts"
import { pageAvecStats } from "./stats-embarque.ts"
import { ROOT, DIST, BASE_TAGS, dossier } from "./server/config.ts"
import { jobs } from "./server/jobs.ts"
import { etat } from "./server/etat.ts"
import { capturer, textes, creerTest, lancerBrain, creerTestDepuisProposition, changerEtat } from "./server/pipeline.ts"
import { verifier } from "./server/tag.ts"

const SCOPE = "ui"
const PORT = Number(process.env.PORT ?? 4700)
const UI = join(ROOT, "ui", "index.html")

/* ---------- http ---------- */
const body = (req: IncomingMessage) => new Promise<any>((ok, ko) => { let s = ""; req.on("data", (d) => s += d); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}) } catch (e) { ko(e) } }) })

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
    if (!autorise(req, res)) return
    const url = new URL(req.url ?? "/", "http://localhost")
    const p = url.pathname
    const seg = p.split("/").filter(Boolean)
    if (p === "/") { res.writeHead(200, { "content-type": mimeDe(UI) }); res.end(await pageAvecStats(await readFile(UI, "utf8"))); return }
    if (p === "/api/etat") return json(res, 200, await etat())
    if (p === "/api/clients" && req.method === "POST") {
      const { url: u } = await body(req)
      let cible: URL
      try { cible = new URL(String(u ?? "").trim()) ; if (!/^https?:$/.test(cible.protocol)) throw 0 } catch { return json(res, 400, { erreur: "Collez l’adresse complète de la page, avec https://" }) }
      const r = await capturer(cible.toString())
      return json(res, 202, { job: r.job.id, client: r.client, campagne: r.campagne, id: `${r.client}/${r.campagne}` })
    }
    if (seg[0] === "api" && seg[1] === "jobs" && seg[2]) { const j = jobs.get(seg[2]); return j ? json(res, 200, j) : json(res, 404, { erreur: "job inconnu" }) }
    if (seg[0] === "api" && seg[1] === "clients" && seg[2] && seg[3]) {
      const [c, camp] = [seg[2], seg[3]]
      if (!existsSync(dossier(c, camp))) return json(res, 404, { erreur: "client inconnu" })
      if (seg[4] === "textes") return json(res, 200, await textes(c, camp))
      if (seg[4] === "tests" && !seg[5] && req.method === "POST") {
        const b = await body(req)
        if (!b.titre || !Array.isArray(b.edits) || !b.edits.length || b.edits.some((e: any) => !e.anchor || !e.text)) return json(res, 400, { erreur: "Il faut un titre et au moins un texte à changer." })
        const r = await creerTest(c, camp, { titre: String(b.titre), pourquoi: String(b.pourquoi || "le media buyer veut le vérifier"), edits: b.edits })
        return json(res, 202, { job: r.job.id, id: r.id })
      }
      if (seg[4] === "tests" && seg[5] && req.method === "POST") {
        const b = await body(req)
        const job = await changerEtat(c, camp, seg[5], b.etat === "live" || b.etat === "gagnant" ? b.etat : "stop", Number(b.part) || 50)
        return json(res, 202, { job: job.id })
      }
      if (seg[4] === "verifier" && req.method === "POST") return json(res, 202, { job: (await verifier(c, camp)).id })
      if (seg[4] === "contexte" && req.method === "POST") return json(res, 202, { job: (await lancerBrain(c, camp, await body(req))).id })
      if (seg[4] === "propositions" && seg[5] && seg[6] === "refuser" && req.method === "POST") {
        const f = fichiersDe(dossier(c, camp)).propositions
        const props = await lireJson<any[]>(f, [])
        const p = props.find((x) => x.nom === seg[5]); if (!p) return json(res, 404, { erreur: "proposition inconnue" })
        // gardée, pas effacée : une variante refusée par le buyer est un signal sur nos diagnostics (feuille de route 4.1)
        p.refusee = true; p.refuseeLe = new Date().toISOString(); p.raison = String((await body(req)).raison ?? "")
        await ecrireJson(f, props); return json(res, 200, { ok: true })
      }
      if (seg[4] === "propositions" && seg[5] && req.method === "POST") { const r = await creerTestDepuisProposition(c, camp, seg[5]); return json(res, 202, { job: r.job.id, id: r.id }) }
    }
    if (p.startsWith("/assets/")) return envoyerFichier(res, join(ROOT, "ui", "assets"), decodeURIComponent(p.slice(8)))
    if (p.startsWith("/files/")) return envoyerFichier(res, join(ROOT, CLIENTS_ROOT), decodeURIComponent(p.slice(7)))
    if ((seg[0] === "t" || seg[0] === "v") && seg[1])
      return envoyerFichier(res, join(DIST, seg[0]), decodeURIComponent(seg[1]), { "access-control-allow-origin": "*", "cache-control": "no-cache" })
    res.writeHead(404); res.end()
  } catch (e) { json(res, Number((e as { code?: number })?.code) || 500, { erreur: String((e as Error)?.message ?? e) }) }
}).listen(PORT, process.env.LPWS_HOTE ?? "127.0.0.1", () => step(SCOPE, `interface → http://${process.env.LPWS_HOTE ?? "localhost"}:${PORT} · tag publié sur ${BASE_TAGS}`))
