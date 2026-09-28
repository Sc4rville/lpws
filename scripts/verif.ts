/**
 * verif.ts — la CI, en local (npm run verif) : les mêmes étapes que .github/workflows/ci.yml.
 *
 * lockfile synchrone · typecheck · menage · tests · build de l'interface · clone des deux pages de démo (fidèles).
 * Les clones se font dans un dossier temporaire : clients/ n'est jamais touché.
 * S'arrête à la première étape en échec, en la nommant ; code de sortie ≠ 0.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join, normalize, resolve, sep } from "node:path"
import { mimeDe } from "../engine/shared/mime.ts"

const ROOT = resolve(import.meta.dirname, "..")
const UI = join(ROOT, "ui")
const debut = Date.now()

// asynchrone : le serveur de la démo doit pouvoir répondre pendant que le clone tourne
async function etape(nom: string, cmd: string, args: string[], cwd = ROOT): Promise<string> {
  process.stdout.write(`\n▶ ${nom}\n`)
  const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
  let sortie = ""
  p.stdout.on("data", (b: Buffer) => { sortie += b; process.stdout.write(b) })
  const code = await new Promise<number | null>((ok) => p.on("close", ok))
  if (code !== 0) throw new Error(`« ${nom} » a échoué (code ${code})`)
  return sortie
}

/** la démo servie par un node:http interne ; les clones écrivent dans un bac jetable */
async function clones() {
  const serveur = createServer((req, res) => {
    const chemin = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname))
    let f = join(UI, chemin)
    if (f !== UI && !f.startsWith(UI + sep)) return void res.writeHead(403).end()
    if (f.endsWith("/")) f = join(f, "index.html")
    try {
      const corps = readFileSync(f)
      res.writeHead(200, { "content-type": mimeDe(f) }).end(corps)
    } catch {
      res.writeHead(404).end()
    }
  })
  const bac = mkdtempSync(join(tmpdir(), "lpws-verif-"))
  try {
    await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok))
    const port = (serveur.address() as AddressInfo).port
    for (const [page, client] of [["demo/", "relay"], ["demo/boutique/", "halden"]]) {
      // le tsx du dépôt, en chemin absolu : depuis le bac, npx irait le chercher sur le registre
      const sortie = await etape(`clone de ${page} (fidèle)`, join(ROOT, "node_modules/.bin/tsx"),
        [join(ROOT, "engine/clone/run.ts"), `http://127.0.0.1:${port}/${page}`, "--client", client, "--campaign", "demo"], bac)
      const verdict = JSON.parse(sortie.slice(sortie.lastIndexOf("\n{") + 1)) as { fidele?: boolean }
      if (!verdict.fidele) throw new Error(`le clone de ${page} n'est pas fidèle`)
    }
  } finally {
    serveur.close()
    rmSync(bac, { recursive: true, force: true })
  }
}

try {
  await etape("lockfile (npm ci en dry-run)", "npm", ["ci", "--dry-run", "--ignore-scripts", "--silent"])
  await etape("typecheck", "npm", ["run", "-s", "typecheck"])
  await etape("menage", "npm", ["run", "-s", "menage"])
  await etape("tests", "npm", ["test", "--silent"])
  await etape("interface", "npm", ["run", "-s", "ui"])
  await clones()
  console.log(`\n✓ verif : tout passe (${Math.round((Date.now() - debut) / 1000)} s)`)
} catch (e) {
  console.error(`\n✗ verif : ${(e as Error).message}`)
  process.exitCode = 1
}
