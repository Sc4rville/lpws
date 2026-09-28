/** pipeline.ts : onboarder une page, lister ses textes, créer un test (à la main ou depuis le brain), le lancer ou l'arrêter. */
import { mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { lancerNavigateur, UA } from "../../engine/shared/navigateur.ts"
import { marque, slugify } from "../../engine/shared/paths.ts"
import { Contexte } from "../../engine/variant/contexte.ts"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test, type Express } from "../../engine/shared/campagne.ts"
import { enregistrerExperiences, planAuLancement } from "../../engine/measure/experience.ts"
import { ROOT, TSX, BASE_TAGS, dossier } from "./config.ts"
import { type Job, nouveauJob, dire, finir, lancer } from "./jobs.ts"
import { construireTag, appliquerParts, publierTag, sonderBalise } from "./tag.ts"

/* ---------- onboarder une page : la capture, en sous-processus ---------- */
export async function capturer(url: string): Promise<{ job: Job; client: string; campagne: string }> {
  const client = marque(url)
  const campagne = slugify(new URL(url).pathname) || "campagne-1"
  const d = dossier(client, campagne)
  await mkdir(d, { recursive: true })
  const job = nouveauJob("capture")
  await ecrireJson(fichiersDe(d).enCours, { url, job: job.id, debut: job.debut })
  ;(async () => {
    const code = await lancer(job, TSX, [join(ROOT, "engine/clone/run.ts"), url, "--client", client, "--campaign", campagne])
    // exit 1 = capture faite mais pas fidèle : la page existe, le juge a dit non : c'est un résultat
    const meta = existsSync(fichiersDe(d).meta)
    finir(job, code === 0 || meta, { client, campagne, fidele: code === 0 })
    if (meta) { try { await rm(fichiersDe(d).enCours) } catch {} }
  })()
  return { job, client, campagne }
}

/* ---------- les textes qu'un test peut changer ---------- */
type Texte = { anchor: string; tag: string; text: string; top: number }
export async function textes(c: string, camp: string): Promise<Texte[]> {
  const base = fichiersDe(dossier(c, camp)).baseline
  const cache = join(base, "textes-v2.json")
  const deja = await lireJson<Texte[] | null>(cache, null)
  if (deja) return deja
  if (!existsSync(join(base, "capture.html"))) return []
  const browser = await lancerNavigateur()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent: UA })
    await page.goto("file://" + join(base, "capture.html"), { waitUntil: "domcontentloaded", timeout: 60_000 })
    // ce que le buyer veut changer d'abord : le titre, l'accroche, le bouton : pas le menu
    const out: Texte[] = await page.evaluate(() => {
      const res: Array<Texte & { prio: number }> = []
      const bruit = /^(skip to content|log ?in|sign in|sign up|high contrast|select a language|_+$|menu|close|search|cookie|accept|privacy)/i
      document.querySelectorAll("[data-lpws]").forEach((el) => {
        const tag = el.tagName.toLowerCase()
        if (!/^(h[1-6]|a|button|p)$/.test(tag)) return
        if (el.closest("nav, header, footer, [role=navigation], [aria-hidden=true]")) return
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
        if (text.length < 3 || text.length > 200 || bruit.test(text)) return
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return
        const prio = tag === "h1" ? 0 : tag === "h2" ? 1 : tag === "h3" ? 2 : tag === "button" || tag === "a" ? 3 : 4
        res.push({ anchor: el.getAttribute("data-lpws")!, tag, text, top: Math.round(r.top + window.scrollY), prio })
      })
      return res.sort((a, b) => a.prio - b.prio || a.top - b.top).slice(0, 60).map(({ prio, ...x }) => x)
    })
    await ecrireJson(cache, out)
    return out
  } finally { await browser.close() }
}

/* ---------- créer un test : spec → variante → tag → Vercel ---------- */
/** Les trois pas d'un test, du fichier de spec à la balise publiée. Partagé : test écrit à la
 *  main par le buyer, ou proposé par le brain. */
async function pipelineTest(job: Job, c: string, camp: string, id: string, base: string, specPath: string) {
  const d = dossier(c, camp)
    const maj = async (patch: Partial<Test>) => {
      const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
      const t = all.find((x) => x.id === id); if (t) Object.assign(t, patch)
      await ecrireJson(fichiersDe(d).tests, all)
    }
    dire(job, "1 · la variante : on applique le changement sur la copie et on la photographie")
    let code = await lancer(job, TSX, [join(ROOT, "engine/apply/run.ts"), base, specPath])
    if (code !== 0) { await maj({ etat: "echec", erreur: "La variante n’a pas pu être produite : " + job.lignes.slice(-3).join(" / ") }); finir(job, false); return }
    dire(job, "2 · le tag : on retrouve chaque cible sur la vraie page et on prépare la balise")
    code = await construireTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La cible n’a pas été retrouvée sur la page en ligne : " + job.lignes.slice(-4).join(" / ") }); finir(job, false); return }
    dire(job, "3 · en ligne : on publie la balise et la config sur " + BASE_TAGS)
    code = await publierTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La publication sur Vercel a échoué : " + job.lignes.slice(-3).join(" / ") }); finir(job, false); return }
    await maj({ etat: "pret", erreur: undefined })
    finir(job, true, { id })
}

