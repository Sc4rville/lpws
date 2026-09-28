/** suivi.ts : audit tracking et surveillance de la vraie page, en jobs. */
import { readdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { CLIENTS_ROOT } from "../../engine/shared/paths.ts"
import { step } from "../../engine/shared/log.ts"
import { ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe } from "../../engine/shared/campagne.ts"
import { auditer } from "../../engine/audit/audit.ts"
import { surveiller, historique } from "../../engine/surveille/surveille.ts"
import { lireCompte, palierEnVigueur } from "../../engine/compte/compte.ts"
import { ROOT } from "./config.ts"
import { type Job, jobs, nouveauJob, dire, finir } from "./jobs.ts"
import { FACTURATION, FICHIER_COMPTE } from "./compte.ts"

/** Audits et relevés ouvrent chacun un Chromium : pas plus de deux à la fois sur le serveur. */
const CHROMIUM_SIMULTANES = 2
const creneauLibre = () => [...jobs.values()].filter((j) => (j.type === "audit" || j.type === "surveillance") && j.etat === "en cours").length < CHROMIUM_SIMULTANES
function reserverCreneau() {
  if (!creneauLibre()) throw Object.assign(new Error("Deux relevés tournent déjà : réessayez dans une minute."), { code: 429 })
}

export function lancerAudit(url: string, cible: string): Job {
  reserverCreneau()
  const job = nouveauJob("audit")
  ;(async () => {
    try {
      dire(job, `ouverture de ${url} comme un clic Google Ads (gclid + UTM), sur mobile`)
      const a = await auditer(url)
      await ecrireJson(fichiersDe(cible).audit, a)
      for (const k of a.constats) dire(job, `${k.niveau === "ok" ? "✓" : k.niveau === "grave" ? "✗" : "!"} ${k.titre}`)
      finir(job, true, a)
    } catch (e) { dire(job, (e as Error).message); finir(job, false) }
  })()
  return job
}

export function lancerSurveillance(d: string): Job {
  reserverCreneau()
  const job = nouveauJob("surveillance")
  job.campagne = d
  ;(async () => {
    try {
      dire(job, "relevé : audit tracking, haut de page, balise, concordance avec l’annonce")
      const { releve, nouvelles } = await surveiller(d)
      dire(job, `${releve.statut} · gclid ${releve.gclid ? "ok" : "perdu"} · LCP ${releve.lcpMs ?? "?"} ms · ${nouvelles.length} alerte(s)`)
      for (const a of nouvelles) dire(job, a.titre)
      finir(job, true, { releve, nouvelles })
    } catch (e) { dire(job, (e as Error).message); finir(job, false) }
  })()
  return job
}

/** La surveillance passe toute seule, au rythme du palier (Solo hebdo, Agence quotidien). LPWS_SURVEILLANCE=1 pour l'activer. */
export async function tourDeSurveillance(scope: string) {
  const compte = await lireCompte(FICHIER_COMPTE)
  const h = FACTURATION ? palierEnVigueur(compte).surveillanceH : Number(process.env.LPWS_SURVEILLANCE_H ?? 24)
  if (!h) return
  const root = join(ROOT, CLIENTS_ROOT)
  if (!existsSync(root)) return
  for (const c of await readdir(root)) {
    const cdir = join(root, c)
    if (c.startsWith("_") || !(await stat(cdir)).isDirectory()) continue
    for (const camp of await readdir(cdir)) {
      const d = join(cdir, camp)
      if (!existsSync(fichiersDe(d).meta)) continue
      const dernier = (await historique(d))[0]
      if (dernier && Date.now() - Date.parse(dernier.quand) < h * 3_600_000) continue
      if ([...jobs.values()].some((j) => j.type === "surveillance" && j.etat === "en cours" && j.campagne === d)) continue
      // le tour programmé attend son créneau au lieu d'échouer
      while (!creneauLibre()) await new Promise((r) => setTimeout(r, 5_000))
      const job = lancerSurveillance(d)
      while (job.etat === "en cours") await new Promise((r) => setTimeout(r, 2_000))
      step(scope, `surveillance ${c}/${camp} : ${job.lignes.at(-1) ?? ""}`)
    }
  }
}
