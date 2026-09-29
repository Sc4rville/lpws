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
 *   · une variante = une hypothèse cohérente, déclinée sur les éléments qui la portent ;
 *   · la langue de la page, le ton de la page, pas de superlatif ;
 *   · une ancre existante, sinon rien.
 *
 * Tourne sur les crédits du plan (`claude -p`), comme le jugement.
 */
import { readdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { z } from "zod"
import { VariantSpec } from "../apply/spec.ts"
import type { Constat, Diagnostic } from "./diagnostic.ts"
import type { SignauxMecaniques } from "./signaux.ts"
import { type Contexte, texteAnnonce } from "./contexte.ts"
import { slugify } from "../shared/paths.ts"
import { controler, nomDeSpec, texteDuHtml, type Portee } from "./garde.ts"
import { step } from "../shared/log.ts"
import { demanderValide } from "../shared/modele.ts"
import { ecrireJson, lireJson, premierEcart } from "../shared/json.ts"
import { campagne as fichiersDe } from "../shared/campagne.ts"

const SCOPE = "variant/variantes"

type Regime = Diagnostic["regime"]

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
  })).min(1).max(5),
})
/* la liste se valide élément par élément : une proposition hors contrat ne doit pas emporter
 * les deux autres (constaté : un « pourquoi » trop court faisait tomber les trois variantes) */
const Propositions = z.array(z.unknown()).min(1).max(4)

/** Décliner : N variantes de plus pour UN constat, différentes de celles déjà écrites, avec
 *  éventuellement la consigne du buyer (« plus court », « parler de la livraison »). */
export type Declinaison = { n: number; consigne?: string; deja: string[] }

/** Ce que le buyer a refusé chez ce client, en clair : les textes de la spec et sa raison. */
export type RefusBuyer = { textes: string[]; raison: string }
const LECONS_MAX = 8

function cadre(constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string, regime: Regime, dec?: Declinaison, lecons: RefusBuyer[] = []): string {
  const ancres = [
    m.hero.titreAnchor && `${m.hero.titreAnchor} = TITRE « ${m.hero.titre} »`,
    m.hero.sousTitreAnchor && `${m.hero.sousTitreAnchor} = SOUS-TITRE « ${m.hero.sousTitre.slice(0, 120)} »`,
    ...boutonsProposes(m).map((x) => `${x.anchor} = BOUTON « ${x.texte} »${x.auDessusDuPli ? " (au-dessus du pli)" : ""}`),
    m.nav.anchor && `${m.nav.anchor} = NAVIGATION (${m.nav.liens} liens)`,
    ...m.sections.slice(0, 10).map((s) => `${s.anchor} = SECTION « ${s.titre || "(sans titre)"} » à ${s.y}px`),
  ].filter(Boolean).join("\n")

  return `Tu écris des variantes de page d'atterrissage pour un media buyer. Tu ne conseilles pas, tu produis des éditions précises, dans un cadre fermé.

RÈGLES ABSOLUES
- N'écris que ce que la page ou l'annonce (créa comprise) affirment déjà. Aucun chiffre, aucune garantie, aucun nom de client, aucune promesse qui ne figure ni sur la page ni dans l'annonce. ${c.limites ? "Interdit par le client : " + c.limites + "." : ""}
- Une variante = UNE hypothèse. Pour la rendre cohérente, change si nécessaire le titre, le sous-titre ET le bouton principal ensemble (jusqu'à 5 éditions). Un test ne mélange pas deux idées indépendantes.
- Langue de la page : ${langue}. Ton de la page. Pas de superlatif, pas de point d'exclamation.
- Une édition vise une ANCRE de la liste ci-dessous, jamais autre chose. La cible du constat doit être éditée ; les autres éditions de texte ne servent qu'à soutenir la même promesse.
${AMPLEUR[regime]}
- op "set" : remplace le texte (clé "text"). op "remove" : retire l'élément. op "move" : déplace l'ancre avant ("before") ou après ("after") une autre ancre. op "duplicate" : copie l'ancre et la pose "before"/"after" une autre, avec "as": un suffixe alphanumérique court. op "swap" : échange avec "with".
- Le "titre" de la variante est ce que le buyer lira dans sa liste : court, dans ses mots (ex. « Le titre reprend la promesse de l'annonce »).

ANNONCE : « ${c.annonce.titre} » ${c.annonce.description ? "/ « " + c.annonce.description + " »" : ""}
MOTS-CLÉS : ${c.annonce.motsCles.join(", ") || "(aucun)"}
${c.crea ? `CRÉA (${c.trafic}) : accroche « ${c.crea.accroche} »${c.crea.visuel ? " · on y voit : " + c.crea.visuel : ""}\n` : ""}MODE DE VENTE : ${c.vente}${c.cible ? " · CIBLE : " + c.cible : ""}${c.offre ? " · OFFRE : " + c.offre : ""}

ANCRES DISPONIBLES
${ancres}

${dec ? `CONSTAT À DÉCLINER EN ${dec.n} VARIANTE${dec.n > 1 ? "S" : ""} (chacune avec "regle": "${constats[0].id}", différentes entre elles et de celles déjà proposées)` : "CONSTATS À TRANSFORMER EN VARIANTES (une variante par constat, dans cet ordre)"}
${constats.map((k, i) => `${i + 1}. [${k.id}] ${k.signal}\n   Action : ${k.action}\n   Consigne : ${k.test?.consigne}\n   Verbes autorisés : ${k.test?.verbes.join(", ")} · Cible : ${k.test?.cible}`).join("\n")}
${dec?.deja.length ? `\nDÉJÀ PROPOSÉ POUR CE CONSTAT (ne pas le répéter, ni le reformuler à peine) :\n${dec.deja.map((x) => "- " + x).join("\n")}\n` : ""}${lecons.length ? `\nREFUSÉ PAR LE MEDIA BUYER CHEZ CE CLIENT (ne pas y revenir, et en tirer la leçon pour le ton et la promesse) :\n${lecons.map((l) => `- ${l.textes.map((t) => "« " + t.slice(0, 90) + " »").join(" + ")}${l.raison ? " : " + l.raison : ""}`).join("\n")}\n` : ""}${dec?.consigne ? `\nCONSIGNE DU MEDIA BUYER (à suivre dans les règles absolues, qui priment toujours) : ${dec.consigne}\n` : ""}
Réponds UNIQUEMENT par un tableau JSON, sans texte autour, sans balises :
[{"regle": "<id du constat>", "titre": "...", "hypothese": "Si ... alors ... parce que ...", "metrique": "...", "risque": "...", "edits": [{"anchor": "e123", "op": "set", "text": "...", "pourquoi": "..."}]}]`
}

