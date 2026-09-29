/** etat.ts : GET /api/etat, l'état des clients, lu depuis clients/. */
import { readFile, readdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { CLIENTS_ROOT, slugify } from "../../engine/shared/paths.ts"
import { lireJson } from "../../engine/shared/json.ts"
import { campagne as fichiersDe, type Test, type Express } from "../../engine/shared/campagne.ts"
import { ROOT, BASE_TAGS } from "./config.ts"
import { jobs } from "./jobs.ts"
import { VariantSpec } from "../../engine/apply/spec.ts"
import { resumeCompte } from "./compte.ts"
import { type Audit } from "../../engine/audit/audit.ts"
import { historique as relevesDe, type Alerte } from "../../engine/surveille/surveille.ts"
import { historique, comptes } from "../../engine/measure/experience.ts"
import type { Resultats } from "../../engine/measure/run.ts"
import { etatIntentions } from "./intentions.ts"
import type { SignauxMecaniques } from "../../engine/variant/signaux.ts"

/** Le nom affiché au buyer : ce que le site dit de lui-même (og:site_name, puis le segment du
 *  <title> qui ressemble au domaine), sinon le domaine. L'identifiant du dossier, lui, ne bouge pas. */
const nomsDeSites = new Map<string, string>()
export async function nomDuSite(d: string, c: string): Promise<string> {
  if (nomsDeSites.has(d)) return nomsDeSites.get(d)!
  let nom = cap(c)
  try {
    const html = (await readFile(fichiersDe(d).capture, "utf8")).slice(0, 80_000)
    const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,60})["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']{1,60})["'][^>]+property=["']og:site_name["']/i)?.[1]
    const segments = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? "").split(/\s+[|·•:–-]\s+/).map((x) => x.trim())
    const lettres = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "")
    const duDomaine = segments.find((x) => x && lettres(x) && (lettres(x) === lettres(c) || lettres(x).startsWith(lettres(c)) || lettres(c).startsWith(lettres(x))))
    const brut = (og ?? duDomaine ?? "").replace(/&amp;/g, "&").trim()
    if (brut && brut.length <= 40) nom = brut
  } catch {}
  nomsDeSites.set(d, nom)
  return nom
}

