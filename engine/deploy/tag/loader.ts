/**
 * loader.ts — LE SEUL CODE QUE LE MEDIA BUYER COLLE, ET IL LE COLLE UNE FOIS.
 *
 * La version précédente produisait un tag par variante : il fallait retourner dans Google Tag
 * Manager à chaque test, refaire une balise, republier le conteneur. Personne ne teste dix
 * variantes à ce prix-là — et tester dix variantes, c'est exactement ce qu'on vend.
 *
 * Ici il colle ce loader une fois par client. Ensuite, lancer une variante, changer sa part
 * de trafic ou tout arrêter ne touche plus jamais à GTM : ça se décide dans la config qu'on
 * sert. Trois conséquences qui comptent pour lui :
 *
 *   · le bouton stop est immédiat (`actif: false`) et ne demande pas de republier un conteneur ;
 *   · `?lpws=<nom>` force une variante — le lien qu'il envoie à son client pour montrer avant
 *     de dépenser un euro ; `?lpws=off` montre l'original ;
 *   · la config de la dernière visite est gardée en local, donc la visite suivante applique
 *     sans attendre le réseau (le clignotement d'un aller-retour serait le prix caché du loader).
 *
 * Aucun import node : ce fichier part dans le navigateur du visiteur.
 */
import { markDom } from "../../clone/1_acquire/mark.ts"
import { fingerprintDom, type Empreinte } from "../../clone/1_acquire/fingerprint.ts"
import { relier } from "../../clone/1_acquire/relink.ts"

export type EditTag = {
  op: "set" | "remove" | "move" | "swap" | "duplicate"
  emp: Empreinte
  emp2?: Empreinte
  sens?: "before" | "after"
  text?: string
  href?: string
  src?: string
  placeholder?: string
  pourquoi: string
}

/** Une variante servie par la config. */
export type VarianteServie = {
  nom: string
  /** part du trafic, en pourcentage */
  part: number
  /** l'URL (ou le motif) des pages où elle s'applique */
  page: string
  edits: EditTag[]
}

/** Ce que le loader va chercher. C'est ça qu'on change pour piloter, jamais le tag. */
export type ConfigServie = {
  /** le bouton stop : tout s'arrête, sans republier le conteneur GTM */
  actif: boolean
  delaiMax: number
  variantes: VarianteServie[]
}

declare const __LPWS_BASE__: string
declare const __LPWS_CLIENT__: string

const CLE_CONFIG = "lpws_cfg"
const CLE_ID = "lpws_id"

/* ————— outils ————— */

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
 * une seule. C'est ce qui permet de tester sur UNE Final URL, sans laisser Google réoptimiser
 * la diffusion entre deux annonces et biaiser la comparaison avant qu'elle commence.
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
  // lots et rendrait une mesure fausse
  const t0 = performance.now()
  const fin = () => {
    st.remove()
    ;(window as unknown as { __lpwsMasque?: number }).__lpwsMasque = Math.round(performance.now() - t0)
  }
  const secours = setTimeout(fin, delaiMax)
  return () => { clearTimeout(secours); fin() }
}

/* ————— retrouver les cibles sur la page vivante ————— */

type Resolu = { edit: EditTag; el: Element; el2?: Element }

function resoudre(edits: EditTag[]): { resolus: Resolu[]; abandons: string[] } {
  markDom()
  const vivantes = fingerprintDom()
  const voulues: Empreinte[] = []
  for (const e of edits) { voulues.push(e.emp); if (e.emp2) voulues.push(e.emp2) }

  const lien = new Map(relier(voulues, vivantes).retrouves.map((l) => [l.avant, l.apres]))
  const el = (emp: Empreinte): Element | null => {
    const a = lien.get(emp.a)
    return a ? document.querySelector(`[data-lpws="${a}"]`) : null
  }

  const resolus: Resolu[] = []
  const abandons: string[] = []
  for (const e of edits) {
    const c = el(e.emp)
    if (!c) { abandons.push(`${e.emp.a} (${e.emp.role}) introuvable ou ambigu`); continue }
    const c2 = e.emp2 ? el(e.emp2) : undefined
    if (e.emp2 && !c2) { abandons.push(`${e.emp2.a} (cible secondaire) introuvable ou ambiguë`); continue }
    resolus.push({ edit: e, el: c, el2: c2 ?? undefined })
  }
  return { resolus, abandons }
}

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
  // duplicate : on ne génère AUCUN markup, on recopie un bloc du client et on le repose
  if (e.op === "duplicate") {
    if (!el2) return
    const copie = el.cloneNode(true) as Element
    copie.removeAttribute("data-lpws")
    copie.querySelectorAll("[data-lpws]").forEach((n) => n.removeAttribute("data-lpws"))
    copie.setAttribute("data-lpws-added", "")
    if (e.sens === "before") el2.parentNode?.insertBefore(copie, el2)
    else el2.parentNode?.insertBefore(copie, el2.nextSibling)
    return
  }
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
  const ici = location.origin + location.pathname.replace(/\/$/, "")
  const la = motif.replace(/\/$/, "")
  return ici === la || ici === la.replace(/^https?:\/\/www\./, location.protocol + "//")
    || location.href.indexOf(la) === 0
}

function choisir(cfg: ConfigServie): VarianteServie | null {
  const force = new URLSearchParams(location.search).get("lpws")
  if (force === "off") return null
  const candidates = cfg.variantes.filter((v) => memePage(v.page))
  if (force) return candidates.find((v) => v.nom === force) ?? null
  if (!cfg.actif) return null
  const id = identite()
  for (const v of candidates) if (hash(v.nom + id) * 100 < v.part) return v
  return null
}

function annonce(version: string, applique: number, abandons: string[]): void {
  const w = window as unknown as { dataLayer?: unknown[]; __lpws?: unknown }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({
    event: "lpws_variante", lpws_variante: version,
    lpws_editions: applique, lpws_abandons: abandons.length,
  })
  w.__lpws = { version, applique, abandons }
}

function poser(cfg: ConfigServie): void {
  const v = choisir(cfg)
  if (!v) { annonce("controle", 0, []); return }

  const reveler = masque(cfg.delaiMax ?? 1500)
  let applique = 0
  let abandons: string[] = []
  try {
    const r = resoudre(v.edits)
    abandons = r.abandons
    // tout ou rien : une variante à moitié posée se jugerait comme si elle était complète
    if (abandons.length === 0) for (const x of r.resolus) { appliquer(x); applique++ }
  } catch (err) {
    abandons.push("erreur du tag : " + String(err))
  } finally { reveler() }
  annonce(applique > 0 ? v.nom : "controle-repli", applique, abandons)
}

/* ————— l'enchaînement ————— */

function lancer(): void {
  // la config de la dernière visite d'abord : sinon chaque visiteur paierait un aller-retour
  // réseau en clignotement. Le rafraîchissement se fait après coup, pour la visite suivante.
  const cache = local.lire(CLE_CONFIG)
  if (cache) { try { poser(JSON.parse(cache) as ConfigServie) } catch { /* cache abîmé */ } }

  fetch(`${__LPWS_BASE__}/v/${__LPWS_CLIENT__}.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.text() : null))
    .then((t) => {
      if (!t) return
      if (t === cache) return
      local.ecrire(CLE_CONFIG, t)
      // première visite (aucun cache) : on pose tout de suite, sinon elle serait perdue
      if (!cache) poser(JSON.parse(t) as ConfigServie)
    })
    .catch(() => { /* réseau coupé : le client voit sa page, c'est le bon repli */ })
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer)
else lancer()