export async function creerTest(c: string, camp: string, entree: { titre: string; pourquoi: string; edits: Array<{ anchor: string; text: string }> }) {
  const d = dossier(c, camp); const base = fichiersDe(d).baseline
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  let id = slugify(entree.titre).slice(0, 40) || "test"
  while (tests.some((t) => t.id === id)) id += "-2"
  const empreintes = await lireJson<Array<{ a: string; role: string; text: string }>>(fichiersDe(d).ancres, [])
  const txt = await textes(c, camp)
  const edits = entree.edits.map((e) => ({ anchor: e.anchor, text: e.text, avant: txt.find((t) => t.anchor === e.anchor)?.text ?? "" }))
  const job = nouveauJob("test")
  const teste = edits.map((e) => `« ${e.avant.slice(0, 60)} » devient « ${e.text.slice(0, 60)} »`).join(" · ")
  const test: Test = { id, titre: entree.titre, teste, pourquoi: entree.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id }
  tests.push(test)
  await ecrireJson(fichiersDe(d).tests, tests)

  const spec = {
    nom: id,
    hypothese: `Si ${teste}, alors les conversions augmentent, parce que ${entree.pourquoi}`.slice(0, 600).padEnd(20, "."),
    metrique: "conversions Google Ads sur le trafic payant",
    risque: "test défini à la main par le media buyer : à relire avant lancement",
    diagnostic: { regle: "media-buyer", signal: `édition manuelle : ${entree.titre}`, priorite: "MEDIUM", confiance: "Medium", preuve: "intuition du media buyer : pas de règle KB" },
    edits: edits.map((e) => {
      const emp = empreintes.find((x) => x.a === e.anchor)
      return { anchor: e.anchor, op: "set", text: e.text, pourquoi: entree.pourquoi, ...(emp ? { attendu: { role: emp.role, text: emp.text } } : {}) }
    }),
  }
  const specPath = fichiersDe(d).spec(id)
  await ecrireJson(specPath, spec)

  pipelineTest(job, c, camp, id, base, specPath)
  return { job, id }
}

/** Le brain : écrit context.json, puis signaux → jugement → diagnostic → 3 specs (job). */
export async function lancerBrain(c: string, camp: string, contexte: unknown): Promise<Job> {
  const d = dossier(c, camp)
  const v = Contexte.safeParse(contexte)
  if (!v.success) throw Object.assign(new Error("Il manque au moins ce que promet l’annonce et comment se conclut la vente : " + v.error.issues.map((i) => i.path.join(".")).join(", ")), { code: 400 })
  await ecrireJson(fichiersDe(d).contexte, v.data)
  const job = nouveauJob("brain")
  job.campagne = d
  ;(async () => {
    dire(job, "1 · LPWS lit la page : titres, boutons, preuves, prix")
    dire(job, "2 · puis juge ce qui ne se compte pas, et compare à l’annonce")
    dire(job, "3 · puis écrit trois variantes, une par cible")
    const code = await lancer(job, TSX, [join(ROOT, "engine/variant/run.ts"), resolve(d), "--refaire"])
    finir(job, code === 0)
  })()
  return job
}

/** Une proposition du brain devient un test : même pipeline qu'un test écrit à la main. */
export async function creerTestDepuisProposition(c: string, camp: string, nom: string) {
  const d = dossier(c, camp); const base = fichiersDe(d).baseline
  const props = await lireJson<Array<{ nom: string; titre: string; teste: string; pourquoi: string; regle: string }>>(fichiersDe(d).propositions, [])
  const p = props.find((x) => x.nom === nom)
  if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
  const specPath = fichiersDe(d).spec(nom)
  if (!existsSync(specPath)) throw Object.assign(new Error("la spec de cette proposition a disparu"), { code: 404 })
  const spec = await lireJson<any>(specPath, {})
  let tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  if (tests.some((t) => t.id === nom && t.etat !== "echec")) throw Object.assign(new Error("ce test existe déjà"), { code: 409 })
  tests = tests.filter((t) => t.id !== nom)
  const txt = await textes(c, camp)
  const edits = (spec.edits ?? []).map((e: any) => ({ anchor: e.anchor, text: e.text ?? `${e.op} ${e.before ? "avant " + e.before : e.after ? "après " + e.after : ""}`.trim(), avant: txt.find((t) => t.anchor === e.anchor)?.text ?? e.attendu?.text ?? "" }))
  const job = nouveauJob("test")
  tests.push({ id: nom, titre: p.titre, teste: p.teste, pourquoi: p.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id })
  await ecrireJson(fichiersDe(d).tests, tests)
  pipelineTest(job, c, camp, nom, base, specPath)
  return { job, id: nom }
}

