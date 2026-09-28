/**
 * corpus.ts — REPASSER LE CORPUS et sortir le tableau de verdicts (feuille de route 1.1.5).
 *
 * Toute évolution de `engine/clone` doit repasser le corpus (docs/corpus.md). Par défaut on
 * RE-JUGE les baselines déjà capturées (rapide, rejouable hors ligne : le juge ne touche pas au
 * live) ; `--recapturer` refait tout le clone (réseau, lent). Une page jamais capturée est dite
 * « absente », pas passée sous silence.
 *
 * Le verdict de chaque page combine le juge de page et le juge par section :
 *   fidèle          la page entière passe
 *   décalage seul   la page échoue, mais chaque section recalée est fidèle : le contenu qui
 *                   manque ou s'ajoute est HORS des sections jugées, et `ruptures` dit où.
 *                   Ce n'est pas un succès : une section entière absente du clone donne ça
 *   à revoir        les sections qui ont vraiment changé, la pire d'abord
 *
 * Usage : npm run corpus [-- <url>… ] [--recapturer] [--seuil 0.03]
 * Sortie : le tableau (markdown) sur stdout, et clients/corpus.json.
 */
import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { verifyBaseline, SEUIL_DEFAUT } from "./5_verify/verify.ts"
import type { DiffSection, DiffSections } from "./5_verify/diff.ts"
import { CLIENTS_ROOT, marque, slugify } from "../shared/paths.ts"
import { ecrireJson } from "../shared/json.ts"
import { step } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"

const SCOPE = "clone/corpus"

/** docs/corpus.md : cinq pages, chacune stresse un aspect de la machine */
export const CORPUS = [
  "https://www.hubspot.com/products/marketing",
  "https://www.salesforce.com/crm/",
  "https://asana.com/uses/project-management",
  "https://monday.com/work-management",
  "https://www.atlassian.com/software/jira",
]

export type Ligne = {
  url: string
  baseline: string
  etat: "fidèle" | "décalage seul" | "à revoir" | "absente" | "échec"
  desktop: number | null
  mobile: number | null
  /** ratio desktop une fois chaque section recalée */
  aligne: number | null
  sections: { fideles: number; total: number }
  aRevoir: Array<Pick<DiffSection, "anchor" | "titre" | "ratio"> & { vue: "desktop" | "mobile" }>
  /** contenu en plus (+, dans le live) ou en moins que le clone, entre les sections */
  ruptures: Array<DiffSections["ruptures"][number] & { vue: "desktop" | "mobile" }>
  erreur?: string
}

const pct = (x: number | null) => x === null ? "—" : `${(x * 100).toFixed(1)} %`

export const baselineDe = (url: string) =>
  join(CLIENTS_ROOT, marque(url), slugify(new URL(url).pathname) || "campagne-1", "baseline")

export async function jugerPage(url: string, recapturer: boolean, seuil: number): Promise<Ligne> {
  const baseline = baselineDe(url)
  const vide: Ligne = { url, baseline, etat: "absente", desktop: null, mobile: null, aligne: null, sections: { fideles: 0, total: 0 }, aRevoir: [], ruptures: [] }
  if (recapturer) {
    // le clone complet, dans son propre processus : un plantage n'emporte pas le reste du corpus
    const debut = Date.now()
    const r = spawnSync(process.execPath, ["--import", "tsx", "engine/clone/run.ts", url, "--seuil", String(seuil)], { stdio: ["ignore", "ignore", "inherit"] })
    // le clone sort en 1 sur une page non fidèle, mais il a alors RÉÉCRIT verify.json ; sinon il a
    // planté, et rejuger l'ancienne capture ferait passer une page qu'on n'a pas recapturée
    const verify = join(baseline, "verify.json")
    if (r.status !== 0 && !(existsSync(verify) && statSync(verify).mtimeMs >= debut))
      return { ...vide, etat: "échec", erreur: `clone interrompu (code ${r.status})` }
  }
  if (!existsSync(join(baseline, "capture.html"))) return vide
  try {
    const v = await verifyBaseline(baseline, seuil)
    const toutes = [...v.desktop.sections.sections, ...v.mobile.sections.sections]
    const aRevoir = (["desktop", "mobile"] as const)
      .flatMap((vue) => v[vue].sections.sections.filter((s) => !s.fidele).map((s) => ({ anchor: s.anchor, titre: s.titre, ratio: s.ratio, vue })))
      .sort((a, b) => b.ratio - a.ratio)
    const nonJugees = v.desktop.sections.nonJugees.length + v.mobile.sections.nonJugees.length
    const ruptures = (["desktop", "mobile"] as const).flatMap((vue) => v[vue].sections.ruptures.map((x) => ({ ...x, vue })))
    return {
      ...vide,
      etat: v.fidele ? "fidèle" : aRevoir.length === 0 && nonJugees === 0 && toutes.length > 0 ? "décalage seul" : "à revoir",
      desktop: v.desktop.diff.ratio, mobile: v.mobile.diff.ratio, aligne: v.desktop.sections.ratioAligne,
      sections: { fideles: toutes.length - aRevoir.length, total: toutes.length }, aRevoir, ruptures,
    }
  } catch (e) {
    return { ...vide, etat: "échec", erreur: e instanceof Error ? e.message : String(e) }
  }
}

export function tableau(lignes: Ligne[]): string {
  const px = (d: number) => `${d > 0 ? "+" : "−"}${Math.abs(d)} px`
  const detail = (l: Ligne) => l.erreur ?? (l.aRevoir.length
    ? l.aRevoir.slice(0, 3).map((s) => `${s.anchor} « ${s.titre} » ${pct(s.ratio)} (${s.vue})`).join(" · ")
    : l.etat === "décalage seul" ? l.ruptures.slice(0, 3).map((x) => `${px(x.delta)} ${x.avant ? `avant ${x.avant} « ${x.titre} »` : "en bas de page"} (${x.vue})`).join(" · ")
    : l.etat === "absente" ? "jamais capturée : npm run corpus -- --recapturer" : "")
  return [
    "| page | verdict | desktop | mobile | recalé | sections fidèles | à revoir |",
    "|---|---|---|---|---|---|---|",
    ...lignes.map((l) => `| ${l.url} | ${l.etat} | ${pct(l.desktop)} | ${pct(l.mobile)} | ${pct(l.aligne)} | ${l.sections.total ? `${l.sections.fideles}/${l.sections.total}` : "—"} | ${detail(l)} |`),
  ].join("\n")
}

async function main() {
  const args = lireArgs(["--recapturer"])
  const urls = args.libres.filter((a) => a.startsWith("http"))
  const seuil = args.option("--seuil") ? Number(args.option("--seuil")) : SEUIL_DEFAUT
  const recapturer = args.drapeau("--recapturer")
  const lignes: Ligne[] = []
  for (const url of urls.length ? urls : CORPUS) {
    step(SCOPE, `${url}${recapturer ? " (recapture)" : ""}`)
    lignes.push(await jugerPage(url, recapturer, seuil))
  }
  await ecrireJson(join(CLIENTS_ROOT, "corpus.json"), { le: new Date().toISOString(), seuil, lignes })
  console.log(tableau(lignes))
  process.exit(lignes.every((l) => l.etat === "fidèle") ? 0 : 1)
}

if (estLance(import.meta.url)) main()
