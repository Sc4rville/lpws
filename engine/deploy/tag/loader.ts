/**
 * loader.ts — LE SEUL CODE QUE LE MEDIA BUYER COLLE, ET IL LE COLLE UNE FOIS.
 *
 * Il le colle une fois par client dans son Google Tag Manager, auquel il a déjà accès puisque
 * c'est par là qu'il pose son suivi de conversion. Ensuite, lancer une variante, changer sa
 * part de trafic ou tout arrêter ne touche plus jamais à GTM : ça se décide dans la config.
 *
 * CE QUE CE FICHIER NE FAIT PLUS, ET POURQUOI. La première version refaisait ici tout le
 * rapprochement d'empreintes. Mesuré sur atlassian.com : ~700 ms de calcul par essai et 97 à
 * 188 Ko de charge utile, page masquée 1,5 s, et les bandes toujours pas résolues. Le
 * rapprochement se fait maintenant à la construction (cf. selector.ts) et le runtime ne reçoit
 * plus qu'un sélecteur CSS par cible. Il regarde, il vérifie, il écrit.
 *
 * Le sélecteur dit OÙ regarder, le témoin dit SI C'EST BIEN LUI. Sans le témoin, un sélecteur
 * périmé écrirait dans le mauvais élément en silence — exactement le mode d'échec qu'on a
 * passé la journée à éliminer.
 *
 * LE MUR DE LA CSP : beaucoup de sites servent un `connect-src` qui interdit toute requête
 * vers un domaine non listé (constaté sur atlassian.com). On ne peut pas demander à chaque
 * client de nous ajouter à sa CSP, ce serait recréer la friction qu'on vient d'enlever. D'où
 * deux modes, et le loader dit lequel il a utilisé :
 *   piloté  la config vient du réseau : stop, part de trafic et nouvelles variantes changent
 *           sans jamais rouvrir GTM ;
 *   figé    le réseau est interdit : on applique la config embarquée à la construction. Ça
 *           marche, mais changer quoi que ce soit demande de recoller le loader — Y COMPRIS
 *           LE BOUTON STOP. À dire au buyer à l'installation, jamais à lui laisser découvrir.
 *
 * Aucun import node : ce fichier part dans le navigateur du visiteur.
 */
import type { Cible } from "./selector.ts"

export type EditTag = {
  op: "set" | "remove" | "move" | "swap" | "duplicate"
  cible: Cible
  /** cible secondaire (move/duplicate : où poser · swap : l'autre bloc) */
  cible2?: Cible
  sens?: "before" | "after"
  text?: string
  href?: string
  src?: string
  placeholder?: string
  pourquoi: string
}

export type VarianteServie = {
  nom: string
  /** part du trafic, en pourcentage */
  part: number
  /** l'URL de la page où elle s'applique */
  page: string
  edits: EditTag[]
}

export type ConfigServie = {
  /** le bouton stop : tout s'arrête, sans republier le conteneur GTM */
  actif: boolean
  /**
   * Budget de MASQUE, en millisecondes. Court exprès : c'est du temps volé au visiteur, et
   * il se paie en LCP donc en Quality Score. Passé ce délai on révèle et on continue à
   * chercher sans masquer.
   */
  delaiMasque: number
  /** budget TOTAL de recherche : du contenu peut arriver longtemps après le chargement */
  delaiMax: number
  variantes: VarianteServie[]
}

declare const __LPWS_BASE__: string
declare const __LPWS_CLIENT__: string
/** la config figée au build : le repli quand le réseau nous est interdit */
declare const __LPWS_CFG__: ConfigServie

const CLE_CONFIG = "lpws_cfg"
const CLE_ID = "lpws_id"

const local = {
  lire(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } },
  ecrire(k: string, v: string): void { try { localStorage.setItem(k, v) } catch { /* mode privé */ } },
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

/**
 * L'identité de répartition : le `gclid` d'abord, pour qu'un clic payant voie une version et
 * une seule. C'est ce qui permet de tester sur UNE Final URL, au lieu de deux annonces vers
 * deux pages — où Google réoptimise la diffusion et biaise la comparaison avant qu'elle
 * commence.
 */
