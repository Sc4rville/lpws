/** pipeline.ts : onboarder une page, lister ses textes, créer un test (à la main ou depuis le brain), le lancer ou l'arrêter. */
import { mkdir, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { z } from "zod"
import { lancerNavigateur, UA } from "../../engine/shared/navigateur.ts"
import { marque, slugify } from "../../engine/shared/paths.ts"
import { Contexte, texteAnnonce } from "../../engine/variant/contexte.ts"
import { controler, texteDuHtml } from "../../engine/variant/garde.ts"
import type { SignauxMecaniques } from "../../engine/variant/signaux.ts"
import { VariantSpec } from "../../engine/apply/spec.ts"
import { lireJson, ecrireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test, type Express } from "../../engine/shared/campagne.ts"
import { enregistrerExperiences, marquerDeploye, planAuLancement, retirerExperience, MOTIFS, estMotif } from "../../engine/measure/experience.ts"
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
  const cache = join(base, "textes-v3.json")
  const enrichir = async (out: Texte[]): Promise<Texte[]> => {
    const m = await lireJson<SignauxMecaniques | null>(fichiersDe(dossier(c, camp)).signaux, null)
    const structures: Texte[] = [m?.nav.presente && m.nav.anchor ? { anchor: m.nav.anchor, tag: "nav", text: "Navigation principale", top: 0 } : null,
      ...m?.sections.map((s) => ({ anchor: s.anchor, tag: "section", text: s.titre || "Section sans titre", top: s.y })) ?? []]
      .filter((x): x is Texte => x !== null && !!x.anchor && !out.some((t) => t.anchor === x.anchor))
    return [...out, ...structures]
  }
  const deja = await lireJson<Texte[] | null>(cache, null)
  if (deja) return enrichir(deja)
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
    return enrichir(out)
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
    const verdict = await lireJson<{ propre?: boolean | null; sections?: Record<string, { debordements?: string[] }> }>(
      join(fichiersDe(d).variante(id), "variant.json"), {})
    if (verdict.propre === false) {
      const debordements = Object.entries(verdict.sections ?? {}).flatMap(([vue, section]) =>
        (section.debordements ?? []).map((anchor) => `${anchor} (${vue})`))
      await maj({ etat: "echec", erreur: `La variante modifie aussi des sections non visées : ${debordements.join(", ")}. Vérifiez l’aperçu et adaptez les changements avant de lancer.` })
      finir(job, false)
      return
    }
    dire(job, "2 · le tag : on retrouve chaque cible sur la vraie page et on prépare la balise")
    code = await construireTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La cible n’a pas été retrouvée sur la page en ligne : " + job.lignes.slice(-4).join(" / ") }); finir(job, false); return }
    dire(job, "3 · en ligne : on publie la balise et la config sur " + BASE_TAGS)
    code = await publierTag(job, c, camp)
    if (code !== 0) { await maj({ etat: "echec", erreur: "La publication sur Vercel a échoué : " + job.lignes.slice(-3).join(" / ") }); finir(job, false); return }
    await maj({ etat: "pret", erreur: undefined })
    finir(job, true, { id })
}

function ciblageValide(x: unknown): Test["ciblage"] {
  if (x === undefined || x === null) return undefined
  const v = Ciblage.safeParse(x)
  if (!v.success) throw Object.assign(new Error("ciblage invalide : " + v.error.issues.map((i) => i.path.join(".") || i.message).join(", ")), { code: 400 })
  return v.data
}

async function marquerEchec(d: string, id: string, job: Job, e: unknown) {
  dire(job, String(e))
  const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
  const t = all.find((x) => x.id === id)
  if (t && t.etat === "prep") { t.etat = "echec"; t.erreur = String(e instanceof Error ? e.message : e); await ecrireJson(fichiersDe(d).tests, all) }
  finir(job, false)
}

