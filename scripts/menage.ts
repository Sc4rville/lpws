/**
 * menage.ts — le garde-fou de rangement (npm run menage, tourne en CI).
 *
 * Échoue, en disant quoi et où, si le repo se met à traîner :
 *   1. racine : seuls les fichiers et dossiers attendus (le reste va dans docs/, engine/, ui/…) ;
 *   2. noms : kebab-case (étapes numérotées `1_acquire` admises, CLAUDE.md / SKILL.md aussi) ;
 *   3. liens : chaque lien relatif d'un .md pointe vers un fichier qui existe ;
 *   4. session.md reste court (≤ 80 lignes) : il se réécrit, il n'accumule pas.
 * Le code mort (fichiers, exports, dépendances) est traqué à part par knip (`npm run menage`).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const RACINE = new Set([".claude", ".github", ".gitignore", "CLAUDE.md", "clients", "docs", "engine", "package.json",
  "package-lock.json", "readme.md", "scripts", "session.md", "tsconfig.json", "ui"])
const NOMS_LIBRES = new Set(["CLAUDE.md", "SKILL.md"])
const NOM = /^(\d+_)?[a-z0-9]+([.-][a-z0-9]+)*$/
const SESSION_MAX = 80

const fichiers = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => f && existsSync(join(ROOT, f)))
const fautes: string[] = []

for (const racine of new Set(fichiers.map((f) => f.split("/")[0])))
  if (!RACINE.has(racine)) fautes.push(`racine : « ${racine} » traîne — le ranger (docs/, engine/, ui/…) ou le supprimer`)

for (const f of fichiers)
  for (const part of f.split("/"))
    if (!part.startsWith(".") && !NOMS_LIBRES.has(part) && !NOM.test(part)) fautes.push(`nom : ${f} (« ${part} » n'est pas en kebab-case)`)

const LIEN = /\]\(([^)\s]+)\)/g
for (const f of fichiers.filter((f) => f.endsWith(".md"))) {
  const texte = readFileSync(join(ROOT, f), "utf8").replace(/```[\s\S]*?```/g, "")
  for (const [, cible] of texte.matchAll(LIEN)) {
    if (/^[a-z]+:/i.test(cible) || cible.startsWith("#")) continue
    const chemin = decodeURIComponent(cible.split("#")[0])
    if (!existsSync(join(ROOT, dirname(f), chemin))) fautes.push(`lien : ${f} → ${cible} (introuvable)`)
  }
}

const session = readFileSync(join(ROOT, "session.md"), "utf8").split("\n").length
if (session > SESSION_MAX) fautes.push(`session.md : ${session} lignes (max ${SESSION_MAX}) — le réécrire, l'historique est dans git log`)

if (fautes.length) {
  console.error(`${basename(import.meta.filename)} : ${fautes.length} chose(s) traîne(nt)\n` + fautes.map((x) => `  - ${x}`).join("\n"))
  process.exit(1)
}
console.log(`ménage : ${fichiers.length} fichiers, racine, noms, liens et session.md en ordre`)