function identite(): string {
  const q = new URLSearchParams(location.search)
  const clic = q.get("gclid") ?? q.get("gbraid") ?? q.get("wbraid") ?? q.get("msclkid")
  if (clic) { local.ecrire(CLE_ID, clic); return clic }
  const garde = local.lire(CLE_ID)
  if (garde) return garde
  const neuf = String(Date.now()) + Math.random().toString(36).slice(2)
  local.ecrire(CLE_ID, neuf)
  return neuf
}

function masque(delaiMax: number): () => void {
  const st = document.createElement("style")
  st.id = "lpws-anti-flicker"
  st.textContent = "body{opacity:0 !important}"
  ;(document.head || document.documentElement).appendChild(st)
  // chrono pris ICI, autour des vraies opérations : un observateur extérieur regroupe ses
  // lots et rendait 0 ms alors que le masque avait bien été posé
  const t0 = performance.now()
  // idempotent : la levée peut venir du filet OU du code, et la seconde ne doit pas
  // réécrire la mesure (constaté : 1 641 ms rapportés pour un masque de 300 ms)
  let leve = false
  const fin = () => {
    if (leve) return
    leve = true
    st.remove()
    ;(window as unknown as { __lpwsMasque?: number }).__lpwsMasque = Math.round(performance.now() - t0)
  }
  const secours = setTimeout(fin, delaiMax)
  return () => { clearTimeout(secours); fin() }
}

/* ————— regarder, puis vérifier ————— */

const roleDe = (n: Element): string => {
  const t = n.tagName.toLowerCase()
  if (/^h[1-6]$/.test(t)) return "heading"
  if (t === "a" || t === "button") return "link"
  if (t === "img" || t === "picture" || t === "video" || t === "svg") return "media"
  if (t === "input" || t === "textarea" || t === "select" || t === "label") return "field"
  if (t === "p" || t === "li" || t === "blockquote" || t === "figcaption") return "text"
  return "bande"
}

/**
 * Le témoin ne réclame pas l'identique : le client a le droit de corriger une coquille ou de
 * faire tourner un titre. Il réclame que ce soit encore LE MÊME élément.
 */
function concorde(el: Element, c: Cible): boolean {
  if (roleDe(el) !== c.role) return false
  const a = c.texte
  const b = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60)
  if (!a && !b) return true
  if (!a || !b) return false
  if (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0) return true
  const mots = (t: string) => t.split(/[^0-9a-zà-ÿ]+/).filter((m) => m.length > 2)
  const A = mots(a), B = mots(b)
  if (!A.length || !B.length) return false
  let inter = 0
  for (const m of A) if (B.indexOf(m) >= 0) inter++
  return inter / Math.max(A.length + B.length - inter, 1) >= 0.4
}

type Resolu = { edit: EditTag; el: Element; el2?: Element }

function resoudre(edits: EditTag[]): { resolus: Resolu[]; abandons: string[] } {
  const resolus: Resolu[] = []
  const abandons: string[] = []
  const trouver = (c: Cible): Element | null => {
    let el: Element | null = null
    try { el = document.querySelector(c.sel) } catch { return null }
    if (!el) return null
    return concorde(el, c) ? el : null
  }
  for (const e of edits) {
    const el = trouver(e.cible)
    if (!el) { abandons.push(`${e.cible.role} « ${e.cible.texte.slice(0, 30)} » absent ou changé`); continue }
    const el2 = e.cible2 ? trouver(e.cible2) : undefined
    if (e.cible2 && !el2) { abandons.push(`cible secondaire « ${e.cible2.texte.slice(0, 30)} » absente ou changée`); continue }
    resolus.push({ edit: e, el, el2: el2 ?? undefined })
  }
  return { resolus, abandons }
}

/* ————— écrire ————— */

