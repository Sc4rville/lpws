/** pipeline.ts : onboarder une page, lister ses textes, créer un test (à la main ou depuis le brain), le lancer ou l'arrêter. */
import { mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { lancerNavigateur, UA } from "../../engine/shared/navigateur.ts"
import { marque, slugify } from "../../engine/shared/paths.ts"
import { Contexte } from "../../engine/variant/contexte.ts"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test, type Express } from "../../engine/shared/campagne.ts"
import { enregistrerExperiences, marquerDeploye, planAuLancement, retirerExperience } from "../../engine/measure/experience.ts"
import { lireCompte, peutLancer } from "../../engine/compte/compte.ts"
import { CLIENTS_ROOT } from "../../engine/shared/paths.ts"
import { FACTURATION, FICHIER_COMPTE } from "./compte.ts"
import { ROOT, TSX, BASE_TAGS, dossier } from "./config.ts"
import { type Job, jobs, nouveauJob, dire, finir, lancer } from "./jobs.ts"
import { construireTag, appliquerParts, publierTag, sonderBalise, ecrireConfigClient } from "./tag.ts"
import { Ciblage } from "../../engine/intent/ciblage.ts"
import { ciblagesSeCroisent } from "../../engine/intent/routage.ts"
import { verrouillerCampagne } from "./verrou.ts"

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

/** Un ciblage fourni par l'appelant est validé une fois, ici ; invalide = 400, pas de test. */
function ciblageValide(x: unknown): Test["ciblage"] {
  if (x === undefined || x === null) return undefined
  const v = Ciblage.safeParse(x)
  if (!v.success) throw Object.assign(new Error("ciblage invalide : " + v.error.issues.map((i) => i.path.join(".") || i.message).join(", ")), { code: 400 })
  return v.data
}

export async function creerTest(c: string, camp: string, entree: { titre: string; pourquoi: string; edits: Array<{ anchor: string; text: string }>; ciblage?: unknown }) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(d)
  try {
  const ciblage = ciblageValide(entree.ciblage)
  const base = fichiersDe(d).baseline
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  let id = slugify(entree.titre).slice(0, 40) || "test"
  while (tests.some((t) => t.id === id)) id += "-2"
  const empreintes = await lireJson<Array<{ a: string; role: string; text: string }>>(fichiersDe(d).ancres, [])
  const txt = await textes(c, camp)
  const edits = entree.edits.map((e) => ({ anchor: e.anchor, text: e.text, avant: txt.find((t) => t.anchor === e.anchor)?.text ?? "" }))
  const job = nouveauJob("test")
  const teste = edits.map((e) => `« ${e.avant.slice(0, 60)} » devient « ${e.text.slice(0, 60)} »`).join(" · ")
  const test: Test = { id, titre: entree.titre, teste, pourquoi: entree.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id, ciblage }
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

  // le verrou couvre TOUTE la pipeline de fond : une mutation lancée pendant la
  // construction verrait un tests.json à moitié écrit et republierait dessus
  pipelineTest(job, c, camp, id, base, specPath)
    .catch((e) => { dire(job, String(e)); finir(job, false) })
    .finally(liberer)
  return { job, id }
  } catch (e) { liberer(); throw e }
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

/** Décliner une proposition : N variantes de plus sur le même constat, à la consigne du buyer (job). */
export async function lancerDeclinaison(c: string, camp: string, nom: string, entree: { consigne?: unknown; n?: unknown }): Promise<Job> {
  const d = dossier(c, camp)
  const props = await lireJson<Array<{ nom: string }>>(fichiersDe(d).propositions, [])
  if (!props.some((p) => p.nom === nom)) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
  if ([...jobs.values()].some((jb) => (jb.type === "decliner" || jb.type === "brain") && jb.etat === "en cours" && jb.campagne === d))
    throw Object.assign(new Error("LPWS écrit déjà pour cette page : attendez la fin, une à deux minutes"), { code: 409 })
  // « --x » en tête serait lu comme une option par la ligne de commande
  const consigne = String(entree.consigne ?? "").replace(/\s+/g, " ").trim().replace(/^-+\s*/, "").slice(0, 300)
  const n = Math.min(3, Math.max(1, Math.round(Number(entree.n) || 3)))
  const job = nouveauJob("decliner")
  job.campagne = d; job.sujet = nom
  ;(async () => {
    dire(job, `LPWS écrit ${n} autre${n > 1 ? "s" : ""} version${n > 1 ? "s" : ""} de ce test${consigne ? ` : « ${consigne} »` : ""}`)
    const args = [join(ROOT, "engine/variant/run.ts"), resolve(d), "--decliner", nom, "--n", String(n)]
    if (consigne) args.push("--consigne", consigne)
    finir(job, (await lancer(job, TSX, args)) === 0)
  })()
  return job
}

