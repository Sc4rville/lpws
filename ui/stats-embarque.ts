/**
 * stats-embarque.ts — engine/measure/stats.ts, compilé pour le navigateur.
 *
 * L'interface rend le même verdict que le serveur (archive, mémoire) parce qu'elle exécute le
 * même code : stats.ts est empaqueté en IIFE (global `STATS`) et injecté à la place du
 * marqueur `/*STATS*​/` de ui/index.html, par le serveur comme par le build statique.
 */
import { build } from "esbuild"
import { join, resolve } from "node:path"

const SRC = join(resolve(import.meta.dirname, ".."), "engine", "measure", "stats.ts")
const MARQUEUR = "/*STATS*/"
let cache: Promise<string> | null = null

export function statsNavigateur(): Promise<string> {
  cache ??= build({ entryPoints: [SRC], bundle: true, format: "iife", globalName: "STATS", write: false, target: "es2020", minify: true })
    .then((r) => r.outputFiles[0].text.replaceAll("</script", "<\\/script"))
  return cache
}

export async function pageAvecStats(html: string): Promise<string> {
  if (!html.includes(MARQUEUR)) throw new Error("ui/index.html : marqueur /*STATS*/ absent")
  const js = await statsNavigateur()
  return html.replace(MARQUEUR, () => js)
}