/** Les boutons offerts au modèle : un par libellé (les « Start free » d'une grille tarifaire ne sont qu'un), les premiers de la page d'abord. */
function boutonsProposes(m: SignauxMecaniques): SignauxMecaniques["ctas"] {
  const vus = new Set<string>()
  return m.ctas.filter((x) => { const k = x.texte.toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true }).slice(0, 6)
}

/** Les ancres qu'une règle a le droit de viser, d'après sa cible ; null = pas de restriction mesurable. */
function porteeDe(k: Constat, m: SignauxMecaniques): Portee {
  const t = k.test!
  const s = (xs: Array<string | undefined>) => new Set(xs.filter((x): x is string => !!x))
  const ancres = t.cible === "titre" ? s([m.hero.titreAnchor]) : t.cible === "sous-titre" ? s([m.hero.sousTitreAnchor])
    : t.cible === "cta" ? s(m.ctas.map((x) => x.anchor))
    : t.cible === "nav" ? s([m.nav.anchor])
    : t.cible === "section" ? s(m.sections.map((x) => x.anchor))
    : null
  return { verbes: t.verbes, ancres: ancres && ancres.size ? ancres : null,
    renforts: s([m.hero.titreAnchor, m.hero.sousTitreAnchor, ...boutonsProposes(m).map((x) => x.anchor)]) }
}

export type Refus = { regle: string; titre: string; raisons: string[]; edits: unknown[]; le: string }

export type VarianteProduite = { nom: string; regle: string; fichier: string; titre: string; teste: string }

const normer = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

