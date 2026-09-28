/**
 * audit.ts — L'AUDIT TRACKING GRATUIT : la vraie page, ouverte comme un clic Google Ads l'ouvre
 * (docs/recherche/business-model.md §6, module 1 ; feuille de route 3.2).
 *
 * C'est l'entrée du palier gratuit : il sert AVANT tout test, ne demande aucun accès, et trouve
 * presque toujours quelque chose (Bamboo : la redirection http → https perdait le gclid). On
 * ouvre la page avec un identifiant de clic et des UTM, dans le vrai moteur, et on constate :
 *
 *   1. la chaîne de redirections, et si le gclid / les UTM survivent jusqu'à la page finale ;
 *   2. les balises présentes : GTM, Google Analytics 4, Google Ads, Meta, TikTok, LinkedIn,
 *      Microsoft Ads ; et le lieur de conversions (cookie _gcl_aw) ;
 *   3. le consentement : bannière (CMP) détectée, Consent Mode v2 (refus par défaut poussé), et
 *      des hits de mesure envoyés « accordés » avant tout clic sur la bannière ;
 *   4. la vitesse : LCP mesuré sur mobile, aux seuils de Google (2,5 s / 4 s) ;
 *   5. l'indexation : un noindex sur une page de campagne n'est pas grave, un canonical vers une
 *      autre page l'est parfois ; on le dit.
 *
 * Honnêteté : un point qu'on ne peut pas trancher de l'extérieur est « à vérifier », jamais
 * « ok ». Une page qui ne répond pas est un échec franc, pas un audit vide.
 *
 * Usage : npm run audit -- <url> [--client <c> --campaign <k>]   (écrit audit.json dans la campagne)
 */
import { join } from "node:path"
import { lancerNavigateur, neutraliserNom, UA } from "../shared/navigateur.ts"
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { ecrireJson } from "../shared/json.ts"
import { campagne as fichiersDe } from "../shared/campagne.ts"
import { CLIENTS_ROOT, marque, slugify } from "../shared/paths.ts"

const SCOPE = "audit"
const GCLID = "LPWS-AUDIT-0000"
const UTM = "utm_source=google&utm_medium=cpc&utm_campaign=lpws-audit"

export type Niveau = "ok" | "attention" | "grave" | "a-verifier"
export type Constat = { id: string; niveau: Niveau; titre: string; detail: string }
export type Audit = {
  url: string
  urlFinale: string
  faitLe: string
  statut: number
  redirections: string[]
  balises: string[]
  cmp: string | null
  lcpMs: number | null
  constats: Constat[]
  resume: { grave: number; attention: number; aVerifier: number; ok: number }
}

/** Ce qu'une URL de requête révèle. L'ordre compte : le premier motif qui correspond nomme la balise. */
const BALISES: Array<[string, RegExp]> = [
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js/],
  ["Google Analytics 4", /googletagmanager\.com\/gtag\/js\?id=G-|google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/],
  ["Google Ads", /googletagmanager\.com\/gtag\/js\?id=AW-|googleadservices\.com|googleads\.g\.doubleclick\.net/],
  ["Meta Pixel", /connect\.facebook\.net\/.*fbevents|facebook\.com\/tr/],
  ["TikTok Pixel", /analytics\.tiktok\.com/],
  ["LinkedIn Insight", /snap\.licdn\.com|px\.ads\.linkedin\.com/],
  ["Microsoft Ads (UET)", /bat\.bing\.com/],
]
const CMPS: Array<[string, RegExp]> = [
  ["OneTrust", /cdn\.cookielaw\.org|onetrust/], ["Cookiebot", /consent\.cookiebot\.com/], ["Didomi", /sdk\.privacy-center\.org|didomi/],
  ["Axeptio", /axept\.io/], ["Usercentrics", /usercentrics/], ["Quantcast Choice", /quantcast\.mgr|cmp\.quantcast/],
  ["TrustArc", /trustarc/], ["CookieYes", /cookieyes/], ["Complianz", /complianz/], ["Iubenda", /iubenda/], ["Sirdata", /sirdata/],
]

const SONDE_LCP = `(function(){ if(window.top!==window.self) return; window.__lcp=0;
  try{ new PerformanceObserver(function(l){ var e=l.getEntries(); window.__lcp=Math.round(e[e.length-1].startTime) })
    .observe({type:'largest-contentful-paint',buffered:true}) }catch(e){} })();`

