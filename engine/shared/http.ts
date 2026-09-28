/**
 * http.ts — les briques des deux serveurs locaux (ui/server.ts, engine/viewer/server.ts).
 */
import type { ServerResponse } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { join, normalize, isAbsolute } from "node:path"
import { mimeDe } from "./mime.ts"

export function envoyerJson(res: ServerResponse, code: number, v: unknown): void {
  res.writeHead(code, { "content-type": mimeDe(".json") })
  res.end(JSON.stringify(v))
}

/**
 * Sert `racine/rel`, sans jamais sortir de `racine` (anti-traversée). 403 hors racine,
 * 404 si absent ou dossier.
 */
export async function envoyerFichier(
  res: ServerResponse, racine: string, rel: string, entetes: Record<string, string> = {},
): Promise<void> {
  const propre = normalize(rel).replace(/^([/\\])+/, "")
  if (propre.startsWith("..") || isAbsolute(propre)) { res.writeHead(403); res.end(); return }
  const f = join(racine, propre)
  const s = await stat(f).catch(() => null)
  if (!s || s.isDirectory()) { res.writeHead(404); res.end("introuvable"); return }
  res.writeHead(200, { "content-type": mimeDe(f), ...entetes })
  res.end(await readFile(f))
}