function appliquer(r: Resolu): void {
  const { edit: e, el, el2 } = r
  if (e.op === "remove") { el.setAttribute("data-lpws-edited", ""); el.remove(); return }
  if (e.op === "swap") {
    if (!el2) return
    const m = document.createComment("lpws")
    el.parentNode?.insertBefore(m, el)
    el2.parentNode?.insertBefore(el, el2)
    m.parentNode?.insertBefore(el2, m)
    m.remove()
    el.setAttribute("data-lpws-edited", ""); el2.setAttribute("data-lpws-edited", "")
    return
  }
  if (e.op === "move") {
    if (!el2) return
    el.setAttribute("data-lpws-edited", "")
    if (e.sens === "before") el2.parentNode?.insertBefore(el, el2)
    else el2.parentNode?.insertBefore(el, el2.nextSibling)
    return
  }
  // duplicate : on ne génère AUCUN markup, on recopie un bloc du client et on le repose.
  // Le design system est conservé au pixel par construction.
  if (e.op === "duplicate") {
    if (!el2) return
    const copie = el.cloneNode(true) as Element
    copie.setAttribute("data-lpws-added", "")
    if (e.sens === "before") el2.parentNode?.insertBefore(copie, el2)
    else el2.parentNode?.insertBefore(copie, el2.nextSibling)
    return
  }
  // set — texte seulement, jamais de balise : « aucune réécriture libre » tient ici aussi
  if (e.text !== undefined) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = e.text
    else el.textContent = e.text
  }
  if (e.placeholder !== undefined) el.setAttribute("placeholder", e.placeholder)
  if (e.href !== undefined) el.setAttribute("href", e.href)
  if (e.src !== undefined) el.setAttribute("src", e.src)
  el.setAttribute("data-lpws-edited", "")
}

/* ————— choisir ————— */

const memePage = (motif: string): boolean => {
  const ici = (location.origin + location.pathname).replace(/\/$/, "")
  const la = motif.split("?")[0].replace(/\/$/, "")
  return ici === la || ici === la.replace(/^(https?:\/\/)www\./, "$1")
}

function choisir(cfg: ConfigServie): VarianteServie | null {
  const force = new URLSearchParams(location.search).get("lpws")
  if (force === "off") return null
  const candidates = cfg.variantes.filter((v) => memePage(v.page))
  if (force) return candidates.filter((v) => v.nom === force)[0] ?? null
  if (!cfg.actif) return null
  const id = identite()
  for (const v of candidates) if (hash(v.nom + id) * 100 < v.part) return v
  return null
}

let mode: "pilote" | "figé" | "cache" = "figé"

function annonce(version: string, applique: number, abandons: string[]): void {
  const w = window as unknown as { dataLayer?: unknown[]; __lpws?: unknown }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({
    event: "lpws_variante", lpws_variante: version,
    lpws_editions: applique, lpws_abandons: abandons.length, lpws_mode: mode,
  })
  w.__lpws = { version, applique, abandons, mode }
}

/** Visible sans scroller ? C'est la seule zone où un changement tardif se voit. */
function dansLeViseur(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < (window.innerHeight || 0)
}

/**
 * RÉESSAYER SANS RANÇONNER LE VISITEUR.
 *
 * Deux problèmes se mélangeaient, et les séparer règle les deux.
 *
 * 1. Un sélecteur peut viser un élément qui n'est pas encore là. À `DOMContentLoaded` le
 *    navigateur a lu le HTML mais la page n'est pas finie : du contenu arrive encore, et les
 *    bandes de bas de page apparaissent bien plus tard. Un essai unique déclarerait
 *    « introuvable » ce qui existe une seconde après. Donc on repique.
 * 2. Mais masquer la page pendant qu'on repique, c'est voler ce temps au visiteur. Mesuré sur
 *    atlassian.com : 1 259 ms de page blanche pour éditer deux bandes situées à des milliers
 *    de pixels sous le pli. Absurde — personne ne les regardait.
 *
 * Donc le masque a son propre budget, court. Au-delà, on révèle et on continue à chercher à
 * découvert. Et à découvert, on n'écrit plus que HORS du viseur : un changement sous le pli
 * est invisible, un changement sous les yeux du visiteur serait un clignotement. Celui-là est
 * refusé et rapporté plutôt que subi.
 */
