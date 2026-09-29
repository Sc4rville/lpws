/**
 * variantes.ts — des constats aux trois variantes prêtes à lancer.
 *
 * Le diagnostic dit QUOI changer et POURQUOI (une règle, une source). Ici on décide COMMENT :
 * le nouveau texte d'un titre, d'un bouton, l'ordre de deux sections. C'est un moment
 * d'écriture, donc un modèle ; mais il écrit dans un cadre fermé, et sa sortie passe le même
 * contrat zod que n'importe quelle variante faite à la main (apply/spec.ts). Une proposition
 * hors contrat n'existe pas.
 *
 * Les limites qu'on lui impose ne sont pas de la politesse, ce sont celles du brain :
 *   · n'écrire que ce que la page affirme déjà, jamais un chiffre, une garantie, un client ;
 *   · une variante = une hypothèse cohérente, déclinée sur les éléments qui la portent : au
 *     moins une des trois change plusieurs éléments ensemble (titre, bouton principal, bouton
 *     du formulaire), c'est demandé au modèle et vérifié ici ;
 *   · la langue de la page, le ton de la page, pas de superlatif ;
 *   · une ancre existante, sinon rien.
 *
 * TROIS PROPOSITIONS quand les pistes le permettent : si des propositions tombent aux garde-fous,
 * on redemande (au plus MAX_APPELS appels) sur les pistes pas encore tentées, puis une autre
 * version des pistes retenues. S'il en manque encore, le bilan dit pourquoi (`manque`) : on
 * n'annonce jamais trois variantes qu'on n'a pas.
 *
 * Tourne sur les crédits du plan (`claude -p`), comme le jugement.
 */
import { readdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { z } from "zod"
import { VariantSpec } from "../apply/spec.ts"
import type { BilanEcriture, Constat, Diagnostic } from "./diagnostic.ts"
import type { SignauxMecaniques } from "./signaux.ts"
import { type Contexte, texteAnnonce } from "./contexte.ts"
import { slugify } from "../shared/paths.ts"
import { controler, nomDeSpec, texteDuHtml, type Portee } from "./garde.ts"
import { chiffresDe, principal } from "./citation.ts"
import { step } from "../shared/log.ts"
import { demanderValide } from "../shared/modele.ts"
import { ecrireJson, lireJson, premierEcart } from "../shared/json.ts"
import { campagne as fichiersDe } from "../shared/campagne.ts"

const SCOPE = "variant/variantes"

type Regime = Diagnostic["regime"]

/** Le contrat de VariantSpec et du test manuel : jusqu'à six éditions par variante. */
const EDITS_MAX = 6

/** Sous 200 k visiteurs/mois, une variante faite de textes seuls doit en changer au moins la moitié. */
const AMPLEUR_MIN = 0.5

/** L'ampleur des éditions que le volume du client permet de mesurer (docs/brain.html). */
const AMPLEUR: Record<Regime, string> = {
  "gros-changements": "- PEU DE TRAFIC : seul un gros changement se mesure. Réécris vraiment (un autre angle, pas trois mots retouchés), ou déplace, retire, duplique. Une retouche fine serait refusée.",
  "chirurgical": "- BEAUCOUP DE TRAFIC : un changement ciblé se mesure. Une seule idée par variante, pour savoir ce qui a joué.",
  "inconnu": "",
}

const Proposition = z.object({
  regle: z.string(),
  titre: z.string().min(4).max(70),
  hypothese: z.string().min(20),
  metrique: z.string().min(3),
  risque: z.string().min(3),
  edits: z.array(z.object({
    anchor: z.string(),
    op: z.enum(["set", "remove", "move", "swap", "duplicate"]).default("set"),
    text: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    with: z.string().optional(),
    as: z.string().optional(),
    pourquoi: z.string().min(3),
  })).min(1).max(EDITS_MAX),
})
type PropositionBrute = z.infer<typeof Proposition>
/* la liste se valide élément par élément : une proposition hors contrat ne doit pas emporter
 * les deux autres (constaté : un « pourquoi » trop court faisait tomber les trois variantes) */
const Propositions = z.array(z.unknown()).min(1).max(6)

/** Décliner : N variantes de plus pour UN constat, différentes de celles déjà écrites, avec
 *  éventuellement la consigne du buyer (« plus court », « parler de la livraison »). */
export type Declinaison = { n: number; consigne?: string; deja: string[] }

/** Ce que le buyer a refusé chez ce client, en clair : les textes de la spec et sa raison. */
export type RefusBuyer = { textes: string[]; raison: string }
const LECONS_MAX = 8

/** Ce qu'on demande au modèle pour un constat : une variante simple, multi-éléments, ou une autre version. */
type Demande = { k: Constat; multi: boolean; autreVersion: boolean; retenue: string; reparer?: string[] }

function cadre(demandes: Demande[], m: SignauxMecaniques, c: Contexte, langue: string, regime: Regime, dec?: Declinaison, lecons: RefusBuyer[] = [], tour: { refusees: Refus[]; deja: string[] } = { refusees: [], deja: [] }): string {
  const envoi = m.formulaire.bouton?.anchor
  const ancres = [
    m.hero.titreAnchor && `${m.hero.titreAnchor} = TITRE « ${m.hero.titre} »`,
    m.hero.sousTitreAnchor && `${m.hero.sousTitreAnchor} = SOUS-TITRE « ${m.hero.sousTitre.slice(0, 120)} »`,
    ...boutonsProposes(m).map((x) => `${x.anchor} = ${x.anchor === envoi ? "BOUTON DU FORMULAIRE" : x.anchor === principal(m)?.anchor ? "BOUTON PRINCIPAL" : "BOUTON"} « ${x.texte} »${x.auDessusDuPli ? " (au-dessus du pli)" : ""}`),
    m.nav.anchor && `${m.nav.anchor} = NAVIGATION (${m.nav.liens} liens)`,
    ...m.sections.slice(0, 10).map((s) => `${s.anchor} = SECTION « ${s.titre || "(sans titre)"} » à ${s.y}px`),
  ].filter(Boolean).join("\n")
  const constats = demandes.map((d) => d.k)

  return `Tu écris des variantes de page d'atterrissage pour un media buyer. Tu ne conseilles pas, tu produis des éditions précises, dans un cadre fermé.

RÈGLES ABSOLUES
- N'écris que ce que la page ou l'annonce (créa comprise) affirment déjà. Aucun chiffre, aucune garantie, aucun nom de client, aucune promesse qui ne figure ni sur la page ni dans l'annonce. ${c.limites ? "Interdit par le client : " + c.limites + "." : ""}
- Une variante = UNE hypothèse. Pour la rendre cohérente, change si nécessaire le titre, le sous-titre, le bouton principal ET le bouton du formulaire ensemble (jusqu'à ${EDITS_MAX} éditions). Un test ne mélange pas deux idées indépendantes.
- Langue de la page : ${langue}. Ton de la page. Pas de superlatif, pas de point d'exclamation.
- Une édition vise une ANCRE de la liste ci-dessous, jamais autre chose. La cible du constat doit être éditée ; les autres éditions de texte ne servent qu'à soutenir la même promesse.
${AMPLEUR[regime]}
- op "set" : remplace le texte (clé "text"). op "remove" : retire l'élément. op "move" : déplace l'ancre avant ("before") ou après ("after") une autre ancre. op "duplicate" : copie l'ancre et la pose "before"/"after" une autre, avec "as": un suffixe alphanumérique court. op "swap" : échange avec "with".
- Le "titre" de la variante est ce que le buyer lira dans sa liste : court (70 caractères au plus), dans ses mots (ex. « Le titre reprend la promesse de l'annonce »).

ANNONCE : « ${c.annonce.titre} » ${c.annonce.description ? "/ « " + c.annonce.description + " »" : ""}
MOTS-CLÉS : ${c.annonce.motsCles.join(", ") || "(aucun)"}
${c.crea ? `CRÉA (${c.trafic}) : accroche « ${c.crea.accroche} »${c.crea.visuel ? " · on y voit : " + c.crea.visuel : ""}\n` : ""}MODE DE VENTE : ${c.vente}${c.cible ? " · CIBLE : " + c.cible : ""}${c.offre ? " · OFFRE : " + c.offre : ""}

ANCRES DISPONIBLES
${ancres}

${dec ? `CONSTAT À DÉCLINER EN ${dec.n} VARIANTE${dec.n > 1 ? "S" : ""} (chacune avec "regle": "${constats[0].id}", différentes entre elles et de celles déjà proposées)` : `CONSTATS À TRANSFORMER EN VARIANTES (une variante par ligne, dans cet ordre : ${demandes.length} au total)`}
${demandes.map(({ k, multi, autreVersion, reparer }, i) => `${i + 1}. [${k.id}] Constat sur cette page : ${k.signal}\n   Règle : ${k.principe ?? ""}\n   Action : ${k.action}\n   Consigne : ${k.test?.consigne}\n   Verbes autorisés : ${k.test?.verbes.join(", ")} · Cible : ${k.test?.cible}${cibleCitee(k)}${multi ? consigneMulti(k, m, c) : ""}${reparer?.length ? `\n   À RÉPARER : ta proposition précédente pour ce constat a été refusée, ${reparer.join(" ; ")}. Même hypothèse : corrige exactement cela.` : ""}${autreVersion ? "\n   AUTRE VERSION : une variante de ce constat est déjà retenue ; écris-en une autre, sur un autre angle, sans reprendre ses textes." : ""}`).join("\n")}
${dec?.deja.length ? `\nDÉJÀ PROPOSÉ POUR CE CONSTAT (ne pas le répéter, ni le reformuler à peine) :\n${dec.deja.map((x) => "- " + x).join("\n")}\n` : ""}${tour.deja.length ? `\nDÉJÀ RETENU DANS CETTE ANALYSE (ne pas le répéter) :\n${tour.deja.map((x) => "- " + x).join("\n")}\n` : ""}${tour.refusees.length ? `\nREFUSÉ PAR LES GARDE-FOUS AU TOUR PRÉCÉDENT (ne pas refaire la même faute) :\n${tour.refusees.map((r) => `- [${r.regle}] « ${r.titre} » : ${r.raisons.join(" ; ")}`).join("\n")}\n` : ""}${lecons.length ? `\nREFUSÉ PAR LE MEDIA BUYER CHEZ CE CLIENT (ne pas y revenir, et en tirer la leçon pour le ton et la promesse) :\n${lecons.map((l) => `- ${l.textes.map((t) => "« " + t.slice(0, 90) + " »").join(" + ")}${l.raison ? " : " + l.raison : ""}`).join("\n")}\n` : ""}${dec?.consigne ? `\nCONSIGNE DU MEDIA BUYER (à suivre dans les règles absolues, qui priment toujours) : ${dec.consigne}\n` : ""}
Réponds UNIQUEMENT par un tableau JSON, sans texte autour, sans balises :
[{"regle": "<id du constat>", "titre": "...", "hypothese": "Si ... alors ... parce que ...", "metrique": "...", "risque": "...", "edits": [{"anchor": "e123", "op": "set", "text": "...", "pourquoi": "..."}]}]`
}

/** La variante multi-éléments : le titre, le bouton principal et le bouton du formulaire, sur la promesse de l'annonce. */
function consigneMulti(k: Constat, m: SignauxMecaniques, c: Contexte): string {
  const titre = k.test!.cible === "titre" || k.test!.cible === "sous-titre"
  const p = principal(m)?.anchor, envoi = m.formulaire.bouton?.anchor
  const cibles = [titre && m.hero.titreAnchor && `le titre (${m.hero.titreAnchor})`, p && `le bouton principal (${p})`, envoi && envoi !== p && `le bouton du formulaire (${envoi})`].filter(Boolean)
  const chiffres = chiffresDe([c.annonce.titre, c.annonce.description].filter(Boolean).join(" "))
  return `\n   MULTI-ÉLÉMENTS : cette variante change AU MOINS DEUX ancres différentes (${cibles.join(", ") || "par exemple le titre, le bouton principal et le bouton du formulaire"}), toutes au service de la même hypothèse, alignées sur la promesse de l'annonce et sur le mode de vente (${c.vente}).${titre ? ` Le titre dit le résultat que le visiteur obtient, jamais une catégorie de produit${chiffres.length ? `, et reprend ${chiffres.map((x) => `« ${x} »`).join(" ou ")} de l'annonce` : ""}.` : ""}`
}

/** Les éléments cités par le constat, quand ils sont la cible : « à éditer : e67 » */
function cibleCitee(k: Constat): string {
  const a = (k.elements ?? []).flatMap((e) => e.anchor ? [e.anchor] : [])
  return a.length ? ` · Éléments cités : ${[...new Set(a)].join(", ")}` : ""
}

/** Les boutons offerts au modèle : un par libellé (les « Start free » d'une grille tarifaire ne sont qu'un), les premiers de la page d'abord. */
function boutonsProposes(m: SignauxMecaniques): SignauxMecaniques["ctas"] {
  const vus = new Set<string>()
  return m.ctas.filter((x) => { const k = x.texte.toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true }).slice(0, 6)
}

/** Les ancres qu'une règle a le droit de viser, d'après sa cible, resserrées sur les éléments
 *  que le constat cite quand il en cite (le « Submit » générique, pas tous les boutons) ;
 *  null = pas de restriction mesurable. */
function porteeDe(k: Constat, m: SignauxMecaniques): Portee {
  const t = k.test!
  const s = (xs: Array<string | undefined>) => new Set(xs.filter((x): x is string => !!x))
  const ancres = t.cible === "titre" ? s([m.hero.titreAnchor]) : t.cible === "sous-titre" ? s([m.hero.sousTitreAnchor])
    : t.cible === "cta" ? s(m.ctas.map((x) => x.anchor))
    : t.cible === "nav" ? s([m.nav.anchor])
    : t.cible === "section" ? s(m.sections.map((x) => x.anchor))
    : null
  const cites = s((k.elements ?? []).map((e) => e.anchor))
  const resserrees = ancres ? new Set([...ancres].filter((a) => cites.has(a))) : null
  return { verbes: t.verbes, ancres: resserrees?.size ? resserrees : ancres && ancres.size ? ancres : null,
    renforts: s([m.hero.titreAnchor, m.hero.sousTitreAnchor, m.formulaire.bouton?.anchor, ...boutonsProposes(m).map((x) => x.anchor)]) }
}

/** `reparable` : refusée pour la forme (contrat, longueur), pas pour le fond ; la même piste se relance avec l'erreur. */
export type Refus = { regle: string; titre: string; raisons: string[]; edits: unknown[]; le: string; reparable?: boolean }
const REPARABLE = /^hors contrat|caractères \(\d+ au plus\)/

export type VarianteProduite = {
  nom: string; regle: string; fichier: string; titre: string; teste: string
  /** nombre d'éditions, et les ancres distinctes qu'elles touchent : ≥ 2 ancres = multi-éléments */
  changements: number; ancres: string[]
  /** pourquoi cette piste a été retenue (« meilleure piste de titre », « autre version »…) */
  retenue: string
}

const normer = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const ancresDe = (p: PropositionBrute) => [...new Set(p.edits.map((e) => e.anchor))]
export const estMulti = (p: { edits: Array<{ anchor: string }> }) => new Set(p.edits.map((e) => e.anchor)).size >= 2

type Options = { dec?: Declinaison; lecons?: RefusBuyer[]; reserves?: string[]; objectif?: number }

export async function ecrireVariantes(
  campagne: string, constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string, regime: Regime = "inconnu",
  opts: Options = {},
): Promise<VarianteProduite[]> {
  return (await ecrirePropositions(campagne, constats, m, c, langue, regime, opts)).variantes
}

/** Les pistes du premier tour : une par famille de cible, puis les meilleures restantes. */
export function choisirPistes(testables: Constat[], n = 3): Demande[] {
  /* UNE VARIANTE PAR CIBLE, pas les trois meilleurs constats quoi qu'ils touchent.
   * Décidé avec kabylesystem le 2026-09-19 : sur HubSpot, les trois meilleurs constats visaient
   * tous le titre, et le buyer se retrouvait avec un A/B/C du même mot. Il veut de la diversité :
   * un test de titre, un test de bouton, un test de structure. Si une famille est vide, on
   * complète avec le meilleur constat restant. */
  const famille = (k: Constat) => k.test!.cible === "titre" || k.test!.cible === "sous-titre" ? "titre"
    : k.test!.cible === "cta" ? "bouton" : "structure"
  const choisis: Demande[] = []
  for (const f of ["titre", "bouton", "structure"] as const) {
    const k = testables.find((x) => famille(x) === f && !choisis.some((d) => d.k === x))
    if (k && choisis.length < n) choisis.push({ k, multi: false, autreVersion: false, retenue: `meilleure piste de ${f === "bouton" ? "bouton" : f}` })
  }
  for (const k of testables) if (choisis.length < n && !choisis.some((d) => d.k === k)) choisis.push({ k, multi: false, autreVersion: false, retenue: "piste suivante par priorité" })
  // la mieux classée des pistes qui réécrivent du texte porte la variante multi-éléments
  const porteuse = [...choisis].sort((a, b) => (a.k.rang ?? 99) - (b.k.rang ?? 99)).find((d) => d.k.test!.verbes.includes("set"))
  if (porteuse) { porteuse.multi = true; porteuse.retenue += ", multi-éléments" }
  return choisis
}

/** Au plus trois appels au modèle pour une analyse : le premier, et deux pour remplacer ce qui est tombé. */
const MAX_APPELS = 3

export async function ecrirePropositions(
  campagne: string, constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string, regime: Regime = "inconnu",
  opts: Options = {},
): Promise<{ variantes: VarianteProduite[]; bilan: BilanEcriture }> {
  const { dec } = opts
  const lecons = (opts.lecons ?? []).filter((l) => l.textes.length).slice(0, LECONS_MAX)
  const f = fichiersDe(campagne)
  const testables = constats.filter((k) => k.test)
  const objectif = dec ? dec.n : opts.objectif ?? 3
  const bilan: BilanEcriture = { objectif, produites: 0, pistes: testables.length, tentees: [], appels: 0, multiElements: false }
  if (!testables.length) {
    step(SCOPE, "aucun constat testable : rien à écrire")
    return { variantes: [], bilan: { ...bilan, manque: "Le diagnostic n'a aucune piste testable avec nos verbes : aucune variante à écrire, seulement des conseils." } }
  }
  const empreintes: Array<{ a: string; role: string; text: string }> = JSON.parse(await readFile(f.ancres, "utf8"))
  const parAncre = new Map(empreintes.map((e) => [e.a, e]))
  const texteAvant = (a: string): string =>
    a === m.hero.titreAnchor ? m.hero.titre : a === m.hero.sousTitreAnchor ? m.hero.sousTitre
      : m.ctas.find((x) => x.anchor === a)?.texte ?? parAncre.get(a)?.text ?? ""
  const garde = {
    page: texteDuHtml(await readFile(f.capture, "utf8")),
    annonce: texteAnnonce(c),
    avant: new Map(empreintes.map((e) => [e.a, texteAvant(e.a)])),
    boutons: new Set(m.ctas.map((x) => x.anchor)),
    ampleurMin: regime === "gros-changements" ? AMPLEUR_MIN : undefined,
  }
  const refus: Refus[] = []
  const refuser = (p: PropositionBrute, raisons: string[]) => {
    refus.push({ regle: p.regle, titre: p.titre, raisons, edits: p.edits, le: new Date().toISOString(), ...raisons.every((r) => REPARABLE.test(r.replace(/^e\d+ : /, ""))) ? { reparable: true } : {} })
    step(SCOPE, `« ${p.titre} » refusée :\n    ${raisons.join("\n    ")}`)
  }
  const dejaVus = new Map<string, string>((dec?.deja ?? []).map((t) => [normer(t), "est déjà proposé"]))
  for (const l of opts.lecons ?? []) for (const t of l.textes) dejaVus.set(normer(t), "a déjà été refusé par le buyer")

  type Acceptee = { p: PropositionBrute; d: Demande }
  const acceptees: Acceptee[] = []
  let modeleMuet = 0

  /** Un tour : on demande, on valide, on garde ce qui passe les garde-fous. */
  const tour = async (demandes: Demande[]) => {
    const avant = refus.length
    const retenus = acceptees.flatMap((a) => a.p.edits.flatMap((e) => e.text ? [e.text] : []))
    const precedents = bilan.appels ? refus.slice(-6) : []
    bilan.appels++
    for (const d of demandes) if (!bilan.tentees.includes(d.k.id)) bilan.tentees.push(d.k.id)
    step(SCOPE, `appel ${bilan.appels} : ${demandes.map((d) => `${d.k.id}${d.multi ? " (multi-éléments)" : ""}${d.autreVersion ? " (autre version)" : ""}`).join(" · ")}`)
    // UN SEUL APPEL POUR LES TROIS. Mesuré : trois appels parallèles (une variante chacun) 65 s,
    // un appel qui écrit les trois 42 à 55 s ; la latence est dans le modèle, pas dans le nombre
    // de variantes. Le plancher du brain, c'est le jugement (~30 s) plus cet appel.
    const brutes = await demanderValide(SCOPE, cadre(demandes, m, c, langue, regime, dec, lecons, { refusees: precedents, deja: retenus }), Propositions, "liste")
    if (!brutes) { modeleMuet++; step(SCOPE, "le modèle n'a pas produit de variantes valides"); return }
    const restantes = [...demandes]
    for (const b of brutes) {
      const r = Proposition.safeParse(b)
      if (!r.success) {
        const o = (b ?? {}) as { regle?: unknown; titre?: unknown; edits?: unknown }
        refus.push({ regle: String(o.regle ?? "?"), titre: String(o.titre ?? "(sans titre)"), raisons: [`hors contrat : ${premierEcart(r.error)}`], edits: Array.isArray(o.edits) ? o.edits : [], le: new Date().toISOString(), reparable: true })
        step(SCOPE, `proposition hors contrat (${premierEcart(r.error)}) : refusée, les autres continuent`)
        continue
      }
      const p = r.data
      if (dec && acceptees.length >= dec.n) break
      // une déclinaison n'a qu'un constat : un « regle » mal recopié par le modèle ne la perd pas
      const i = dec ? 0 : restantes.findIndex((x) => x.k.id === p.regle)
      const d = restantes[i]
      if (!d) { refuser(p, [`règle inconnue ou déjà servie (${p.regle})`]); continue }
      // chaque ancre doit exister : une édition dans le vide n'est pas une variante
      const inconnue = p.edits.flatMap((e) => [e.anchor, e.before, e.after, e.with]).filter((a): a is string => !!a).find((a) => !parAncre.has(a))
      if (inconnue) { refuser(p, [`vise l'ancre ${inconnue} qui n'existe pas`]); continue }
      // le prompt demande ; le script vérifie
      const raisons = controler(p.edits, garde, porteeDe(d.k, m))
      for (const e of p.edits) { const vu = e.text && dejaVus.get(normer(e.text)); if (vu) raisons.push(`« ${e.text!.slice(0, 60)} » ${vu}`) }
      if (raisons.length) { refuser(p, raisons); continue }
      if (!dec) restantes.splice(i, 1)
      acceptees.push({ p, d })
      for (const e of p.edits) if (e.text) dejaVus.set(normer(e.text), "est déjà proposé")
      step(SCOPE, `✓ ${p.titre}${estMulti(p) ? ` (multi-éléments : ${ancresDe(p).join(", ")})` : ""}`)
    }
    step(SCOPE, `appel ${bilan.appels} : ${acceptees.length} retenue(s) en tout, ${refus.length - avant} refus`)
  }

  if (dec) await tour([{ k: testables[0], multi: false, autreVersion: false, retenue: "déclinaison" }])
  else {
    const premier = choisirPistes(testables)
    step(SCOPE, `cibles retenues : ${premier.map((d) => `${d.k.id}${d.multi ? " (multi)" : ""}`).join(" · ")}`)
    await tour(premier)
    const porteuseId = premier.find((d) => d.multi)?.k.id
    // ce qui est tombé se remplace : d'abord la même piste si l'erreur est de forme (avec l'erreur),
    // puis les pistes jamais tentées, puis une autre version des pistes qui ont tenu ;
    // jamais un constat refusé deux fois
    while (acceptees.length < objectif && bilan.appels < MAX_APPELS) {
      const manque = objectif - acceptees.length
      const refusDe = (id: string) => refus.filter((r) => r.regle === id).length
      const dernier = (id: string) => refus.filter((r) => r.regle === id).slice(-1)[0]
      const aReparer = testables.filter((k) => !acceptees.some((a) => a.d.k.id === k.id) && refusDe(k.id) < 2 && dernier(k.id)?.reparable)
      const vierges = testables.filter((k) => !bilan.tentees.includes(k.id))
      const retenues = testables.filter((k) => acceptees.some((a) => a.d.k.id === k.id) && refusDe(k.id) < 2)
      const encore = testables.filter((k) => bilan.tentees.includes(k.id) && !acceptees.some((a) => a.d.k.id === k.id) && refusDe(k.id) < 2 && !aReparer.includes(k))
      const veutMulti = !acceptees.some((a) => estMulti(a.p))
      const demandes: Demande[] = [
        ...aReparer.map((k) => ({ k, multi: false, autreVersion: false, retenue: `${premier.find((d) => d.k.id === k.id)?.retenue ?? "piste"}, réparée après une erreur de forme`.replace(", multi-éléments", ""), reparer: dernier(k.id)!.raisons })),
        ...vierges.map((k) => ({ k, multi: false, autreVersion: false, retenue: "piste suivante, après un refus des garde-fous" })),
        ...encore.map((k) => ({ k, multi: false, autreVersion: false, retenue: "piste retentée, après un refus des garde-fous" })),
        ...retenues.map((k) => ({ k, multi: false, autreVersion: true, retenue: "autre version d'une piste retenue" })),
      ].slice(0, manque)
      if (!demandes.length) break
      // la multi-éléments reste sur la piste qui la portait au premier tour, la mieux classée
      const porteuse = veutMulti ? demandes.find((d) => d.k.id === porteuseId) ?? demandes.find((d) => d.k.test!.verbes.includes("set")) : undefined
      if (porteuse) { porteuse.multi = true; porteuse.retenue += ", multi-éléments" }
      await tour(demandes)
    }
    // trois simples sans aucune multi-éléments : une version multi-éléments de la meilleure
    // piste de texte remplace la dernière retenue
    const texte = testables.find((k) => k.test!.verbes.includes("set"))
    if (acceptees.length && !acceptees.some((a) => estMulti(a.p)) && bilan.appels < MAX_APPELS && texte) {
      const n = acceptees.length
      await tour([{ k: texte, multi: true, autreVersion: acceptees.some((a) => a.d.k.id === texte.id), retenue: "version multi-éléments de la meilleure piste de texte" }])
      const multi = acceptees.slice(n).find((a) => estMulti(a.p))
      acceptees.splice(n, acceptees.length - n, ...multi ? [multi] : [])
      // elle prend la place de la version simple de la même piste, sinon de la moins bien classée
      if (multi && acceptees.length > objectif) {
        const simples = acceptees.slice(0, n)
        const meme = simples.findIndex((a) => a.d.k.id === multi.d.k.id)
        const derniere = simples.reduce((j, a, i) => (a.d.k.rang ?? 99) >= (simples[j].d.k.rang ?? 99) ? i : j, 0)
        acceptees.splice(meme >= 0 ? meme : derniere, 1)
      }
    }
  }

  // une déclinaison s'ajoute aux specs existantes : elle ne doit en écraser aucune
  const pris = new Set<string>([...opts.reserves ?? [], ...dec && existsSync(f.specs) ? (await readdir(f.specs)).map((x) => x.replace(/\.json$/, "")) : []])
  // l'ordre de lecture : la piste la mieux classée d'abord, sa version multi-éléments en tête
  if (!dec) acceptees.sort((a, b) => (a.d.k.rang ?? 99) - (b.d.k.rang ?? 99) || Number(estMulti(b.p)) - Number(estMulti(a.p)))
  const sorties: VarianteProduite[] = []
  for (const { p, d } of acceptees) {
    const k = d.k
    const nom = nomDeSpec(p.titre, pris, slugify)
    const spec = {
      nom, hypothese: p.hypothese, metrique: p.metrique, risque: p.risque,
      diagnostic: { regle: k.id, signal: k.signal, priorite: k.score >= 60 ? "HIGH" : k.score >= 35 ? "MEDIUM" : "LOW", confiance: "Medium", preuve: k.sources.join(", ") },
      edits: p.edits.map((e) => {
        const emp = parAncre.get(e.anchor)!
        return { ...e, attendu: { role: emp.role as "heading" | "text" | "link" | "media" | "field" | "bande" | "autre", text: emp.text } }
      }),
    }
    const v = VariantSpec.safeParse(spec)
    if (!v.success) { refuser(p, [`hors contrat : ${premierEcart(v.error)}`]); continue }
    const fichier = f.spec(nom)
    await ecrireJson(fichier, v.data)
    // ce que le buyer lit : des mots, pas des ancres. Le texte d'origine vient des signaux (casse
    // réelle) quand on le connaît, sinon de l'empreinte (normalisée en minuscules)
    const nommer = (a: string): string => {
      if (a === m.nav.anchor) return "le menu de navigation"
      if (a === m.hero.titreAnchor) return `le titre « ${m.hero.titre.slice(0, 60)} »`
      if (a === m.hero.sousTitreAnchor) return `le sous-titre « ${m.hero.sousTitre.slice(0, 60)} »`
      const cta = m.ctas.find((x) => x.anchor === a); if (cta) return `le bouton « ${cta.texte.slice(0, 50)} »`
      const sec = m.sections.find((x) => x.anchor === a); if (sec) return `la section « ${sec.titre || "sans titre"} »`
      return `« ${(parAncre.get(a)?.text ?? a).slice(0, 50)} »`
    }
    const teste = p.edits.map((e) => e.op === "set" ? `${nommer(e.anchor)} devient « ${(e.text ?? "").slice(0, 70)} »`
      : e.op === "remove" ? `Retirer ${nommer(e.anchor)}`
      : e.op === "duplicate" ? `Dupliquer ${nommer(e.anchor)} ${e.before ? "avant " + nommer(e.before) : "après " + nommer(e.after ?? "")}`
      : e.op === "swap" ? `Échanger ${nommer(e.anchor)} et ${nommer(e.with ?? "")}`
      : `Déplacer ${nommer(e.anchor)} ${e.before ? "avant " + nommer(e.before) : "après " + nommer(e.after ?? "")}`).join(" · ")
    sorties.push({ nom, regle: k.id, fichier, titre: p.titre, teste, changements: p.edits.length, ancres: ancresDe(p), retenue: d.retenue })
    step(SCOPE, `✓ ${p.titre} → ${fichier}`)
  }
  // le relevé des défauts d'écriture : ce que le modèle a tenté et pourquoi c'est tombé
  // une déclinaison ajoute ses refus à ceux de l'analyse, elle ne les efface pas
  await ecrireJson(f.refusees, dec ? [...await lireJson<Refus[]>(f.refusees, []), ...refus] : refus)

  bilan.produites = sorties.length
  bilan.multiElements = sorties.some((v) => v.ancres.length >= 2)
  if (sorties.length < bilan.objectif) bilan.manque = expliquerManque(bilan, refus, modeleMuet)
  if (!bilan.multiElements && sorties.length) step(SCOPE, "aucune proposition multi-éléments n'a passé les garde-fous")
  return { variantes: sorties, bilan }
}

/** En clair, pourquoi il y a moins de propositions que l'objectif : ce que le buyer doit savoir. */
export function expliquerManque(b: BilanEcriture, refus: Refus[], modeleMuet: number): string {
  const parts = [`${b.produites} proposition${b.produites > 1 ? "s" : ""} sur ${b.objectif}.`]
  if (b.pistes < b.objectif && b.produites === b.pistes) parts.push(`Le diagnostic n'a que ${b.pistes} piste${b.pistes > 1 ? "s" : ""} testable${b.pistes > 1 ? "s" : ""}.`)
  else parts.push(`${b.pistes} piste${b.pistes > 1 ? "s" : ""} testable${b.pistes > 1 ? "s" : ""}, ${b.tentees.length} tentée${b.tentees.length > 1 ? "s" : ""} en ${b.appels} appel${b.appels > 1 ? "s" : ""} au modèle.`)
  if (modeleMuet) parts.push(`${modeleMuet} appel${modeleMuet > 1 ? "s" : ""} sans réponse au contrat.`)
  const parRegle = new Map<string, string>()
  for (const r of refus) if (!parRegle.has(r.regle)) parRegle.set(r.regle, r.raisons[0] ?? "refusée")
  if (parRegle.size) parts.push(`Refusé par les garde-fous : ${[...parRegle].map(([id, r]) => `${id} (${r})`).join(" ; ")}. Détail dans variantes-refusees.json.`)
  return parts.join(" ")
}