const OPS = ["set", "remove", "move", "swap", "duplicate"] as const
const ANCRE = z.string().regex(/^[es][0-9]+$/)
const ENTREE_TEST = z.object({
  titre: z.string().trim().min(1).max(100),
  pourquoi: z.string().trim().min(3).max(1000),
  edits: z.array(z.object({
    anchor: ANCRE,
    op: z.enum(OPS).default("set"),
    text: z.string().trim().min(1).max(1200).optional(),
    before: ANCRE.optional(),
    after: ANCRE.optional(),
    with: ANCRE.optional(),
  })).min(1).max(6),
  ciblage: Ciblage.optional(),
})
type EditionBuyer = { anchor: string; op?: (typeof OPS)[number]; text?: string; before?: string; after?: string; with?: string }

export async function creerTest(c: string, camp: string, entree: { titre: string; pourquoi: string; edits: EditionBuyer[]; ciblage?: unknown }) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const v = ENTREE_TEST.safeParse(entree)
    if (!v.success) throw Object.assign(new Error("test invalide : " + v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")), { code: 400 })
    const invalide = (message: string): never => { throw Object.assign(new Error(message), { code: 400 }) }
    const base = fichiersDe(d).baseline
    const txt = await textes(c, camp)
    const empreintes = await lireJson<Array<{ a: string; tag?: string; role: string; text: string }>>(fichiersDe(d).ancres, [])
    const autorises = new Map<string, Texte>([
      ...empreintes.map((x): [string, Texte] => [x.a, { anchor: x.a, tag: x.tag ?? (x.role === "cta" ? "button" : "p"), text: x.text, top: 0 }]),
      ...txt.map((t): [string, Texte] => [t.anchor, t]),
    ])
    const structure = (a: string) => ["nav", "section"].includes(autorises.get(a)?.tag ?? "")
    const deja = new Set<string>()
    for (const e of v.data.edits) {
      if (!autorises.has(e.anchor) || deja.has(e.anchor)) invalide(`Cible ${e.anchor} introuvable sur cette page ou sélectionnée deux fois.`)
      deja.add(e.anchor)
      if (e.op === "set" && (!e.text || e.text === autorises.get(e.anchor)!.text || structure(e.anchor))) invalide("Le nouveau texte doit changer une cible textuelle.")
      const destination = e.before ?? e.after ?? e.with
      if (["move", "duplicate", "swap"].includes(e.op) && (!destination || !autorises.has(destination) || destination === e.anchor)) invalide("Choisissez une autre cible de la page pour déplacer, copier ou échanger.")
      if (structure(e.anchor) && destination && !structure(destination)) invalide("Un bloc entier doit être placé par rapport à un autre bloc entier.")
      if (["move", "duplicate"].includes(e.op) && !!e.before === !!e.after) invalide("Choisissez avant ou après une autre cible.")
    }
    const contexte = Contexte.safeParse(await lireJson<unknown>(fichiersDe(d).contexte, null))
    const signaux = await lireJson<SignauxMecaniques | null>(fichiersDe(d).signaux, null)
    const raisons = controler(v.data.edits, {
      page: existsSync(fichiersDe(d).capture) ? texteDuHtml(await readFile(fichiersDe(d).capture, "utf8")) : "",
      annonce: contexte.success ? texteAnnonce(contexte.data) : "",
      avant: new Map([...autorises].map(([a, t]) => [a, t.text])),
      boutons: new Set(signaux?.ctas.map((x) => x.anchor) ?? [...autorises.values()].filter((t) => t.tag === "button").map((t) => t.anchor)),
    })
    if (raisons.length) invalide("Changement refusé : " + raisons.join(" ; "))
    const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
    let id = slugify(v.data.titre).slice(0, 40) || "test"
    while (tests.some((t) => t.id === id)) id += "-2"
    const nom = (a: string) => autorises.get(a)?.text ?? a
    const edits = v.data.edits.map((e) => ({ anchor: e.anchor, avant: nom(e.anchor),
      text: e.op === "set" ? e.text! : e.op === "remove" ? "Retiré" : e.op === "swap" ? `Échangé avec ${nom(e.with!)}` : `${e.op === "move" ? "Déplacé" : "Copié"} ${e.before ? "avant" : "après"} ${nom((e.before ?? e.after)!)}` }))
    const job = nouveauJob("test")
    const teste = edits.map((e, i) => v.data.edits[i].op === "set" ? `« ${e.avant.slice(0, 60)} » devient « ${e.text.slice(0, 60)} »` : `« ${e.avant.slice(0, 60)} » : ${e.text}`).join(" · ")
    const test: Test = { id, titre: v.data.titre, teste, pourquoi: v.data.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id, ciblage: v.data.ciblage }

    const spec = {
      nom: id,
      hypothese: `Si ${teste}, alors les conversions augmentent, parce que ${v.data.pourquoi}`.slice(0, 600).padEnd(20, "."),
      metrique: "conversions Google Ads sur le trafic payant",
      risque: "test défini à la main par le media buyer : à relire avant lancement",
      diagnostic: { regle: "media-buyer", signal: `édition manuelle : ${v.data.titre}`, priorite: "MEDIUM", confiance: "Medium", preuve: "intuition du media buyer : pas de règle KB" },
      edits: v.data.edits.map((e) => {
        const emp = empreintes.find((x) => x.a === e.anchor)
        return { ...e, pourquoi: v.data.pourquoi, ...(e.op === "duplicate" ? { as: "b" } : {}), ...(emp ? { attendu: { role: emp.role, text: emp.text } } : {}) }
      }),
    }
    const specPath = fichiersDe(d).spec(id)
    const sv = VariantSpec.safeParse(spec)
    if (!sv.success) invalide("la spec produite est invalide : rien n’a été écrit (" + sv.error.issues.map((i) => i.path.join(".") || i.message).join(", ") + ")")
    tests.push(test)
    await ecrireJson(fichiersDe(d).tests, tests)
    await ecrireJson(specPath, spec)

    pipelineTest(job, c, camp, id, base, specPath)
      .catch((e) => marquerEchec(d, id, job, e).catch((e2) => dire(job, String(e2))))
      .finally(liberer)
    return { job, id }
  } catch (e) { liberer(); throw e }
}

