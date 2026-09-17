/**
 * runtime.ts — LE TAG : la variante appliquée sur la VRAIE page du client, dans le
 * navigateur du visiteur.
 *
 * La voie sans DNS ni hébergement. Le visiteur arrive sur l'URL réelle du client, donc son
 * suivi, son domaine et son Quality Score sont intacts — et le media buyer pose ça depuis un
 * Google Tag Manager auquel il a déjà accès.
 *
 * Le problème que ça pose, et qui n'avait pas de réponse avant l'empreinte : sur la page
 * vivante, nos ancres `data-lpws` n'existent pas. Elles ont été posées sur NOTRE clone. Le
 * tag doit donc retrouver chaque cible **par ce qu'elle est**, pas par son rang. Il rejoue
 * exactement le même calcul que le re-liage hors ligne (`relier`), dans la page.
 *
 * Ordre d'exécution, et il compte :
 *   1. décider (répartition collante) — un visiteur voit toujours la même version ;
 *   2. masquer, mais seulement le temps de poser les éditions, et jamais au-delà du délai ;
 *   3. marquer + relever les empreintes de la page vivante ;
 *   4. rapprocher des empreintes enregistrées à la capture, et **abandonner** si la cible
 *      est ambiguë ou perdue — mieux vaut la page d'origine qu'une édition au mauvais endroit ;
 *   5. appliquer ; 6. révéler ; 7. dire au dataLayer quelle version a été vue.
 *
 * Ce fichier est bundlé en un IIFE autonome par build.ts. Aucun import node ici.
 */
import { markDom } from "../../clone/1_acquire/mark.ts"
import { fingerprintDom, type Empreinte } from "../../clone/1_acquire/fingerprint.ts"
import { relier } from "../../clone/1_acquire/relink.ts"

/** Une édition du tag : le verbe, ses paramètres, et l'empreinte de sa cible à la capture. */
export type EditTag = {
  op: "set" | "remove" | "move" | "swap" | "duplicate"
  emp: Empreinte
  /** cible secondaire (move/duplicate : où poser · swap : l'autre bloc) */
  emp2?: Empreinte
  sens?: "before" | "after"
  text?: string
  href?: string
  src?: string
  placeholder?: string
  pourquoi: string
}

export type ConfigTag = {
  nom: string
  /** part du trafic qui voit la variante, en pourcentage */
  part: number
  /** millisecondes au-delà desquelles on révèle la page quoi qu'il arrive */
  delaiMax: number
  edits: EditTag[]
}

declare const __LPWS__: ConfigTag

/* ————— 1. décider, et s'y tenir ————— */

/** Hachage stable : le même visiteur retombe toujours du même côté. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

/**
 * L'identité de répartition : le `gclid` d'abord. C'est lui qui garantit qu'un clic payant
 * voit une version et une seule, même si le visiteur revient par un autre chemin — et c'est
 * ce qui permet de tester sans deux Final URLs, donc sans laisser Google réoptimiser la
 * diffusion entre les deux annonces et biaiser la comparaison.
 */
function identite(): string {
  const CLE = "lpws_id"
  const q = new URLSearchParams(location.search)
  const clic = q.get("gclid") ?? q.get("gbraid") ?? q.get("wbraid") ?? q.get("msclkid")
  if (clic) { try { localStorage.setItem(CLE, clic) } catch { /* mode privé */ } return clic }
  try {
    const garde = localStorage.getItem(CLE)
    if (garde) return garde
    const neuf = String(Date.now()) + Math.random().toString(36).slice(2)
    localStorage.setItem(CLE, neuf)
    return neuf
  } catch { return String(Math.random()) }
}

/* ————— 2. masquer le strict minimum, et jamais trop longtemps ————— */

const ID_MASQUE = "lpws-anti-flicker"

function masque(delaiMax: number): () => void {
  const st = document.createElement("style")
  st.id = ID_MASQUE
  st.textContent = "body{opacity:0 !important}"
  ;(document.head || document.documentElement).appendChild(st)
  // le chrono est pris ICI, autour des vraies opérations DOM : un observateur extérieur
  // regroupe ses lots et rendrait une mesure fausse (constaté : 0 ms alors que le masque
  // avait bien été posé)
  const t0 = performance.now()
  const fin = () => {
    st.remove()
    const w = window as unknown as { __lpwsMasque?: number }
    w.__lpwsMasque = Math.round(performance.now() - t0)
  }
  // filet : si notre code plante ou traîne, la page du client s'affiche quand même
  const secours = setTimeout(fin, delaiMax)
  return () => { clearTimeout(secours); fin() }
}