export async function changerEtat(c: string, camp: string, id: string, etat: "live" | "stop" | "gagnant", part: number) {
  const d = dossier(c, camp)
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const t = tests.find((x) => x.id === id)
  if (!t) throw new Error("test inconnu")
  /* PAS DE MISE EN LIGNE SANS BALISE.
   * Constaté en rejouant le parcours : le test passait « En ligne · 50 % » alors que la balise
   * n'était sur aucune page. Le buyer croyait tester, personne ne voyait la variante. On sonde
   * donc la vraie page au moment de lancer (il vient peut-être de publier GTM sans cliquer
   * « Vérifier »), et on refuse franchement si elle ne répond pas. */
  if (etat === "live") {
    const ex = await lireJson<Express>(fichiersDe(d).express, { installe: false })
    const sonde = ex.installe ? ex : await sonderBalise(c, camp)
    if (!sonde.installe)
      throw Object.assign(new Error("La balise Express n’est pas encore sur la page : personne ne verrait la variante. Installez-la (Connexion → Express), publiez dans GTM, puis lancez le test."), { code: 409 })
  }
  // un gagnant servi à 100 % capte tous les visiteurs : un nouveau test ne toucherait personne
  const deploye = tests.find((o) => o !== t && o.etat === "gagnant")
  if (etat === "live" && deploye)
    throw Object.assign(new Error(`« ${deploye.titre} » est déployé sur cette page à 100 % : remettez l’original ou intégrez ce gagnant à la page avant de lancer un autre test.`), { code: 409 })
  if (etat === "gagnant" && t.etat !== "live" && t.etat !== "stop")
    throw Object.assign(new Error("seul un test lancé peut être déployé"), { code: 409 })
  const avant = tests.map((o) => [o.id, o.etat, o.part, o.lanceLe, o.finLe, o.plan] as const)
  const maintenant = new Date().toISOString()
  // un test qui cesse de collecter : sa date de fin fige le verdict qu'on archivera
  const arretes = new Set<string>()
  const cesse = (o: Test) => { if (o.etat === "live") o.finLe = maintenant; if (o.lanceLe) arretes.add(o.id) }
  if (etat === "live") {
    // l'horizon se fixe AVANT de regarder : c'est lui qui donne le droit de conclure
    t.etat = "live"; t.part = part || 50; t.lanceLe = maintenant; delete t.finLe
    t.plan = await planAuLancement(d, t.part / 100)
    for (const o of tests) if (o !== t && o.etat === "live") { cesse(o); o.etat = "stop" }
  } else if (etat === "gagnant") {
    cesse(t); t.etat = "gagnant"; t.part = 100
    for (const o of tests) if (o !== t && (o.etat === "live" || o.etat === "gagnant")) { cesse(o); o.etat = "stop"; o.part = 0 }
  } else {
    // « Remettre l'original » : un gagnant déployé redescend à 0 %, un test vivant s'arrête
    if (t.etat === "gagnant") t.part = 0
    cesse(t); t.etat = "stop"
  }
  await ecrireJson(fichiersDe(d).tests, tests)
  await appliquerParts(c, camp)
  const job = nouveauJob("config")
  ;(async () => {
    dire(job, etat === "live" ? `mise en ligne : ${t.part} % des visiteurs verront la variante` : etat === "gagnant" ? "déploiement : 100 % des visiteurs verront la variante" : "arrêt : l’original reprend 100 % du trafic")
    const code = await publierTag(job, c, camp)
    // l'état affiché doit être l'état EN LIGNE : si la publication rate, on revient en arrière et on dit pourquoi
    const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
    const cible = all.find((x) => x.id === id)
    if (code !== 0) {
      for (const [oid, oetat, opart, olance, ofin, oplan] of avant) { const o = all.find((x) => x.id === oid); if (o) Object.assign(o, { etat: oetat, part: opart, lanceLe: olance, finLe: ofin, plan: oplan }) }
      if (cible) cible.erreur = "La publication sur Vercel a échoué, rien n’a changé en ligne : " + job.lignes.slice(-3).join(" / ")
    } else if (cible) delete cible.erreur
    await ecrireJson(fichiersDe(d).tests, all)
    // publié : ce qui a cessé de collecter entre dans le journal du client
    if (code === 0)
      for (const x of await enregistrerExperiences(d, all.filter((o) => arretes.has(o.id))))
        dire(job, `journal : « ${x.titre} » — ${x.conclusion}`)
    if (code !== 0) await appliquerParts(c, camp)
    finir(job, code === 0)
  })()
  return job
}