/** Le brain : écrit context.json, puis signaux → jugement → diagnostic → 3 specs (job). */
export async function lancerBrain(c: string, camp: string, contexte: unknown): Promise<Job> {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
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
    })().catch((e) => { dire(job, String(e)); finir(job, false) }).finally(liberer)
    return job
  } catch (e) { liberer(); throw e }
}

/** Décliner une proposition : N variantes de plus sur le même constat, à la consigne du buyer (job). */
export async function lancerDeclinaison(c: string, camp: string, nom: string, entree: { consigne?: unknown; n?: unknown }): Promise<Job> {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const props = await lireJson<Array<{ nom: string; ciblage?: unknown }>>(fichiersDe(d).propositions, [])
    const p = props.find((x) => x.nom === nom)
    if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
    if ([...jobs.values()].some((jb) => (jb.type === "decliner" || jb.type === "brain" || jb.type === "intentions") && jb.etat === "en cours" && jb.campagne === d))
      throw Object.assign(new Error("LPWS écrit déjà pour cette page : attendez la fin, une à deux minutes"), { code: 409 })
    // « --x » en tête serait lu comme une option par la ligne de commande
    const consigne = String(entree.consigne ?? "").replace(/\s+/g, " ").trim().replace(/^-+\s*/, "").slice(0, 300)
    const n = Math.min(3, Math.max(1, Math.round(Number(entree.n) || 3)))
    const job = nouveauJob(p.ciblage ? "intentions" : "decliner")
    job.campagne = d; job.sujet = nom
    const cb = p.ciblage ? Ciblage.safeParse(p.ciblage) : null
    if (p.ciblage && !cb!.success) throw Object.assign(new Error("ciblage de la proposition invalide"), { code: 400 })
    ;(async () => {
      dire(job, `LPWS écrit ${n} autre${n > 1 ? "s" : ""} version${n > 1 ? "s" : ""} de ce test${consigne ? ` : « ${consigne} »` : ""}`)
      const args = p.ciblage && cb?.success
        ? [join(ROOT, "engine/intent/personnaliser.ts"), resolve(d), "--intention", cb.data.intention, "--n", String(n), "--source", nom]
        : [join(ROOT, "engine/variant/run.ts"), resolve(d), "--decliner", nom, "--n", String(n)]
      if (consigne) args.push("--consigne", consigne)
      finir(job, (await lancer(job, TSX, args)) === 0)
    })().catch((e) => { dire(job, String(e)); finir(job, false) }).finally(liberer)
    return job
  } catch (e) { liberer(); throw e }
}