export async function auditer(url: string): Promise<Audit> {
  const depart = new URL(url)
  depart.searchParams.set("gclid", GCLID)
  for (const [k, v] of new URLSearchParams(UTM)) depart.searchParams.set(k, v)

  const browser = await lancerNavigateur()
  try {
    // mobile : c'est là que se joue l'essentiel du trafic payant, et là que Google mesure la vitesse
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.replace("X11; Linux x86_64", "Linux; Android 14; Pixel 8") + " Mobile" })
    const page = await ctx.newPage()
    await neutraliserNom(page)
    await page.addInitScript({ content: SONDE_LCP })
    const requetes: string[] = []
    page.on("request", (r) => requetes.push(r.url()))

    const rep = await page.goto(depart.href, { waitUntil: "load", timeout: 60_000 }).catch((e: Error) => { throw new Error(`la page ne répond pas : ${e.message}`) })
    if (!rep) throw new Error("la page n'a rien renvoyé")
    await page.waitForTimeout(4_000)

    const redirections: string[] = []
    for (let r = rep.request().redirectedFrom(); r; r = r.redirectedFrom()) redirections.unshift(r.url())
    const urlFinale = page.url()
    const vu = await page.evaluate(() => {
      const dl = ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as Record<number, unknown>[]
      const iConsent = dl.findIndex((e) => e && e[0] === "consent" && e[1] === "default")
      const iConfig = dl.findIndex((e) => e && (e[0] === "config" || e[0] === "js" || (e as { event?: string }).event === "gtm.js"))
      return {
        consentDefault: iConsent >= 0, consentAvant: iConsent >= 0 && (iConfig < 0 || iConsent < iConfig),
        noindex: !!document.querySelector('meta[name="robots"][content*="noindex" i]'),
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
        lcp: (window as unknown as { __lcp?: number }).__lcp ?? 0,
        formulaires: document.querySelectorAll("form").length,
      }
    })
    const cookies = await ctx.cookies()
    const statut = rep.status()

    const balises = BALISES.filter(([, re]) => requetes.some((u) => re.test(u))).map(([n]) => n)
    const cmp = CMPS.find(([, re]) => requetes.some((u) => re.test(u)))?.[0] ?? null
    // un hit GA4/Ads porte l'état du consentement dans `gcs` : G100 = tout refusé, G111 = accordé
    const hits = requetes.filter((u) => /\/g\/collect|googleadservices\.com\/pagead|\/pagead\/conversion|\/ccm\/collect/.test(u))
    const hitsAccordes = hits.filter((u) => new URL(u).searchParams.get("gcs") === "G111")

    const constats: Constat[] = []
    const c = (id: string, niveau: Niveau, titre: string, detail: string) => constats.push({ id, niveau, titre, detail })

    if (statut >= 400) c("statut", "grave", `La page répond ${statut}`, "Un clic payé arrive sur une erreur : chaque visite est perdue.")
    const finale = new URL(urlFinale)
    const gclidGarde = finale.searchParams.get("gclid") === GCLID
    const utmGarde = finale.searchParams.get("utm_campaign") === "lpws-audit"
    if (!gclidGarde) c("gclid", "grave", "Le gclid se perd en route", `${redirections.length ? `${redirections.length} redirection(s) (${[...redirections, urlFinale].map((u) => new URL(u).host + new URL(u).pathname).join(" → ")})` : "la page"} retire l'identifiant de clic : Google Ads ne peut plus attribuer les conversions à l'annonce. Mettez la Final URL directement sur l'adresse finale, ou faites relayer les paramètres par la redirection.`)
    else c("gclid", "ok", "Le gclid arrive sur la page", redirections.length ? `${redirections.length} redirection(s), paramètres conservés.` : "Aucune redirection.")
    if (gclidGarde && !utmGarde) c("utm", "attention", "Les UTM se perdent", "L'identifiant de clic passe mais pas les UTM : GA4 attribuera ces visites à « google / cpc » sans nom de campagne.")
    if (redirections.length) c("redirections", redirections.length > 1 ? "attention" : "ok", `${redirections.length} redirection(s) avant la page`, `Chaque saut coûte du temps de chargement sur mobile. Final URL conseillée : ${finale.origin}${finale.pathname}`)

    if (!balises.length) c("balises", "grave", "Aucune balise de mesure vue", "Ni GTM, ni GA4, ni Google Ads, ni Meta n'ont été demandés au chargement. Soit la mesure attend le consentement (normal en Europe), soit la page ne mesure rien : à vérifier dans le compte publicitaire.")
    else c("balises", "ok", `Balises : ${balises.join(", ")}`, "Demandées au chargement de la page.")
    if (!balises.includes("Google Ads") && balises.length)
      c("ads", "a-verifier", "Pas de balise Google Ads vue", "Normal si les conversions sont importées de GA4 ou si la balise attend le consentement ; sinon, les conversions de la campagne ne remontent pas.")
    const linker = cookies.some((k) => k.name.startsWith("_gcl_aw") || k.name.startsWith("_gcl_gb"))
    if (balises.some((b) => b.startsWith("Google")))
      c("linker", linker ? "ok" : "a-verifier", linker ? "Lieur de conversions actif (_gcl_aw)" : "Pas de cookie _gcl_aw", linker ? "Le clic est gardé pour les conversions qui arrivent plus loin dans le tunnel." : "Le lieur de conversions n'a pas écrit son cookie : normal tant que le visiteur n'a pas consenti, anormal sinon (conversions sur un autre domaine non attribuées).")

    if (cmp) c("cmp", "ok", `Bannière de consentement : ${cmp}`, "Détectée au chargement.")
    else c("cmp", "a-verifier", "Aucune bannière de consentement reconnue", "Obligatoire pour du trafic européen (RGPD, et Google l'exige pour l'EEE depuis mars 2024). Elle est peut-être maison : à vérifier.")
    if (vu.consentDefault) c("consent-mode", vu.consentAvant ? "ok" : "attention", vu.consentAvant ? "Consent Mode v2 : refus par défaut avant les balises" : "Consent Mode v2 déclaré trop tard", vu.consentAvant ? "Les balises Google partent en mode refusé tant que le visiteur n'a pas choisi." : "Le refus par défaut est poussé après le chargement de GTM/gtag : les premiers hits partent sans état de consentement.")
    else if (balises.some((b) => b.startsWith("Google"))) c("consent-mode", cmp ? "grave" : "attention", "Pas de Consent Mode v2", "Aucun « consent default » dans le dataLayer : pour du trafic EEE, Google Ads ne peut plus construire d'audiences ni modéliser les conversions perdues.")
    // l'audit part d'un serveur hors UE : beaucoup de bannières accordent par défaut hors EEE.
    // On le dit, on ne conclut pas à une infraction qu'on n'a pas vue depuis l'Europe.
    if (cmp && hitsAccordes.length) c("avant-consentement", "a-verifier", `${hitsAccordes.length} hit(s) envoyés « accordés » avant tout clic sur la bannière`, `Vu depuis ${process.env.LPWS_AUDIT_PAYS ?? "un serveur hors UE"} : ${cmp} accorde peut-être par défaut hors EEE. Si c'est aussi le cas pour un visiteur européen, c'est un risque RGPD pour le client : à vérifier depuis l'Europe.`)

    const lcp = vu.lcp || null
    if (lcp === null) c("lcp", "a-verifier", "LCP non mesuré", "Le navigateur n'a pas rapporté de Largest Contentful Paint.")
    else c("lcp", lcp > 4000 ? "grave" : lcp > 2500 ? "attention" : "ok", `LCP mobile : ${(lcp / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`,
      lcp > 4000 ? "Au-delà de 4 s, Google juge l'expérience mauvaise : Quality Score et conversions en pâtissent. Un seul tir depuis un serveur : à confirmer par PageSpeed Insights." : lcp > 2500 ? "Entre 2,5 et 4 s : à améliorer. Un seul tir depuis un serveur : ordre de grandeur." : "Sous 2,5 s : bon.")

    if (vu.canonical && new URL(vu.canonical).origin + new URL(vu.canonical).pathname !== finale.origin + finale.pathname)
      c("canonical", "attention", "Le canonical pointe ailleurs", `canonical = ${vu.canonical} : sans conséquence pour Google Ads, mais la page ne sera pas indexée pour elle-même.`)
    if (vu.noindex) c("noindex", "ok", "Page en noindex", "Normal pour une page de campagne : elle ne concurrence pas le site en référencement naturel.")

    const n = (k: Niveau) => constats.filter((x) => x.niveau === k).length
    return { url, urlFinale, faitLe: new Date().toISOString(), statut, redirections, balises, cmp, lcpMs: lcp, constats,
      resume: { grave: n("grave"), attention: n("attention"), aVerifier: n("a-verifier"), ok: n("ok") } }
  } finally { await browser.close() }
}

