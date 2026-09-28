/**
 * garde.ts — LES GARDE-FOUS D'ÉCRITURE : ce qu'une variante proposée par le modèle n'a pas le
 * droit de faire, vérifié par un script et non par la bonne volonté du prompt.
 *
 * Le cadre de variantes.ts DEMANDE au modèle de ne rien inventer ; ici on le CONTRÔLE. Une
 * proposition qui échoue n'est pas corrigée en silence : elle est refusée, avec sa raison, et
 * la raison est gardée (variantes-refusees.json) — c'est le relevé des défauts du brain.
 *
 * Fonctions pures : testables sans modèle, sans navigateur.
 */

/** Le texte visible d'un document HTML capturé, sans scripts ni styles. Les <template> restent :
 * les racines fantômes capturées (déclaratives) y vivent, avec leur texte. */
export function texteDuHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ").trim()
}

/** La langue de la page : l'attribut lang du document, sinon les mots outils du texte. */
export function langueDe(html: string): string {
  const NOMS: Record<string, string> = { fr: "français", en: "anglais", de: "allemand", es: "espagnol", it: "italien", pt: "portugais", nl: "néerlandais" }
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-z]{2})/i)?.[1]?.toLowerCase()
  if (lang && NOMS[lang]) return NOMS[lang]
  const t = " " + texteDuHtml(html).toLowerCase().slice(0, 4000) + " "
  const compte = (mots: string[]) => mots.reduce((n, m) => n + (t.split(` ${m} `).length - 1), 0)
  const scores: Array<[string, number]> = [
    ["français", compte(["le", "la", "les", "des", "et", "vous", "pour", "avec", "une", "est"])],
    ["anglais", compte(["the", "and", "you", "your", "for", "with", "to", "of", "is", "our"])],
    ["allemand", compte(["der", "die", "das", "und", "sie", "mit", "für", "ist", "ihre"])],
    ["espagnol", compte(["el", "los", "las", "y", "para", "con", "una", "su", "es"])],
  ]
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] >= 3 ? scores[0][0] : "la langue de la page"
}

/** Les nombres d'un texte, normalisés (« 1 000 » et « 1,000 » → « 1000 », « 2,5 » → « 2.5 »). */
export function nombresDe(t: string): string[] {
  return (t.match(/\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*/g) ?? [])
    .map((n) => n.replace(/[ \u00a0\u202f]/g, "").replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."))
}

/** Superlatifs et allégations absolues : jamais écrits par le brain, sauf si la page les porte déjà. */
const SUPERLATIFS = [
  "best", "#1", "no. 1", "number one", "leading", "ultimate", "revolutionary", "world-class", "unbeatable", "guaranteed", "guarantee", "perfect", "fastest", "cheapest", "easiest",
  "meilleur", "meilleure", "n°1", "numéro 1", "leader", "ultime", "révolutionnaire", "imbattable", "garanti", "garantie", "parfait", "incroyable", "le plus rapide", "moins cher",
]

/** Urgence ou rareté : jamais fabriquée, seulement reprise si la page ou l'annonce l'affiche. */
const URGENCE = [
  /plus que \d+/, /derni[eè]re?s? (chance|places?|pi[eè]ces?|jours?|heures?)/, /d[ée]p[eê]chez/, /(offre|promo\w*) (expire|limit[ée]e?)/,
  /aujourd'hui seulement/, /(se termine|fin) (ce soir|demain|bient[oô]t)/, /stock limit[ée]/, /temps limit[ée]/, /quantit[ée]s? limit[ée]es?/,
  /only \d+ left/, /last chance/, /hurry/, /limited (time|stock|offer|spots?)/, /(ends|expires) (tonight|today|soon|tomorrow)/, /while (stocks?|supplies) last/, /act now/,
]

/** Personnalisation simulée : un gabarit ou un « pour vous » que rien ne justifie. */
const PERSONNALISATION = [/\{[^}]*\}/, /\[(entreprise|company|pr[ée]nom|name|ville|city)\]/, /con[çc]ue? (sp[ée]cialement )?pour vous/, /(made|built|designed) (especially |just )?for you/]