const dateFr = (iso?: string) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : undefined
/** BASE_TAGS/t/<client>.js répond-il ? true / false, ou null si BASE_TAGS est injoignable. Mémoire 60 s. */
const _publie = new Map<string, { at: number; v: boolean | null }>()
async function tagPublie(slug: string): Promise<boolean | null> {
  const m = _publie.get(slug)
  if (m && Date.now() - m.at < 60_000) return m.v
  let v: boolean | null = null
  try {
    const r = await fetch(`${BASE_TAGS}/t/${slug}.js`, { method: "HEAD", signal: AbortSignal.timeout(4_000) })
    v = r.ok
  } catch { v = null }
  _publie.set(slug, { at: Date.now(), v })
  return v
}
const joursDepuis = (iso?: string, fin?: string) => iso ? Math.max(0, Math.floor(((fin ? new Date(fin).getTime() : Date.now()) - new Date(iso).getTime()) / 86_400_000)) : 0
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export async function etat() {
  const clients: unknown[] = []
  const root = join(ROOT, CLIENTS_ROOT)
  const compte = await resumeCompte()
  if (!existsSync(root)) return { clients, base: BASE_TAGS, compte }
  for (const c of await readdir(root)) {
    const cdir = join(root, c)
    if (!(await stat(cdir)).isDirectory() || c.startsWith("_")) continue
    for (const camp of await readdir(cdir)) {
      const d = join(cdir, camp)
      if (!(await stat(d)).isDirectory()) continue
      const base = fichiersDe(d).baseline
      const encours = await lireJson<{ url: string; job: string; debut: string } | null>(fichiersDe(d).enCours, null)
      if (!existsSync(fichiersDe(d).capture) && !encours) continue
      const meta = await lireJson<any>(fichiersDe(d).meta, null)
      const tests = await lireJson<Test[]>(fichiersDe(d).tests, [])
      const express = await lireJson<Express>(fichiersDe(d).express, { installe: false })
      // le brain : ce que le buyer a dit de la campagne, ce que la machine en a conclu, ce qu'elle propose
      const contexte = await lireJson<any>(fichiersDe(d).contexte, null)
      const diag = await lireJson<any>(fichiersDe(d).diagnostic, null)
      const signaux = await lireJson<SignauxMecaniques | null>(fichiersDe(d).signaux, null)
      // un test en échec libère sa proposition : le buyer peut la retenter après correction
      const dejaTests = new Set(tests.filter((t) => t.etat !== "echec").map((t) => t.id))
      const propositions = await Promise.all((await lireJson<any[]>(fichiersDe(d).propositions, []))
        .filter((p) => !dejaTests.has(p.nom) && !p.refusee)
        .map(async (p) => {
          const spec = VariantSpec.safeParse(await lireJson<unknown>(fichiersDe(d).spec(p.nom), null))
          return { ...p, edits: spec.success ? spec.data.edits : [] }
        }))
      const brainJob = [...jobs.values()].find((jb) => jb.type === "brain" && jb.etat === "en cours" && jb.campagne === d)
      const brainEnCours = !!brainJob
      const dernierBrain = [...jobs.values()].filter((jb) => jb.type === "brain" && jb.campagne === d).at(-1)
      const declJob = [...jobs.values()].find((jb) => jb.type === "decliner" && jb.etat === "en cours" && jb.campagne === d)
      // les chiffres viennent de GA4 (famille measure) : sans eux, l'écran dit « pas encore de
      // données » au lieu d'inventer
      const resultats = await lireJson<Resultats | null>(fichiersDe(d).resultats, null)
      const resDe=(t:Test)=>{
       const {o,v}=t.ciblage&&!t.experience?{o:null,v:null}:comptes(resultats,t.id,t.lanceLe,t.experience);
       return o&&v&&o.n>0&&v.n>0?{o,v,luLe:resultats!.luLe,source:resultats!.source??'ga4'}:null;
      };
      const audit = await lireJson<Audit | null>(fichiersDe(d).audit, null)
      const alertes = (await lireJson<Alerte[]>(fichiersDe(d).alertes, [])).slice(0, 10)
      const releves = await relevesDe(d)
      const url = (meta?.source ?? encours?.url ?? "").replace(/^https?:\/\//, "")
      const site = url.split("/")[0].replace(/^www\./, "")
      const clientSlug = slugify(meta?.client ?? c)
      // la balise que le buyer colle pointe sur BASE_TAGS/t/<client>.js : si cette adresse ne
      // répond pas (constaté : 404 sur lpws.vercel.app après un déploiement de la démo seule),
      // il collerait une balise morte sans aucun message. On le vérifie ici, une fois par minute.
      const publie = await tagPublie(clientSlug)
      // un job inconnu (serveur relancé) n'est pas « en cours » : il est interrompu, et on le dit
      const captureEnCours = !!encours && jobs.get(encours.job)?.etat === "en cours"
      const capture = meta
        ? { date: dateFr(meta.capturedAt), ok: meta.fidele === true ? true : false, conforme: meta.diff ? `${(100 - meta.diff.desktop * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : undefined,
            blocs: meta.marked?.sections ?? 0,
            // pas de promesse que la machine ne tient pas : rien ne « refait » la copie tout seul.
            // Et la vérité utile : un test Express s'applique sur la VRAIE page, la copie ne sert
            // qu'à préparer et montrer : une copie approximative n'empêche pas de tester.
            cause: meta.fidele ? undefined : `La copie est conforme à ${meta.diff ? `${(100 - meta.diff.desktop * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "moins de 97 %"} : cette page anime ses blocs au défilement, ce que la copie ne rejoue pas. Les tests Express restent possibles (ils s’appliquent sur la vraie page) ; seul l’aperçu sera approximatif.` }
        : captureEnCours ? { date: dateFr(encours!.debut), ok: null, enCours: true, cause: "Copie en cours : quelques minutes." }
        : { date: dateFr(encours?.debut), ok: null, cause: "La copie s’est interrompue avant la fin. Relancez-la depuis cette page : rien à faire côté client." }
      clients.push({
        id: `${c}/${camp}`, client: c, campagne: camp, clientSlug, ini: cap(c.slice(0, 1)), nom: await nomDuSite(d, c), marque: camp.replace(/-/g, " "),
        url, site, live: true,
        // le site a redirigé l'adresse collée : on le dit, sinon le buyer cherche « sa » page
        redirigeDe: meta?.demande ? String(meta.demande).replace(/^https?:\/\//, "") : undefined,
        imgUrl: existsSync(join(base, "clone.png")) ? `/files/${c}/${camp}/baseline/clone.png` : null,
        capture,
        job: captureEnCours ? encours!.job : undefined,
        contexte,
        diagnostic: diag ? { faitLe: diag.faitLe, regime: diag.regime, tests: diag.tests, conseils: diag.conseils, nonEvaluables: diag.nonEvaluables?.length ?? 0, ecartes: diag.ecartes ?? [] } : null,
        audit, alertes,
        surveillance: releves[0] ? { dernier: releves[0].quand, releves: releves.length, concordance: releves[0].concordance?.score ?? null, lcpMs: releves[0].lcpMs,
          serie: releves.slice(0, 12).reverse().map((r) => ({ quand: r.quand, lcpMs: r.lcpMs, concordance: r.concordance?.score ?? null, gclid: r.gclid, statut: r.statut })) } : null,
        mandat: compte.mandats[c] ?? null,
        propositions,
        // la mémoire : ce qui a déjà été testé sur toutes les pages de ce client, et comment ça a fini
        experiences: (await historique(cdir)).experiences.sort((a, b) => b.arreteLe.localeCompare(a.arreteLe)).slice(0, 20),
        signaux: signaux ? { hero: signaux.hero, ctas: signaux.ctas, nav: signaux.nav, formulaire: signaux.formulaire,
          preuves: signaux.preuves, sections: signaux.sections, prix: signaux.prix, commerce: signaux.commerce,
          ctaAuDessusDuPliMobile: signaux.ctaAuDessusDuPliMobile } : null,
        brainEnCours, brainJob: brainJob?.id, brainErreur: dernierBrain?.etat === "échec" ? dernierBrain.lignes.slice(-4).join(" · ") : null,
        declinaison: declJob ? { job: declJob.id, source: declJob.sujet } : null,
        connexion: {
          express: { etat: express.installe ? "ok" : "off",
            label: express.installe ? "Installé" : publie === false ? "Balise pas encore publiée" : "À installer",
            publie, verifie: dateFr(express.verifieLe), vitesse: "non mesurée", stopGtm: false,
            capacite: express.capacite, mode: express.mode,
            steps: [1, express.installe ? 1 : 0, express.installe ? 1 : 0, express.installe ? 1 : 0],
            script: `<script src="${BASE_TAGS}/t/${clientSlug}.js" async></script>`, detail: express.detail },
          integral: { etat: "off", label: "Pas encore", hote: `lp.${site}`, steps: [0, 0, 0, 0] },
          natif: { etat: "na", label: "Pas une boutique Shopify" },
        },
        ads: null,
        intentions: await etatIntentions(c, camp).catch(() => null),
        intentionsJob: (() => { const j = [...jobs.values()].find((jb) => jb.type === "intentions" && jb.etat === "en cours" && jb.campagne === d); return j ? { id: j.id, sujet: j.sujet } : null })(),
        tests: tests.map((t) => ({
          id: t.id, titre: t.titre, etat: t.etat, part: t.part, jours: joursDepuis(t.lanceLe, t.finLe), potentiel: "Moyen", plan: t.plan, fin: dateFr(t.finLe),
          teste: t.teste, pourquoi: t.pourquoi, erreur: t.erreur, job: t.job,
          changes: t.edits.map((e) => ({ t: `Texte modifié : avant : « ${e.avant.slice(0, 80)}${e.avant.length > 80 ? "…" : ""} »`, q: e.text, w: t.pourquoi })),
          imgUrl: existsSync(join(fichiersDe(d).variante(t.id), "variant.png")) ? `/files/${c}/${camp}/variants/${t.id}/variant.png` : null,
          res: resDe(t),
          lanceLe: t.lanceLe, regle: t.regle, ciblage: t.ciblage, experience: t.experience,
        })),
      })
    }
  }
  clients.sort((a: any, b: any) => (b.capture?.date ?? "").localeCompare(a.capture?.date ?? ""))
  // initiales : une lettre, deux quand deux clients commencent pareil
  const lettres = new Map<string, number>()
  for (const x of clients as any[]) lettres.set(x.client[0], (lettres.get(x.client[0]) ?? 0) + 1)
  for (const x of clients as any[]) if ((lettres.get(x.client[0]) ?? 0) > 1) x.ini = cap(x.client.slice(0, 2))
  return { clients, base: BASE_TAGS, compte }
}