/** Le dossier où ranger l'audit : la campagne si elle est donnée, sinon celle que l'URL désigne. */
/** Avec client et campagne : le dossier de la page. Sans : clients/_audits/<marque>-<chemin>, hors des clients du buyer. */
export function dossierAudit(url: string, client?: string, campagne?: string): string {
  if (client) return join(CLIENTS_ROOT, slugify(client), slugify(campagne ?? (slugify(new URL(url).pathname) || "campagne-1")))
  return join(CLIENTS_ROOT, "_audits", slugify(`${marque(url)}-${new URL(url).pathname}`) || marque(url))
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs()
  const [url] = args.libres
  if (!url || !/^https?:\/\//.test(url)) fail(SCOPE, "usage : npm run audit -- <url> [--client <c> --campaign <k>]")
  const a = await auditer(url).catch((e: Error) => fail(SCOPE, e.message))
  const f = fichiersDe(dossierAudit(url, args.option("--client"), args.option("--campaign")))
  await ecrireJson(f.audit, a)
  const icone: Record<Niveau, string> = { ok: "ok  ", attention: "ATT ", grave: "GRAVE", "a-verifier": "?   " }
  for (const k of a.constats) step(SCOPE, `${icone[k.niveau].padEnd(5)} ${k.titre}`)
  step(SCOPE, `${a.resume.grave} grave(s), ${a.resume.attention} attention, ${a.resume.aVerifier} à vérifier → ${f.audit}`)
}
