/**
 * import.ts — lit l'export « Termes de recherche » de Google Ads → `Termes`.
 *
 * Deux exports possibles, et les deux sont lus par la même fonction :
 *   - le CSV téléchargé depuis l'interface Google Ads (FR ou EN) : deux lignes de titre, une
 *     ligne d'en-têtes, les lignes, puis des lignes « Total : … ». Les nombres sont écrits
 *     à la française (« 1 234,56 € », « 7,41 % ») ou à l'anglaise (« 1,234.56 »), parfois en
 *     UTF-16 avec tabulations quand on choisit « Excel » ;
 *   - la feuille remplie par `ads-script.js` : en-têtes GAQL (`search_term_view.search_term`,
 *     `metrics.cost_micros`…), nombres bruts.
 *
 * Rien n'est deviné en silence : une colonne « terme » introuvable est un échec franc, les
 * lignes non lues sont comptées et rapportées.
 */
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { Termes, type Terme } from "./schema.ts"

type Col = "terme" | "correspondance" | "campagne" | "groupe" | "motCle" | "impressions" | "clics" | "cout" | "coutMicros" | "conversions"

/** les noms de colonnes connus, normalisés (minuscules, sans accents) */
const ALIAS: Record<Col, string[]> = {
  terme: ["terme de recherche", "search term", "search_term_view.search_term"],
  correspondance: ["type de correspondance", "type de correspondance du terme de recherche", "match type", "search terms match type", "segments.keyword.info.match_type", "search_term_view.search_term_match_type"],
  campagne: ["campagne", "campaign", "campaign.name"],
  groupe: ["groupe d'annonces", "groupe d’annonces", "ad group", "ad_group.name"],
  motCle: ["mot cle", "mot-cle", "mots cles", "keyword", "segments.keyword.info.text"],
  impressions: ["impr.", "impr", "impressions", "metrics.impressions"],
  clics: ["clics", "clicks", "metrics.clicks"],
  cout: ["cout", "cost"],
  coutMicros: ["metrics.cost_micros", "cost_micros"],
  conversions: ["conversions", "conv.", "metrics.conversions"],
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

/** UTF-8 (avec ou sans BOM) ou UTF-16 : Google Ads produit les deux selon le bouton cliqué */
function decoder(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le")
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const sw = Buffer.alloc(buf.length - 2)
    for (let i = 2; i + 1 < buf.length; i += 2) { sw[i - 2] = buf[i + 1]; sw[i - 1] = buf[i] }
    return sw.toString("utf16le")
  }
  return buf.toString("utf8").replace(/^﻿/, "")
}

/** le séparateur le plus fréquent sur la ligne d'en-têtes */
function separateur(ligne: string): string {
  const c: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  for (const ch of ligne) if (ch in c) c[ch]++
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]
}

/** découpe une ligne CSV en respectant les guillemets (« "a, b" » est une seule cellule) */
function cellules(ligne: string, sep: string): string[] {
  const out: string[] = []; let cur = ""; let q = false
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i]
    if (q) {
      if (ch === '"' && ligne[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { out.push(cur); cur = "" }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** « 1 234,56 € » → 1234.56 (fr) · « 1,234.56 » → 1234.56 (en) · « 7,41 % » → 7.41 */
export function nombre(s: string | undefined, langue: "fr" | "en"): number {
  if (!s) return 0
  let t = s.replace(/[^\d.,-]/g, "")
  if (!t) return 0
  if (langue === "fr") t = t.replace(/\./g, "").replace(",", ".")
  else t = t.replace(/,/g, "")
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

function correspondance(s: string | undefined): Terme["correspondance"] {
  const v = norm(s ?? "")
  if (!v) return "inconnue"
  if (v.startsWith("exact") || v.includes("exacte")) return "exact"
  if (v.includes("phrase") || v.includes("expression")) return "expression"
  if (v.includes("broad") || v.includes("large")) return "large"
  return "inconnue"
}

export async function importer(fichier: string): Promise<Termes> {
  const texte = decoder(await readFile(fichier))
  const lignes = texte.split(/\r?\n/)

  // l'en-tête est la première ligne qui contient une colonne « terme »
  let iEntete = -1, sep = ",", entete: string[] = []
  for (let i = 0; i < Math.min(lignes.length, 20); i++) {
    const s = separateur(lignes[i])
    const cells = cellules(lignes[i], s).map(norm)
    if (cells.some((c) => ALIAS.terme.includes(c))) { iEntete = i; sep = s; entete = cells; break }
  }
  if (iEntete < 0) throw new Error(`${basename(fichier)} : aucune colonne « Terme de recherche » / « Search term » trouvée dans les 20 premières lignes`)

  const col = (k: Col) => entete.findIndex((c) => ALIAS[k].includes(c))
  const ix = Object.fromEntries((Object.keys(ALIAS) as Col[]).map((k) => [k, col(k)])) as Record<Col, number>
  const script = entete.some((c) => c.startsWith("search_term_view.") || c.startsWith("metrics."))
  const langue: "fr" | "en" = script ? "en" : entete.includes("terme de recherche") ? "fr" : "en"
  // la période est sur la 2e ligne de titre des exports de l'interface (« 1 sept. 2026 - 17 sept. 2026 »)
  const periode = iEntete >= 2 && /\d{4}/.test(lignes[iEntete - 1]) ? lignes[iEntete - 1].trim().replace(/^"|"$/g, "") : undefined

  const termes: Terme[] = []
  let ignorees = iEntete + 1
  for (const ligne of lignes.slice(iEntete + 1)) {
    if (!ligne.trim()) { ignorees++; continue }
    const c = cellules(ligne, sep)
    const terme = c[ix.terme]?.trim()
    if (!terme || norm(terme).startsWith("total")) { ignorees++; continue }
    const cout = ix.coutMicros >= 0 ? nombre(c[ix.coutMicros], "en") / 1e6 : nombre(c[ix.cout], langue)
    termes.push({
      terme,
      motCle: ix.motCle >= 0 && c[ix.motCle] ? c[ix.motCle] : undefined,
      correspondance: correspondance(ix.correspondance >= 0 ? c[ix.correspondance] : undefined),
      campagne: ix.campagne >= 0 && c[ix.campagne] ? c[ix.campagne] : undefined,
      groupeAnnonces: ix.groupe >= 0 && c[ix.groupe] ? c[ix.groupe] : undefined,
      impressions: Math.round(nombre(c[ix.impressions], langue)),
      clics: Math.round(nombre(c[ix.clics], langue)),
      cout,
      conversions: nombre(c[ix.conversions], langue),
    })
  }
  return Termes.parse({
    source: { fichier: basename(fichier), format: script ? "csv-script" : "csv-google-ads", langue, periode },
    importeLe: new Date().toISOString(),
    termes,
    ignorees,
  })
}
