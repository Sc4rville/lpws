/**
 * run.ts — la brique intention de bout en bout : export Google Ads → termes.json + intents.json.
 *
 * Usage : npm run intents -- <export.csv> --client <client> --campagne <campagne> [--marques jira,atlassian]
 *
 * Écrit sous clients/<client>/<campagne>/intents/ (jamais dans le repo) et affiche le tableau
 * par intention — c'est lui qu'on lit pour décider où un test par intention vaut la peine.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { importer } from "./import.ts"
import { classer } from "./classify.ts"
import { grouper } from "./group.ts"
import { SUFFIXE_URL_FINALE } from "./schema.ts"
import { step, fail } from "../shared/log.ts"

const SCOPE = "intent"
const ROOT = resolve(import.meta.dirname, "..", "..")

const args = process.argv.slice(2)
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined }
const fichier = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")))
const client = opt("client"), campagne = opt("campagne")
if (!fichier || !client || !campagne)
  fail(SCOPE, "usage : npm run intents -- <export.csv> --client <client> --campagne <campagne> [--marques a,b]")
const marques = (opt("marques") ?? "").split(",").map((s) => s.trim()).filter(Boolean)

const t = await importer(resolve(fichier)).catch((e: Error) => fail(SCOPE, e.message))
step(SCOPE, `${t.termes.length} termes lus (${t.source.format}, ${t.source.langue}${t.source.periode ? ", " + t.source.periode : ""}) · ${t.ignorees} lignes ignorées`)

const classes = t.termes.map((x) => classer(x.terme, marques))
const intents = grouper(t, classes, { client, campagne, methode: "heuristique" })

const dir = join(ROOT, "clients", client, campagne, "intents")
await mkdir(dir, { recursive: true })
await writeFile(join(dir, "termes.json"), JSON.stringify(t, null, 2))
await writeFile(join(dir, "intents.json"), JSON.stringify(intents, null, 2))

/* le tableau : une ligne par intention, du plus cliqué au moins cliqué */
const fr = (n: number) => Math.round(n).toLocaleString("fr-FR")
const pc = (x: number | null) => x === null ? "—" : (x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"
const eur = (x: number | null) => x === null ? "—" : x.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
const L = [["intention", 30], ["termes", 7], ["clics", 7], ["coût", 9], ["conv.", 6], ["taux", 7], ["CPA", 8]] as const
const ligne = (cells: string[]) => cells.map((c, i) => i === 0 ? c.padEnd(L[i][1]) : c.padStart(L[i][1])).join("  ")
console.log("\n" + ligne(L.map(([h]) => h)))
console.log("-".repeat(L.reduce((n, [, w]) => n + w + 2, -2)))
for (const g of intents.groupes) {
  console.log(ligne([g.libelle, String(g.stats.termes), fr(g.stats.clics), eur(g.stats.cout), fr(g.stats.conversions), pc(g.stats.tauxConv), eur(g.stats.cpa)]))
  console.log("  " + g.termes.slice(0, 3).map((x) => `« ${x} »`).join(" · ") + (g.termes.length > 3 ? ` … +${g.termes.length - 3}` : ""))
}
console.log(`\nmots-clés reliés : ${Object.keys(intents.motsCles).length} · groupes d'annonces : ${Object.keys(intents.groupesAnnonces).length} · à revoir : ${intents.aRevoir.length}`)
for (const n of intents.notes) console.log(`· ${n}`)
console.log(`\nSuffixe d'URL finale à coller dans Google Ads :\n  ${SUFFIXE_URL_FINALE}`)
step(SCOPE, `écrit dans ${dir}`)