/* ————— 3-4. retrouver les cibles sur la page vivante ————— */

type Resolu = { edit: EditTag; el: Element; el2?: Element }

function resoudre(edits: EditTag[]): { resolus: Resolu[]; abandons: string[] } {
  markDom()
  const vivantes = fingerprintDom()
  const parAncre = new Map(vivantes.map((e) => [e.a, e]))

  const voulues: Empreinte[] = []
  for (const e of edits) { voulues.push(e.emp); if (e.emp2) voulues.push(e.emp2) }

  const rapport = relier(voulues, vivantes)
  const lien = new Map(rapport.retrouves.map((l) => [l.avant, l.apres]))

  const el = (emp: Empreinte): Element | null => {
    const a = lien.get(emp.a)
    if (!a) return null
    const cible = parAncre.get(a)
    if (!cible) return null
    return document.querySelector(`[data-lpws="${a}"]`)
  }

  const resolus: Resolu[] = []
  const abandons: string[] = []
  for (const e of edits) {
    const c = el(e.emp)
    if (!c) { abandons.push(`${e.emp.a} (${e.emp.role}) introuvable ou ambigu sur la page vivante`); continue }
    const c2 = e.emp2 ? el(e.emp2) : undefined
    if (e.emp2 && !c2) { abandons.push(`${e.emp2.a} (cible secondaire) introuvable ou ambiguë`); continue }
    resolus.push({ edit: e, el: c, el2: c2 ?? undefined })
  }
  return { resolus, abandons }
}

/* ————— 5. appliquer ————— */

function appliquer(r: Resolu): void {
  const { edit: e, el, el2 } = r
  if (e.op === "remove") { el.setAttribute("data-lpws-edited", ""); el.remove(); return }
  if (e.op === "swap") {
    if (!el2) return
    const marque = document.createComment("lpws")
    el.parentNode?.insertBefore(marque, el)
    el2.parentNode?.insertBefore(el, el2)
    marque.parentNode?.insertBefore(el2, marque)
    marque.remove()
    el.setAttribute("data-lpws-edited", "")
    el2.setAttribute("data-lpws-edited", "")
    return
  }
  if (e.op === "move") {
    if (!el2) return
    el.setAttribute("data-lpws-edited", "")
    if (e.sens === "before") el2.parentNode?.insertBefore(el, el2)
    else el2.parentNode?.insertBefore(el, el2.nextSibling)
    return
  }
  // duplicate — notre « ajouter une section » : on ne génère AUCUN markup, on recopie un bloc
  // du client et on le repose. Le design system est conservé au pixel par construction.
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
  // set — texte seulement, jamais de balise : la règle « aucune réécriture libre » tient ici aussi
  if (e.text !== undefined) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = e.text
    else el.textContent = e.text
  }
  if (e.placeholder !== undefined) el.setAttribute("placeholder", e.placeholder)
  if (e.href !== undefined) el.setAttribute("href", e.href)
  if (e.src !== undefined) el.setAttribute("src", e.src)
  // traçable depuis la console du client, et relu par le juge : on ne croit pas le tag
  // sur parole, on relit ce qui est réellement dans la page
  el.setAttribute("data-lpws-edited", "")
}

/* ————— l'enchaînement ————— */

function annonce(version: string, applique: number, abandons: string[]): void {
  const w = window as unknown as { dataLayer?: unknown[]; __lpws?: unknown }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({
    event: "lpws_variante",
    lpws_variante: version,
    lpws_editions: applique,
    lpws_abandons: abandons.length,
  })
  // laissé en clair pour le juge et pour déboguer depuis la console du client
  w.__lpws = { version, applique, abandons }
}

function lancer(): void {
  const cfg = __LPWS__
  const variante = hash(cfg.nom + identite()) * 100 < cfg.part
  if (!variante) { annonce("controle", 0, []); return }

  const reveler = masque(cfg.delaiMax)
  let applique = 0
  let abandons: string[] = []
  try {
    const r = resoudre(cfg.edits)
    abandons = r.abandons
    // tout ou rien : une variante à moitié posée se jugerait comme si elle était complète
    if (abandons.length === 0) { for (const x of r.resolus) { appliquer(x); applique++ } }
  } catch (err) {
    abandons.push("erreur du tag : " + String(err))
  } finally {
    reveler()
  }
  annonce(applique > 0 ? "variante" : "controle-repli", applique, abandons)
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer)
else lancer()