export async function ecrireVariantes(
  campagne: string, constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string, regime: Regime = "inconnu",
  opts: { dec?: Declinaison; lecons?: RefusBuyer[]; reserves?: string[] } = {},
): Promise<VarianteProduite[]> {
  const { dec } = opts
  const lecons = (opts.lecons ?? []).filter((l) => l.textes.length).slice(0, LECONS_MAX)
  const f = fichiersDe(campagne)
  const empreintes: Array<{ a: string; role: string; text: string }> = JSON.parse(await readFile(f.ancres, "utf8"))
  const parAncre = new Map(empreintes.map((e) => [e.a, e]))
  /* UNE VARIANTE PAR CIBLE, pas les trois meilleurs constats quoi qu'ils touchent.
   * Décidé avec kabylesystem le 2026-09-19 : sur HubSpot, les trois meilleurs constats visaient
   * tous le titre, et le buyer se retrouvait avec un A/B/C du même mot. Il veut de la diversité :
   * un test de titre, un test de bouton, un test de structure. Si une famille est vide, on
   * complète avec le meilleur constat restant. */
  const famille = (k: Constat) => k.test!.cible === "titre" || k.test!.cible === "sous-titre" ? "titre"
    : k.test!.cible === "cta" ? "bouton" : "structure"
  const testables = constats.filter((k) => k.test)
  const choisis: Constat[] = []
  for (const f of ["titre", "bouton", "structure"] as const) {
    const k = testables.find((x) => famille(x) === f && !choisis.includes(x))
    if (k) choisis.push(k)
  }
  for (const k of testables) if (choisis.length < 3 && !choisis.includes(k)) choisis.push(k)
  if (dec) choisis.splice(0, choisis.length, ...testables.slice(0, 1))
  if (!choisis.length) { step(SCOPE, "aucun constat testable : rien à écrire"); return [] }
  step(SCOPE, `cibles retenues : ${choisis.map((k) => `${famille(k)} (${k.id})`).join(" · ")}`)

  // UN SEUL APPEL POUR LES TROIS. Mesuré : trois appels parallèles (une variante chacun) 65 s,
  // un appel qui écrit les trois 42 à 55 s ; la latence est dans le modèle, pas dans le nombre
  // de variantes. Le plancher du brain, c'est le jugement (~30 s) plus cet appel.
  const brutes = await demanderValide(SCOPE, cadre(choisis, m, c, langue, regime, dec, lecons), Propositions, "liste")
  if (!brutes) { step(SCOPE, "le modèle n'a pas produit de variantes valides"); return [] }

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
  const refuser = (p: z.infer<typeof Proposition>, raisons: string[]) => {
    refus.push({ regle: p.regle, titre: p.titre, raisons, edits: p.edits, le: new Date().toISOString() })
    step(SCOPE, `« ${p.titre} » refusée :\n    ${raisons.join("\n    ")}`)
  }
  const props: Array<z.infer<typeof Proposition>> = []
  for (const b of brutes) {
    const r = Proposition.safeParse(b)
    if (r.success) { props.push(r.data); continue }
    const o = (b ?? {}) as { regle?: unknown; titre?: unknown; edits?: unknown }
    refus.push({ regle: String(o.regle ?? "?"), titre: String(o.titre ?? "(sans titre)"), raisons: [`hors contrat : ${premierEcart(r.error)}`], edits: Array.isArray(o.edits) ? o.edits : [], le: new Date().toISOString() })
    step(SCOPE, `proposition hors contrat (${premierEcart(r.error)}) : refusée, les autres continuent`)
  }
  // une déclinaison s'ajoute aux specs existantes : elle ne doit en écraser aucune
  const pris = new Set<string>([...opts.reserves ?? [], ...dec && existsSync(f.specs) ? (await readdir(f.specs)).map((x) => x.replace(/\.json$/, "")) : []])
  const dejaVus = new Map<string, string>((dec?.deja ?? []).map((t) => [normer(t), "est déjà proposé"]))
  for (const l of opts.lecons ?? []) for (const t of l.textes) dejaVus.set(normer(t), "a déjà été refusé par le buyer")
  const sorties: VarianteProduite[] = []
  for (const p of props) {
    if (dec && sorties.length >= dec.n) break
    // une déclinaison n'a qu'un constat : un « regle » mal recopié par le modèle ne la perd pas
    const k = dec ? choisis[0] : choisis.find((x) => x.id === p.regle)
    if (!k) { refuser(p, [`règle inconnue (${p.regle})`]); continue }
    // chaque ancre doit exister : une édition dans le vide n'est pas une variante
    const inconnue = p.edits.flatMap((e) => [e.anchor, e.before, e.after, e.with]).filter((a): a is string => !!a).find((a) => !parAncre.has(a))
    if (inconnue) { refuser(p, [`vise l'ancre ${inconnue} qui n'existe pas`]); continue }
    // le prompt demande ; le script vérifie
    const raisons = controler(p.edits, garde, porteeDe(k, m))
    for (const e of p.edits) { const vu = e.text && dejaVus.get(normer(e.text)); if (vu) raisons.push(`« ${e.text!.slice(0, 60)} » ${vu}`) }
    if (raisons.length) { refuser(p, raisons); continue }

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
    sorties.push({ nom, regle: k.id, fichier, titre: p.titre, teste })
    for (const e of p.edits) if (e.text) dejaVus.set(normer(e.text), "est déjà proposé")
    step(SCOPE, `✓ ${p.titre} → ${fichier}`)
  }
  // le relevé des défauts d'écriture : ce que le modèle a tenté et pourquoi c'est tombé
  // une déclinaison ajoute ses refus à ceux de l'analyse, elle ne les efface pas
  await ecrireJson(f.refusees, dec ? [...await lireJson<Refus[]>(f.refusees, []), ...refus] : refus)
  return sorties
}
