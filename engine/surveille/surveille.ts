/**
 * surveille.ts — LA SURVEILLANCE DE PAGE : la vraie page, relue à intervalle régulier, comparée
 * au relevé précédent (docs/recherche/business-model.md §6 ; feuille de route 1.1.3, 3.2, 3.3).
 *
 * C'est ce qui fait passer LPWS d'un outil qu'on ouvre à un service qu'on paie chaque mois : le
 * buyer apprend que le tracking a cassé AVANT de brûler une semaine de budget. Chaque passage :
 *
 *   1. rejoue l'audit tracking (audit.ts) : statut, gclid, balises, consentement, LCP ;
 *   2. relit le haut de page (titre, sous-titre, boutons) et le compare à l'annonce
 *      (concordance.ts) ;
 *   3. vérifie que la balise Express répond si un test est en ligne ;
 *   4. écrit un relevé DATÉ dans surveillance/<date>.json — les relevés ne s'écrasent pas : c'est
 *      l'historique de la page, et la trace de ce qui a changé quand (1.1.3) ;
 *   5. compare au relevé précédent et ajoute les alertes à surveillance/alertes.json.
 *
 * Alertes (une par changement, pas une par passage) :
 *   page-hs · gclid-perdu · balise-perdue (GA4/Ads/Meta disparu) · express-absent (test en
 *   ligne, balise muette) · lcp (au-delà de 4 s, ou +30 % et au-delà de 2,5 s) · page-modifiee
 *   (titre changé : les ancres sont peut-être à re-lier, recapturer) · annonce-page (l'annonce
 *   a changé et la page ne suit plus : concordance sous 0,4 ou en baisse de 0,2).
 *
 * Usage : npm run surveille -- clients/<client>/<campagne>   |   npm run surveille -- --tout
 */
import { readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { createHash } from "node:crypto"
import { auditer, PageInjoignable, type Audit } from "../audit/audit.ts"
import { concordance, type Concordance } from "../variant/concordance.ts"
import { lancerNavigateur, nouvellePage, UA } from "../shared/navigateur.ts"
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { ecrireJson, lireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import { CLIENTS_ROOT } from "../shared/paths.ts"

const SCOPE = "surveille"

export type Releve = {
  quand: string
  url: string
  /** 0 = la page n'a pas répondu (voir `erreur`) */
  statut: number
  erreur?: string
  gclid: boolean
  balises: string[]
  lcpMs: number | null
  auditResume: Audit["resume"]
  hautDePage: { titre: string; sousTitre: string; boutons: string[] }
  empreinte: string
  /** empreinte de l'annonce au moment du relevé : pour voir qu'elle a changé */
  annonce: string | null
  concordance: Concordance | null
  /** null = aucun test en ligne, la question ne se pose pas */
  express: boolean | null
}

export type Alerte = { id: string; type: string; quand: string; titre: string; detail: string; gravite: "grave" | "attention" }

async function lireHautDePage(url: string, attendreBalise: boolean) {
  const b = await lancerNavigateur()
  try {
    const p = await nouvellePage(b, { viewport: { width: 1440, height: 900 }, userAgent: UA })
    await p.goto(url, { waitUntil: "load", timeout: 60_000 })
    const express = attendreBalise ? !!(await p.waitForFunction(() => (window as unknown as { __lpws?: unknown }).__lpws, { timeout: 12_000 }).catch(() => null)) : null
    await p.waitForTimeout(1_500)
    const haut = await p.evaluate(() => {
      const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 1100 }
      const txt = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim()
      const h1 = [...document.querySelectorAll("h1")].find(vis)
      const sous = [...document.querySelectorAll("h2, p")].find((e) => vis(e) && txt(e).length > 20 && !e.closest("nav, header, footer"))
      const boutons = [...document.querySelectorAll("a, button")].filter((e) => vis(e) && !e.closest("nav, footer") && txt(e).length > 1 && txt(e).length < 40)
        .map(txt).slice(0, 6)
      return { titre: txt(h1) || document.title, sousTitre: txt(sous).slice(0, 300), boutons }
    })
    return { haut, express }
  } finally { await b.close() }
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12)

export async function surveiller(campagneDir: string): Promise<{ releve: Releve; nouvelles: Alerte[] }> {
  const f = fichiersDe(campagneDir)
  const meta = await lireJson<{ source?: string } | null>(f.meta, null)
  if (!meta?.source) throw new Error(`${f.meta} sans URL source : copier la page d'abord`)
  const ctx = await lireJson<{ annonce?: { titre: string; description?: string; motsCles?: string[] } } | null>(f.contexte, null)
  const tests = await lireJson<Test[]>(f.tests, [])
  const enLigne = tests.some((t) => t.etat === "live")

  const precedents = await historique(campagneDir)
  const avant = precedents.find((r) => r.statut > 0)
  const nouvelles: Alerte[] = []
  const quand = new Date().toISOString()
  const alerte = (type: string, gravite: Alerte["gravite"], titre: string, detail: string) =>
    nouvelles.push({ id: `${quand}-${type}`, type, quand, titre, detail, gravite })
  const consigner = async (releve: Releve) => {
    await ecrireJson(f.releve(releve.quand.replace(/[:.]/g, "-")), releve)
    if (nouvelles.length) await ecrireJson(f.alertes, [...nouvelles, ...await lireJson<Alerte[]>(f.alertes, [])].slice(0, 200))
    return { releve, nouvelles }
  }

  const audit = await auditer(meta.source).catch((e: Error) => { if (e instanceof PageInjoignable) return e; throw e })
  if (audit instanceof PageInjoignable) {
    const releve: Releve = {
      quand, url: meta.source, statut: 0, erreur: audit.message, gclid: false, balises: [], lcpMs: null,
      auditResume: { grave: 0, attention: 0, aVerifier: 0, ok: 0 }, hautDePage: { titre: "", sousTitre: "", boutons: [] }, empreinte: "",
      annonce: null, concordance: null, express: null,
    }
    if (!precedents[0] || precedents[0].statut > 0 && precedents[0].statut < 400)
      alerte("page-hs", "grave", "La page ne répond plus", `${meta.source} : ${audit.message}. Chaque clic payé arrive dans le vide : coupez la campagne ou rétablissez la page.`)
    return consigner(releve)
  }
  await ecrireJson(f.audit, audit)
  const { haut, express } = await lireHautDePage(meta.source, enLigne)
  const texteHaut = [haut.titre, haut.sousTitre, ...haut.boutons].join(" · ")
  const releve: Releve = {
    quand, url: meta.source, statut: audit.statut,
    gclid: audit.constats.some((k) => k.id === "gclid" && k.niveau === "ok"), balises: audit.balises, lcpMs: audit.lcpMs,
    auditResume: audit.resume, hautDePage: haut, empreinte: hash(texteHaut),
    annonce: ctx?.annonce ? hash(JSON.stringify(ctx.annonce)) : null,
    concordance: ctx?.annonce ? concordance(ctx.annonce, texteHaut) : null,
    express,
  }

  // une alerte par CHANGEMENT : on ne répète pas celle du passage précédent
  const etaitOk = (cond: (r: Releve) => boolean) => !avant || cond(avant)

  if (releve.statut >= 400 && (!precedents[0] || precedents[0].statut > 0 && precedents[0].statut < 400)) alerte("page-hs", "grave", `La page répond ${releve.statut}`, `${releve.url} : chaque clic payé arrive sur une erreur. Coupez la campagne ou corrigez la page.`)
  if (!releve.gclid && etaitOk((r) => r.gclid)) alerte("gclid-perdu", "grave", "Le gclid ne survit plus jusqu'à la page", audit.constats.find((k) => k.id === "gclid")?.detail ?? "")
  if (avant) for (const b of avant.balises.filter((x) => !releve.balises.includes(x)))
    alerte("balise-perdue", "grave", `${b} a disparu de la page`, `Présente au relevé du ${avant.quand.slice(0, 10)}, absente aujourd'hui : les conversions ne remontent peut-être plus.`)
  if (releve.express === false && (!avant || avant.express !== false)) alerte("express-absent", "grave", "Un test est en ligne mais la balise Express ne répond pas", "Personne ne voit la variante : le test ne mesure rien. Vérifiez que la balise est toujours publiée dans GTM.")
  const lcp = releve.lcpMs, lcp0 = avant?.lcpMs
  if (lcp && ((lcp > 4000 && !(lcp0 && lcp0 > 4000)) || (lcp0 && lcp > 2500 && lcp > lcp0 * 1.3)))
    alerte("lcp", "attention", `La page ralentit : LCP mobile ${(lcp / 1000).toFixed(1)} s`, lcp0 ? `Il était de ${(lcp0 / 1000).toFixed(1)} s au relevé précédent. Un tir depuis un serveur : à confirmer.` : "Au-delà de 4 s, Google juge l'expérience mauvaise.")
  if (avant && avant.hautDePage.titre !== releve.hautDePage.titre)
    alerte("page-modifiee", "attention", "Le client a modifié le haut de la page", `Titre : « ${avant.hautDePage.titre.slice(0, 80)} » → « ${releve.hautDePage.titre.slice(0, 80)} ». Les tests préparés visent peut-être des blocs qui ont bougé : recapturez la page (le re-liage dira quelles ancres ont survécu).`)
  const c = releve.concordance, c0 = avant?.concordance
  if (c && ((c.score < 0.4 && (!c0 || c0.score >= 0.4)) || (c0 && c0.score - c.score >= 0.2)))
    alerte("annonce-page", "attention", `L'annonce et la page ne se parlent plus (concordance ${Math.round(c.score * 100)} %)`,
      `${avant && avant.annonce !== releve.annonce ? "L'annonce a changé depuis le dernier relevé. " : ""}Absents du haut de page : ${[...c.motsClesAbsents, ...c.motsTitreAbsents].slice(0, 6).join(", ") || "—"}. Un test de titre qui reprend l'annonce est le premier à lancer.`)

  return consigner(releve)
}

/** Les relevés d'une campagne, du plus récent au plus ancien. */
export async function historique(campagneDir: string): Promise<Releve[]> {
  const d = fichiersDe(campagneDir).surveillance
  if (!existsSync(d)) return []
  const noms = (await readdir(d)).filter((n) => /^\d{4}-.*\.json$/.test(n)).sort().reverse()
  return Promise.all(noms.map((n) => lireJson<Releve>(join(d, n), null as unknown as Releve))).then((xs) => xs.filter(Boolean))
}

/** Toutes les campagnes copiées : `clients/<client>/<campagne>/baseline/meta.json`. */
export async function toutesLesCampagnes(racine = CLIENTS_ROOT): Promise<string[]> {
  if (!existsSync(racine)) return []
  const out: string[] = []
  for (const c of await readdir(racine, { withFileTypes: true })) {
    if (!c.isDirectory()) continue
    for (const k of await readdir(join(racine, c.name), { withFileTypes: true }))
      if (k.isDirectory() && existsSync(fichiersDe(join(racine, c.name, k.name)).meta)) out.push(join(racine, c.name, k.name))
  }
  return out
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs(["--tout"])
  const cibles = args.drapeau("--tout") ? await toutesLesCampagnes() : args.libres
  if (!cibles.length) fail(SCOPE, "usage : npm run surveille -- clients/<client>/<campagne>  |  npm run surveille -- --tout")
  let echecs = 0
  for (const d of cibles) {
    try {
      const { releve, nouvelles } = await surveiller(d)
      step(SCOPE, `${basename(dirname(d))}/${basename(d)} · ${releve.statut} · gclid ${releve.gclid ? "ok" : "PERDU"} · ${releve.balises.length} balise(s) · LCP ${releve.lcpMs ?? "?"} ms${releve.concordance ? ` · concordance ${Math.round(releve.concordance.score * 100)} %` : ""} · ${nouvelles.length} alerte(s)`)
      for (const a of nouvelles) step(SCOPE, `  ${a.gravite === "grave" ? "GRAVE" : "ATT  "} ${a.titre}`)
    } catch (e) { echecs++; step(SCOPE, `${d} : ÉCHEC — ${(e as Error).message}`) }
  }
  if (echecs) process.exit(1)
}