/** Une proposition du brain devient un test : même pipeline qu'un test écrit à la main. */
export async function creerTestDepuisProposition(c: string, camp: string, nom: string) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(d)
  try {
  const base = fichiersDe(d).baseline
  const props = await lireJson<Array<{ nom: string; titre: string; teste: string; pourquoi: string; regle: string; ciblage?: unknown }>>(fichiersDe(d).propositions, [])
  const p = props.find((x) => x.nom === nom)
  if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
  const ciblage = ciblageValide(p.ciblage)
  const specPath = fichiersDe(d).spec(nom)
  if (!existsSync(specPath)) throw Object.assign(new Error("la spec de cette proposition a disparu"), { code: 404 })
  const spec = await lireJson<any>(specPath, {})
  let tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  if (tests.some((t) => t.id === nom && t.etat !== "echec")) throw Object.assign(new Error("ce test existe déjà"), { code: 409 })
  tests = tests.filter((t) => t.id !== nom)
  const txt = await textes(c, camp)
  const edits = (spec.edits ?? []).map((e: any) => ({ anchor: e.anchor, text: e.text ?? `${e.op} ${e.before ? "avant " + e.before : e.after ? "après " + e.after : ""}`.trim(), avant: txt.find((t) => t.anchor === e.anchor)?.text ?? e.attendu?.text ?? "" }))
  const job = nouveauJob("test")
  tests.push({ id: nom, titre: p.titre, teste: p.teste, pourquoi: p.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id, regle: p.regle, ciblage })
  await ecrireJson(fichiersDe(d).tests, tests)
  pipelineTest(job, c, camp, nom, base, specPath)
    .catch((e) => { dire(job, String(e)); finir(job, false) })
    .finally(liberer)
  return { job, id: nom }
  } catch (e) { liberer(); throw e }
}