/** Une citation : entre guillemets, assez longue pour être un témoignage. */
const CITATION = /[«“"]\s*([^«»“”"]{12,}?)\s*[»”"]/g

export type EditPropose = {
  anchor: string; op: "set" | "remove" | "move" | "swap" | "duplicate"
  text?: string; before?: string; after?: string; with?: string; as?: string
}

/** Ce que la règle permet de viser : ses verbes, et les ancres de sa cible. */
export type Portee = { verbes: string[]; ancres: Set<string> | null }

export type CadreGarde = {
  /** le texte visible de la page (capture desktop) */
  page: string
  /** le titre + la description de l'annonce : un chiffre de l'annonce est une affirmation du client */
  annonce: string
  /** le texte actuel de chaque ancre */
  avant: Map<string, string>
  /** les ancres qui sont des boutons (libellé court exigé) */
  boutons: Set<string>
  /** régime « gros changements » : l'ampleur minimale d'une variante faite de textes seuls */
  ampleurMin?: number
}

const mots = (s: string) => s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? []

/** La plus longue suite de mots commune aux deux textes, dans l'ordre. */
function communs(a: string[], b: string[]): number {
  let prec = new Array<number>(b.length + 1).fill(0)
  for (const x of a) {
    const cour = [0]
    for (let j = 0; j < b.length; j++) cour.push(x === b[j] ? prec[j] + 1 : Math.max(prec[j + 1], cour[j]))
    prec = cour
  }
  return prec[b.length]
}

/** Ce qui change d'un texte à l'autre, de 0 (mêmes mots, même ordre) à 1 (aucun mot commun) : le
 * plus grand de l'écart de vocabulaire (Jaccard) et de l'écart d'ordre (mots hors de la suite commune). */
export function ampleur(avant: string, apres: string): number {
  const a = mots(avant), b = mots(apres)
  if (!a.length && !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  const jaccard = 1 - [...sa].filter((m) => sb.has(m)).length / new Set([...a, ...b]).size
  return Math.max(jaccard, 1 - communs(a, b) / Math.max(a.length, b.length))
}

/** Une retouche : trop peu de texte change, ou un libellé court n'a fait que gagner ou perdre des mots
 * (« Submit » → « Submit now »), ce qu'aucun seuil proportionnel ne voit sur un ou deux mots. */
export function retoucheFine(avant: string, apres: string, min: number): boolean {
  if (ampleur(avant, apres) < min) return true
  const a = mots(avant), b = mots(apres)
  return a.length <= 3 && a.length !== b.length && communs(a, b) === Math.min(a.length, b.length)
}

const norme = (s: string) => s.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase()

/** Les raisons de refuser une proposition ; liste vide = elle passe. */
export function controler(edits: EditPropose[], g: CadreGarde, portee?: Portee): string[] {
  const raisons: string[] = []
  if (portee) for (const e of edits) {
    if (!portee.verbes.includes(e.op)) raisons.push(`${e.anchor} : verbe « ${e.op} » hors de ceux de la règle (${portee.verbes.join(", ")})`)
    if (portee.ancres && !portee.ancres.has(e.anchor)) raisons.push(`${e.anchor} : hors de la cible de la règle`)
  }
  const page = norme(g.page), source = page + " " + norme(g.annonce)
  const nombresAutorises = new Set(nombresDe(source))
  const vus = new Set<string>()
  for (const e of edits) {
    const cle = `${e.op}:${e.anchor}`
    if (vus.has(cle)) raisons.push(`${e.anchor} : deux éditions « ${e.op} » sur la même ancre`)
    vus.add(cle)
    for (const autre of [e.before, e.after, e.with]) if (autre && autre === e.anchor) raisons.push(`${e.anchor} : ${e.op} vers elle-même`)
    if ((e.op === "move" || e.op === "duplicate") && !e.before && !e.after) raisons.push(`${e.anchor} : ${e.op} sans « before » ni « after »`)
    if (e.op === "swap" && !e.with) raisons.push(`${e.anchor} : swap sans « with »`)
    if (e.op !== "set") continue

    const t = (e.text ?? "").trim()
    if (!t) { raisons.push(`${e.anchor} : texte vide`); continue }
    const avant = g.avant.get(e.anchor) ?? ""
    if (norme(t) === norme(avant)) raisons.push(`${e.anchor} : le texte proposé est identique à l'actuel — la variante ne teste rien`)
    const inventes = nombresDe(t).filter((n) => !nombresAutorises.has(n))
    if (inventes.length) raisons.push(`${e.anchor} : chiffre absent de la page et de l'annonce (${inventes.join(", ")})`)
    if (t.includes("!") && !avant.includes("!")) raisons.push(`${e.anchor} : point d'exclamation`)
    const sup = SUPERLATIFS.filter((s) => new RegExp(`(^|[^\\p{L}])${s.replace(/[.]/g, "\\.")}($|[^\\p{L}])`, "iu").test(t) && !page.includes(s))
    if (sup.length) raisons.push(`${e.anchor} : allégation que la page ne porte pas (${sup.join(", ")})`)
    const tn = norme(t)
    const urgence = URGENCE.map((r) => tn.match(r)?.[0]).find((m) => m && !source.includes(m))
    if (urgence) raisons.push(`${e.anchor} : urgence ou rareté que la page n'affiche pas (« ${urgence} »)`)
    const citation = [...tn.matchAll(CITATION)].map((q) => q[1].trim()).find((q) => !page.includes(q))
    if (citation) raisons.push(`${e.anchor} : citation absente de la page, faux témoignage (« ${citation.slice(0, 50)} »)`)
    const perso = PERSONNALISATION.map((r) => tn.match(r)?.[0]).find((m) => m && !page.includes(m))
    if (perso) raisons.push(`${e.anchor} : personnalisation simulée (« ${perso} »)`)
    if (g.boutons.has(e.anchor)) {
      if (t.length > 40) raisons.push(`${e.anchor} : libellé de bouton de ${t.length} caractères (40 au plus)`)
    } else if (avant && t.length > Math.max(avant.length * 2.5, 120)) {
      raisons.push(`${e.anchor} : texte ${Math.round(t.length / Math.max(avant.length, 1))}× plus long que l'actuel`)
    }
  }
  // Sous 200 k visiteurs/mois, seul un gros écart se détecte (docs/brain.html, « ordres de
  // grandeur ») : trois mots retouchés dans un titre occuperaient le trafic des semaines pour
  // ne rien conclure. Un déplacement, un retrait, une duplication sont gros par nature.
  if (g.ampleurMin !== undefined && edits.length && edits.every((e) => e.op === "set")) {
    const min = g.ampleurMin
    const max = Math.max(...edits.map((e) => ampleur(g.avant.get(e.anchor) ?? "", e.text ?? "")))
    if (edits.every((e) => retoucheFine(g.avant.get(e.anchor) ?? "", e.text ?? "", min))) raisons.push(`retouche trop fine pour ce volume (${Math.round(max * 100)} % du texte change, ${Math.round(g.ampleurMin * 100)} % au moins) : à ce trafic, seul un gros changement peut conclure`)
  }
  return raisons
}

/** Un nom de spec lisible et unique : coupé à un mot entier seulement s'il faut couper. */
export function nomDeSpec(titre: string, pris: Set<string>, slug: (s: string) => string, max = 44): string {
  let base = slug(titre)
  if (base.length > max) base = base.slice(0, max + 1).replace(/-[^-]*$/, "") || base.slice(0, max)
  base = base.replace(/^-+|-+$/g, "") || "variante"
  let nom = base, i = 2
  while (pris.has(nom)) nom = `${base}-${i++}`
  pris.add(nom)
  return nom
}