function poser(cfg: ConfigServie, reveler: () => void, t0: number): void {
  const v = choisir(cfg)
  if (!v) { reveler(); annonce("controle", 0, []); return }

  const delaiMasque = cfg.delaiMasque || 800
  const delaiMax = Math.max(cfg.delaiMax || 3000, delaiMasque)
  let masquant = true
  let essais = 0

  const essayer = (): void => {
    essais++
    const ecoule = performance.now() - t0
    if (masquant && ecoule >= delaiMasque) { reveler(); masquant = false }

    let applique = 0
    const abandons: string[] = []
    try {
      const r = resoudre(v.edits)
      for (const a of r.abandons) abandons.push(a)
      if (r.abandons.length === 0) {
        // à découvert, un changement visible serait un clignotement : on ne le fait pas
        const visible = !masquant && r.resolus.some((x) => dansLeViseur(x.el) || (x.el2 && dansLeViseur(x.el2)))
        if (visible) {
          abandons.push("cible visible à l'écran après la levée du masque : refusé pour ne pas faire clignoter")
        } else {
          // tout ou rien : une variante à moitié posée se jugerait comme si elle était complète
          for (const x of r.resolus) { appliquer(x); applique++ }
        }
      }
    } catch (err) {
      abandons.push("erreur du tag : " + String(err))
    }

    if (applique > 0) {
      if (masquant) { reveler(); masquant = false }
      annonce(v.nom, applique, [])
      return
    }
    if (performance.now() - t0 < delaiMax - 60) { setTimeout(essayer, 50); return }
    if (masquant) reveler()
    // délai atteint : le client voit SA page, c'est le bon repli
    annonce("controle-repli", 0, abandons.concat(`abandon après ${essais} essai(s)`))
  }
  essayer()
}

/* ————— l'enchaînement ————— */

let pose = false
function poserUneFois(cfg: ConfigServie, m: typeof mode, reveler: () => void, t0: number): void {
  if (pose) return
  pose = true
  mode = m
  poser(cfg, reveler, t0)
}

function lancer(): void {
  /* LE MASQUE PART EN PREMIER, avant même de savoir quelle config on aura.
   *
   * Il était posé après la course réseau, donc 300 ms plus tard sous CSP — et ces 300 ms
   * étaient prises sur un budget de 800. Sur atlassian.com, dont le JavaScript bloque le fil
   * principal, le masque effectif dépassait 1 280 ms et les éditions arrivaient après sa
   * levée : refusées pour ne pas faire clignoter. Le budget doit courir depuis l'instant où
   * la page est cachée, pas depuis l'instant où on a fini de s'organiser. */
  const budget = (__LPWS_CFG__ && __LPWS_CFG__.delaiMasque) || 800
  const t0 = performance.now()
  const reveler = masque(budget)

  const repli = (cache: string | null): void => {
    try { poserUneFois(cache ? JSON.parse(cache) as ConfigServie : __LPWS_CFG__, cache ? "cache" : "figé", reveler, t0) }
    catch { poserUneFois(__LPWS_CFG__, "figé", reveler, t0) }
  }

  const cache = local.lire(CLE_CONFIG)

  // la course : le réseau d'abord s'il répond vite, sinon on n'attend pas. Sous CSP le fetch
  // échoue immédiatement, donc le repli est instantané et le visiteur ne paie rien.
  let fini = false
  const secours = setTimeout(() => { if (!fini) { fini = true; repli(cache) } }, 300)

  fetch(`${__LPWS_BASE__}/v/${__LPWS_CLIENT__}.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.text() : null))
    .then((t) => {
      if (!t) throw new Error("config illisible")
      local.ecrire(CLE_CONFIG, t)
      if (fini) return   // le repli a déjà posé : la config fraîche servira au prochain chargement
      fini = true; clearTimeout(secours)
      poserUneFois(JSON.parse(t) as ConfigServie, "pilote", reveler, t0)
    })
    .catch(() => {
      // CSP, réseau coupé, config absente : on applique quand même ce qu'on a
      if (fini) return
      fini = true; clearTimeout(secours)
      repli(cache)
    })
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer)
else lancer()