export async function changerEtat(c: string, camp: string, id: string, etat: "live" | "stop" | "gagnant", part: number, reprise = false) {
  const d = dossier(c, camp)
  // pris AVANT la moindre lecture, rendu quand la publication de fond est finie
  const liberer = verrouillerCampagne(d)
  try {
  const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const t = tests.find((x) => x.id === id)
  if (!t) throw new Error("test inconnu")
  /* LE MANDAT, PUIS LE PALIER : rien ne part en ligne sur un site dont le propriétaire n'a pas
   * mandaté le buyer (docs/recherche/business-model.md §7). Le palier ne limite qu'en SaaS. */
  if (etat === "live") {
    const compte = await lireCompte(FICHIER_COMPTE)
    const droit = FACTURATION ? await peutLancer(compte, c, join(ROOT, CLIENTS_ROOT))
      : compte.mandats[c] ? { ok: true as const } : { ok: false as const, action: "mandat" as const, raison: "Aucun mandat déclaré pour ce client : LPWS ne met rien en ligne sur un site sans l’accord écrit de son propriétaire. Déclarez-le une fois, puis lancez." }
    if (!droit.ok) throw Object.assign(new Error(droit.raison), { code: 402, action: droit.action })
  }
  /* PAS DE MISE EN LIGNE SANS BALISE.
   * Constaté en rejouant le parcours : le test passait « En ligne · 50 % » alors que la balise
   * n'était sur aucune page. Le buyer croyait tester, personne ne voyait la variante. On sonde
   * donc la vraie page au moment de lancer (il vient peut-être de publier GTM sans cliquer
   * « Vérifier »), et on refuse franchement si elle ne répond pas. */
  if (etat === "live") {
    /* Un test ciblé exige une balise qui sait router (intent-v1) : express.json peut être
     * ancien, donc on sonde la vraie page plutôt que de croire une vérification d'avant. */
    const ex = await lireJson<Express>(fichiersDe(d).express, { installe: false })
    const sonde = t.ciblage || !ex.installe ? await sonderBalise(c, camp) : ex
    if (!sonde.installe)
      throw Object.assign(new Error("La balise Express n’est pas encore sur la page : personne ne verrait la variante. Installez-la (Connexion → Express), publiez dans GTM, puis lancez le test."), { code: 409 })
    if (t.ciblage && sonde.capacite !== "intent-v1")
      throw Object.assign(new Error("La balise posée sur la page date d’avant le routage par intention : un test ciblé y serait servi à tout le monde. Republiez la balise (Connexion → Express), puis relancez."), { code: 409 })
  }
  /* Un test ciblé ne se lance que prêt (sa variante est construite), sur des routes
   * non vides, avec le contexte de l'annonce — sinon il routerait vers rien. */
  if (etat === "live" && t.ciblage) {
    const cb = Ciblage.safeParse(t.ciblage)
    if (!cb.success || cb.data.routes.length === 0)
      throw Object.assign(new Error("Le ciblage de ce test est invalide ou vide : rien ne routerait vers lui."), { code: 409 })
    const reprenable = reprise && t.etat === "stop" && !!t.lanceLe && !!t.plan && !!t.finLe
    if (t.etat !== "pret" && !reprenable)
      throw Object.assign(new Error("Un test ciblé se lance une fois sa variante construite (état « prêt ») : celui-ci est « " + t.etat + " »."), { code: 409 })
    if (!existsSync(fichiersDe(d).contexte))
      throw Object.assign(new Error("Un test ciblé demande le contexte de l’annonce (ce que promet l’annonce et comment se conclut la vente) : remplissez-le d’abord."), { code: 409 })
  }
  // un gagnant servi à 100 % capte tous les visiteurs DE SON AUDIENCE : un test qui vise
  // d'autres intentions reste possible, un test qui croise la sienne ne toucherait personne
  const deploye = tests.find((o) => o !== t && o.etat === "gagnant" && ciblagesSeCroisent(t.ciblage, o.ciblage))
  if (etat === "live" && deploye)
    throw Object.assign(new Error(`« ${deploye.titre} » est déployé sur cette page à 100 % : remettez l’original ou intégrez ce gagnant à la page avant de lancer un autre test.`), { code: 409 })
  // les visiteurs déjà comptés l'ont été à cette part : l'horizon et le contrôle de répartition en dépendent
  if (etat === "live" && t.etat === "live")
    throw Object.assign(new Error(`La part d’un test en cours ne change pas : les visiteurs déjà comptés l’ont été à ${t.part} %. Arrêtez le test puis relancez-le à la nouvelle part.`), { code: 409 })
  if (etat === "live" && (part <= 0 || part >= 100))
    throw Object.assign(new Error("Un test se lance entre 5 et 95 % : à 0 ou 100 %, il n’y a rien à comparer."), { code: 409 })
  if (etat === "gagnant" && t.etat !== "live" && t.etat !== "stop")
    throw Object.assign(new Error("seul un test lancé peut être déployé"), { code: 409 })
  const avant = tests.map((o) => [o.id, o.etat, o.part, o.lanceLe, o.finLe, o.plan, o.anciens, o.retireLe, o.experience] as const)
  const maintenant = new Date().toISOString()
  // seul un test qui collectait entre au journal : un test déjà arrêté a ses chiffres, on n'y touche plus
  const arretes = new Set<string>(), deployes = new Set<string>()
  const cesse = (o: Test) => { if (o.etat === "live") { o.finLe = maintenant; arretes.add(o.id) } }
  // annuler un arrêt reprend la MÊME expérience (même lancement, même horizon), sans repartir de zéro
  // … à condition qu'aucun autre test DE LA MÊME AUDIENCE n'ait été lancé depuis l'arrêt :
  // sa fenêtre engloberait l'intermède ; un test disjoint, lui, ne gêne pas la reprise
  const reprend = etat === "live" && reprise && t.etat === "stop" && !!t.lanceLe && !!t.plan && !!t.finLe
    && !tests.some((o) => o !== t && !!o.lanceLe && o.lanceLe >= t.finLe! && ciblagesSeCroisent(t.ciblage, o.ciblage))
  if (reprend) {
    t.etat = "live"; delete t.finLe
  } else if (etat === "live") {
    // l'horizon se fixe AVANT de regarder : c'est lui qui donne le droit de conclure
    if (t.lanceLe && t.finLe) t.anciens = [...(t.anciens ?? []), { lanceLe: t.lanceLe, finLe: t.finLe, part: t.part, plan: t.plan, experience: t.experience }]
    t.etat = "live"; t.part = part || 50; t.lanceLe = maintenant; delete t.finLe
    // chaque LANCEMENT reçoit son identifiant : la mesure isole alors cette fenêtre,
    // même quand des tests disjoints tournent en parallèle sur la même page
    t.experience = createHash("sha256").update(d + "\n" + t.id + "\n" + maintenant).digest("hex").slice(0, 32)
    t.plan = await planAuLancement(d, t.part / 100, !!t.ciblage)
    for (const o of tests) if (o !== t && o.etat === "live" && ciblagesSeCroisent(t.ciblage, o.ciblage)) { cesse(o); o.etat = "stop" }
  } else if (etat === "gagnant") {
    if (t.etat === "stop") deployes.add(t.id)
    cesse(t); t.etat = "gagnant"; t.part = 100
    for (const o of tests) if (o !== t && (o.etat === "live" || o.etat === "gagnant") && ciblagesSeCroisent(t.ciblage, o.ciblage)) { if (o.etat === "gagnant") o.retireLe = maintenant; cesse(o); o.etat = "stop"; o.part = 0 }
  } else {
    // « Remettre l'original » : un gagnant déployé redescend à 0 %, un test vivant s'arrête
    if (t.etat === "gagnant") { t.part = 0; t.retireLe = maintenant }
    cesse(t); t.etat = "stop"
  }
  await ecrireJson(fichiersDe(d).tests, tests)
  await appliquerParts(c, camp)
  const job = nouveauJob("config")
  ;(async () => {
   try {
    dire(job, etat === "live" ? `mise en ligne : ${t.part} % des visiteurs verront la variante` : etat === "gagnant" ? "déploiement : 100 % des visiteurs verront la variante" : "arrêt : l’original reprend 100 % du trafic")
    const code = await publierTag(job, c, camp)
    // l'état affiché doit être l'état EN LIGNE : si la publication rate, on revient en arrière et on dit pourquoi
    const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
    const cible = all.find((x) => x.id === id)
    if (code !== 0) {
      for (const [oid, oetat, opart, olance, ofin, oplan, oanciens, oretire, oexp] of avant) { const o = all.find((x) => x.id === oid); if (o) Object.assign(o, { etat: oetat, part: opart, lanceLe: olance, finLe: ofin, plan: oplan, anciens: oanciens, retireLe: oretire, experience: oexp }) }
      if (cible) cible.erreur = "La publication sur Vercel a échoué, rien n’a changé en ligne : " + job.lignes.slice(-3).join(" / ")
    } else if (cible) delete cible.erreur
    await ecrireJson(fichiersDe(d).tests, all)
    // publié : ce qui a cessé de collecter entre dans le journal du client
    if (code === 0) {
      try {
        for (const x of await enregistrerExperiences(d, all.filter((o) => arretes.has(o.id))))
          dire(job, `journal : « ${x.titre} » — ${x.conclusion}`)
        for (const o of all.filter((x) => deployes.has(x.id)))
          if (!(await marquerDeploye(d, o)))
            // l'arrêt n'avait pas été archivé : on l'archive maintenant, sur sa fenêtre de collecte
            for (const x of await enregistrerExperiences(d, [o])) dire(job, `journal : « ${x.titre} » — ${x.conclusion} (archivé au déploiement)`)
        if (reprend && cible) await retirerExperience(d, cible)
      } catch (e) { dire(job, `journal : non écrit (${(e as Error).message.split("\n")[0]}) — la mise en ligne, elle, est faite`) }
    } else {
      // la config fusionnée du client a déjà été écrite pour la tentative : elle repart de l'état restauré
      await appliquerParts(c, camp)
      await ecrireConfigClient(c, camp)
    }
    finir(job, code === 0)
   } catch (e) { dire(job, String(e)); finir(job, false) } finally { liberer() }
  })()
  return job
  } catch (e) { liberer(); throw e }
}