/** Une proposition du brain devient un test : même pipeline qu'un test écrit à la main. */
export async function creerTestDepuisProposition(c: string, camp: string, nom: string) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const base = fichiersDe(d).baseline
    const props = await lireJson<Array<{ nom: string; titre: string; teste: string; pourquoi: string; regle: string; ciblage?: unknown }>>(fichiersDe(d).propositions, [])
    const p = props.find((x) => x.nom === nom)
    if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
    const ciblage = ciblageValide(p.ciblage)
    const specPath = fichiersDe(d).spec(nom)
    if (!existsSync(specPath)) throw Object.assign(new Error("la spec de cette proposition a disparu"), { code: 404 })
    const sv = VariantSpec.safeParse(await lireJson<unknown>(specPath, {}))
    if (!sv.success) throw Object.assign(new Error("la spec de cette proposition ne respecte plus le contrat des variantes"), { code: 400 })
    const spec = sv.data
    let tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
    if (tests.some((t) => t.id === nom && t.etat !== "echec")) throw Object.assign(new Error("ce test existe déjà"), { code: 409 })
    tests = tests.filter((t) => t.id !== nom)
    const txt = await textes(c, camp)
    const edits = spec.edits.map((e) => ({ anchor: e.anchor!, text: e.op === "set" ? e.text ?? "Attribut modifié" : `${e.op} ${e.with ? "avec " + e.with : e.before ? "avant " + e.before : e.after ? "après " + e.after : ""}`.trim(), avant: txt.find((t) => t.anchor === e.anchor)?.text ?? e.attendu?.text ?? "" }))
    const job = nouveauJob("test")
    tests.push({ id: nom, titre: p.titre, teste: p.teste, pourquoi: p.pourquoi, etat: "prep", part: 0, creeLe: new Date().toISOString(), edits, job: job.id, regle: p.regle, ciblage })
    await ecrireJson(fichiersDe(d).tests, tests)
    pipelineTest(job, c, camp, nom, base, specPath)
      .catch((e) => marquerEchec(d, nom, job, e).catch((e2) => dire(job, String(e2))))
      .finally(liberer)
    return { job, id: nom }
  } catch (e) { liberer(); throw e }
}

