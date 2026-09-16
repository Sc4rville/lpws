/**
 * server.ts — le serveur de la visionneuse (cockpit local).
 *
 * Zéro dépendance (node:http). Trois routes :
 *   GET /                 l'interface (app.html)
 *   GET /api/baselines    scan de clients/<client>/<campagne>/ → JSON
 *                         (le front poll cette route : les nouvelles captures apparaissent seules)
 *   GET /files/<chemin>   sert clients/ en statique (screenshots, capture.html, variantes)
 *
 * Servir capture.html en http:// (plutôt que file://) a un bonus : certaines fonts CDN
 * qui refusent l'origine "null" se chargent ici.
 *
 * Une baseline sans meta.json (acquisition ok mais jugement raté/interrompu) est listée
 * quand même, marquée non jugée — le cockpit montre l'état réel, pas l'état espéré.
 *
 * Usage : npm run viewer   →   http://localhost:4600
 */
import { createServer } from "node:http"
import { readFile, readdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, normalize, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { CLIENTS_ROOT } from "../shared/paths.ts"
import { step } from "../shared/log.ts"

const SCOPE = "viewer"
const PORT = 4600
const UI = join(dirname(fileURLToPath(import.meta.url)), "app.html")

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

type Item = {
  path: string            // "corpus/products-marketing" (relatif à clients/)
  client: string
  campaign: string
  source?: string
  capturedAt?: string
  judged: boolean         // false = capture présente mais pas de meta.json (non jugée)
  fidele?: boolean
  diff?: { desktop: number; mobile: number }
  marked?: number
  honnetete?: string[]
  variants: string[]
}

async function scan(): Promise<Item[]> {
  const items: Item[] = []
  if (!existsSync(CLIENTS_ROOT)) return items
  for (const client of await readdir(CLIENTS_ROOT)) {
    const cdir = join(CLIENTS_ROOT, client)
    if (!(await stat(cdir)).isDirectory()) continue
    for (const campaign of await readdir(cdir)) {
      const base = join(cdir, campaign, "baseline")
      if (!existsSync(join(base, "capture.html"))) continue
      const item: Item = { path: `${client}/${campaign}`, client, campaign, judged: false, variants: [] }
      try {
        const meta = JSON.parse(await readFile(join(base, "meta.json"), "utf8"))
        Object.assign(item, {
          source: meta.source, capturedAt: meta.capturedAt, judged: true,
          fidele: meta.fidele, diff: meta.diff, marked: meta.marked, honnetete: meta.honnetete,
        })
      } catch { /* pas de meta → non jugée, listée quand même */ }
      const vdir = join(cdir, campaign, "variants")
      if (existsSync(vdir))
        item.variants = (await readdir(vdir)).filter((v) => existsSync(join(vdir, v)))
      items.push(item)
    }
  }
  // plus récent en premier
  return items.sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""))
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": MIME[".html"] })
      res.end(await readFile(UI))
    } else if (url.pathname === "/api/baselines") {
      res.writeHead(200, { "content-type": MIME[".json"] })
      res.end(JSON.stringify(await scan()))
    } else if (url.pathname.startsWith("/files/")) {
      // anti-traversée : on normalise et on reste sous clients/
      const rel = normalize(decodeURIComponent(url.pathname.slice("/files/".length)))
      if (rel.startsWith("..")) { res.writeHead(403); res.end(); return }
      const file = join(CLIENTS_ROOT, rel)
      if (!existsSync(file)) { res.writeHead(404); res.end("introuvable : " + rel); return }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" })
      res.end(await readFile(file))
    } else {
      res.writeHead(404); res.end()
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e))
  }
}).listen(PORT, "127.0.0.1", () => {
  step(SCOPE, `cockpit ouvert → http://localhost:${PORT}`)
})
