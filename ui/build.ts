/**
 * build.ts — assemble ui/dist/index.html à partir de ui/index.html.
 *
 * L'interface embarque des captures d'écran (page d'origine, variantes) pour que le media
 * buyer voie ce qu'il teste. Ces captures vivent dans clients/, qui n'est jamais commité :
 * elles sont donc lues ICI, au build, réduites en JPEG et injectées à la place du marqueur
 * `/*THUMBS*​/` sous la forme d'une table `IMG` :
 *   IMG["atlassian"]        capture de la page d'origine (baseline/clone.png)
 *   IMG["v:message-match"]  rendu d'une variante (variants/<nom>/variant.png)
 *
 * La réduction se fait dans Chromium (canvas → JPEG), pour ne dépendre d'aucune lib image.
 *
 * Usage : npm run ui            → ui/dist/index.html
 *         npm run ui:deploy     → build puis `vercel deploy --prod` depuis ui/dist
 */
import { chromium } from "playwright"
import { readFile, writeFile, mkdir, readdir, stat, cp } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve, basename, dirname } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const SRC = join(ROOT, "ui", "index.html")
const OUT = join(ROOT, "ui", "dist", "index.html")
const CLIENTS = join(ROOT, "clients")
const WIDTH = 560, MAX_H = 9000, QUALITY = 0.5

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  if (!existsSync(dir)) return out
  for (const e of await readdir(dir)) {
    const p = join(dir, e)
    if ((await stat(p)).isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/** clé d'une capture : le client pour une baseline, `v:<nom>` pour une variante */
function keyOf(p: string): string | null {
  const parts = p.split("/")
  if (basename(p) === "clone.png" && parts.at(-2) === "baseline") return parts.at(-4)!
  if (basename(p) === "variant.png" && parts.at(-3) === "variants") return "v:" + parts.at(-2)!
  return null
}

const files = (await walk(CLIENTS)).map((p) => [keyOf(p), p] as const).filter(([k]) => k)
const html = await readFile(SRC, "utf8")
if (!html.includes("/*THUMBS*/")) throw new Error("ui/index.html : marqueur /*THUMBS*/ absent")

const browser = await chromium.launch()
const page = await browser.newPage()
const img: Record<string, string> = {}
let total = 0
for (const [key, p] of files) {
  const src = `data:image/png;base64,${(await readFile(p)).toString("base64")}`
  const jpeg: string = await page.evaluate(async ({ src, W, maxH, q }) => {
    const im = new Image(); im.src = src; await im.decode()
    const h = Math.min(im.naturalHeight, maxH)
    const c = document.createElement("canvas")
    c.width = W; c.height = Math.round(h * W / im.naturalWidth)
    c.getContext("2d")!.drawImage(im, 0, 0, im.naturalWidth, h, 0, 0, c.width, c.height)
    return c.toDataURL("image/jpeg", q)
  }, { src, W: WIDTH, maxH: MAX_H, q: QUALITY })
  img[key!] = jpeg; total += jpeg.length
  console.log(`  ${key!.padEnd(28)} ${Math.round(jpeg.length / 1024)} Ko`)
}
await browser.close()

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, html.replace("/*THUMBS*/", `const IMG = ${JSON.stringify(img)};`))
// les visuels de l'interface (fond flouté, illustration tramée) partent avec la page
await cp(join(ROOT, "ui", "assets"), join(dirname(OUT), "assets"), { recursive: true })
console.log(`ui/dist/index.html — ${files.length} captures, ${Math.round(total / 1024)} Ko d'images`)