export async function changerEtat(c: string, camp: string, id: string, etat: "live" | "stop" | "gagnant", part: number, reprise = false) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
    const t = tests.find((x) => x.id === id)
    if (!t) throw new Error("test inconnu")
    const reprenable = reprise && t.etat === "stop" && !!t.lanceLe && !!t.plan && !!t.finLe
    if (etat === "live" && !(t.etat === "pret" || t.etat === "stop"))
      throw Object.assign(new Error(`Un test se lance quand sa variante est construite (état « prêt »), ou reprend après un arrêt : celui-ci est « ${t.etat} ».`), { code: 409 })
    if (etat === "live" && (!Number.isFinite(part) || part < 5 || part > 95))
      throw Object.assign(new Error("Un test se lance entre 5 et 95 % : à 0 ou 100 %, il n’y a rien à comparer."), { code: 409 })
    if (etat === "gagnant" && t.etat !== "live" && t.etat !== "stop")
      throw Object.assign(new Error("seul un test lancé peut être déployé"), { code: 409 })
    /* LE MANDAT, PUIS LE PALIER : rien ne part en ligne sur un site dont le propriétaire n'a pas
     * mandaté le buyer (docs/recherche/business-model.md §7). Le palier ne limite qu'en SaaS. */
    if (etat === "live") {
      const verdict = await lireJson<{ propre?: boolean | null }>(join(fichiersDe(d).variante(id), "variant.json"), {})
      if (verdict.propre === false)
        throw Object.assign(new Error("Cette variante modifie des sections non visées : relisez le delta et corrigez-la avant de lancer le test."), { code: 409 })
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
      const ex = await lireJson<Express>(fichiersDe(d).express, { installe: false })
      const sonde = t.ciblage || !ex.installe ? await sonderBalise(c, camp) : ex
      if (!sonde.installe)
        throw Object.assign(new Error("La balise Express n’est pas encore sur la page : personne ne verrait la variante. Installez-la (Connexion → Express), publiez dans GTM, puis lancez le test."), { code: 409 })
      if (t.ciblage && (sonde.capacite !== "intent-v1" || sonde.mode !== "pilote"))
        throw Object.assign(new Error("La balise posée ne sait pas router par intention en direct (repli figé ou balise ancienne) : un test ciblé y serait servi à tout le monde ou à personne. Republiez la balise (Connexion → Express), puis relancez."), { code: 409 })
    }
    if (etat === "live" && t.ciblage) {
      const cb = Ciblage.safeParse(t.ciblage)
      if (!cb.success || cb.data.routes.length === 0)
        throw Object.assign(new Error("Le ciblage de ce test est invalide ou vide : rien ne routerait vers lui."), { code: 409 })
      if (!existsSync(fichiersDe(d).contexte))
        throw Object.assign(new Error("Un test ciblé demande le contexte de l’annonce (ce que promet l’annonce et comment se conclut la vente) : remplissez-le d’abord."), { code: 409 })
    }
    // un gagnant servi à 100 % capte tous les visiteurs : un nouveau test ne toucherait personne
    const deploye = tests.find((o) => o !== t && o.etat === "gagnant" && ciblagesSeCroisent(t.ciblage, o.ciblage))
    if (etat === "live" && deploye)
      throw Object.assign(new Error(`« ${deploye.titre} » est déployé sur cette page à 100 % : remettez l’original ou intégrez ce gagnant à la page avant de lancer un autre test.`), { code: 409 })
    const avant = await lireJson<Test[]>(fichiersDe(d).tests, [])
    const maintenant = new Date().toISOString()
    // seul un test qui collectait entre au journal : un test déjà arrêté a ses chiffres, on n'y touche plus
    const arretes = new Set<string>(), deployes = new Set<string>()
    const cesse = (o: Test) => { if (o.etat === "live") { o.finLe = maintenant; arretes.add(o.id) } }
    // annuler un arrêt reprend la MÊME expérience (même lancement, même horizon), sans repartir de zéro
    // … à condition qu'aucun autre test n'ait été lancé depuis l'arrêt : sa fenêtre engloberait l'intermède
    const reprend = etat === "live" && reprenable
      && !tests.some((o) => o !== t && !!o.lanceLe && o.lanceLe >= t.finLe! && ciblagesSeCroisent(t.ciblage, o.ciblage))
    if (reprend) {
      t.etat = "live"; delete t.finLe
    } else if (etat === "live") {
      // l'horizon se fixe AVANT de regarder : c'est lui qui donne le droit de conclure
      if (t.lanceLe && t.finLe) t.anciens = [...(t.anciens ?? []), { lanceLe: t.lanceLe, finLe: t.finLe, part: t.part, plan: t.plan, experience: t.experience }]
      t.etat = "live"; t.part = part; t.lanceLe = maintenant; delete t.finLe
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
    const restaurer = async (raison: string) => {
      const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
      for (const o0 of avant) {
        const o = all.find((x) => x.id === o0.id)
        if (o) Object.assign(o, { etat: o0.etat, part: o0.part, lanceLe: o0.lanceLe, finLe: o0.finLe, plan: o0.plan, anciens: o0.anciens, retireLe: o0.retireLe, experience: o0.experience })
      }
      const cible = all.find((x) => x.id === id)
      if (cible) cible.erreur = raison
      await ecrireJson(fichiersDe(d).tests, all)
      await appliquerParts(c, camp)
      await ecrireConfigClient(c, camp)
    }
    const job = nouveauJob("config")
    ;(async () => {
      let publie = false
      try {
        dire(job, etat === "live" ? `mise en ligne : ${t.part} % des visiteurs verront la variante` : etat === "gagnant" ? "déploiement : 100 % des visiteurs verront la variante" : "arrêt : l’original reprend 100 % du trafic")
        // l'état affiché doit être l'état EN LIGNE : si la publication rate ou ne répond pas, on revient en arrière et on dit pourquoi
        try { publie = (await publierTag(job, c, camp)) === 0 }
        catch (e) { dire(job, `publication : ${(e as Error).message}`) }
        if (!publie) {
          await restaurer("Publication non confirmée ; état local restauré. Vérifiez la version en ligne. " + job.lignes.slice(-3).join(" / "))
          finir(job, false)
          return
        }
        const all = await lireJson<Test[]>(fichiersDe(d).tests, [])
        const cible = all.find((x) => x.id === id)
        if (cible) { delete cible.erreur; await ecrireJson(fichiersDe(d).tests, all) }
        // publié : ce qui a cessé de collecter entre dans le journal du client
        try {
          for (const x of await enregistrerExperiences(d, all.filter((o) => arretes.has(o.id))))
            dire(job, `journal : « ${x.titre} » — ${x.conclusion}`)
          for (const o of all.filter((x) => deployes.has(x.id)))
            if (!(await marquerDeploye(d, o)))
              // l'arrêt n'avait pas été archivé : on l'archive maintenant, sur sa fenêtre de collecte
              for (const x of await enregistrerExperiences(d, [o])) dire(job, `journal : « ${x.titre} » — ${x.conclusion} (archivé au déploiement)`)
          if (reprend && cible) await retirerExperience(d, cible)
        } catch (e) { dire(job, `journal : non écrit (${(e as Error).message.split("\n")[0]}) — la mise en ligne, elle, est faite`) }
        finir(job, true)
      } catch (e) {
        dire(job, String(e))
        if (!publie) try { await restaurer("Publication non confirmée ; état local restauré. Vérifiez la version en ligne.") } catch (e2) { dire(job, String(e2)) }
        finir(job, false)
      } finally { liberer() }
    })()
    return job
  } catch (e) { liberer(); throw e }
}

export async function refuserProposition(c: string, camp: string, nom: string, entree: { motif?: unknown; raison?: unknown }) {
  const d = dossier(c, camp)
  const liberer = verrouillerCampagne(dirname(d))
  try {
    const f = fichiersDe(d).propositions
    const props = await lireJson<any[]>(f, [])
    const p = props.find((x) => x.nom === nom)
    if (!p) throw Object.assign(new Error("proposition inconnue"), { code: 404 })
    // gardée, pas effacée : une variante refusée par le buyer est un signal sur nos diagnostics (feuille de route 4.1)
    // le motif en un clic, la raison en mots si le buyer en écrit une : le brain relit les deux
    const motif = estMotif(entree.motif) ? entree.motif : undefined
    const libre = String(entree.raison ?? "").trim().slice(0, 300)
    p.refusee = true; p.refuseeLe = new Date().toISOString(); p.raison = [motif && MOTIFS[motif], libre].filter(Boolean).join(" : ")
    if (motif) p.motif = motif
    await ecrireJson(f, props)
    return { ok: true }
  } finally { liberer() }
}
