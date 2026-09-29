import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PNG } from "pngjs"
import { deltaParSection } from "./delta.ts"

const W = 320
const bruit = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
function page(graines: number[], h = 300): PNG {
  const img = new PNG({ width: W, height: graines.length * h })
  graines.forEach((g, k) => {
    for (let y = 0; y < h; y++) {
      const v = bruit(y + 1000 * g) * 255
      for (let x = 0; x < W; x++) {
        const i = ((k * h + y) * W + x) * 4
        img.data[i] = v; img.data[i + 1] = (v * g) % 255; img.data[i + 2] = x < W / 2 ? 40 : 200; img.data[i + 3] = 255
      }
    }
  })
  return img
}
const bandes = (n: number, h = 300) => Array.from({ length: n }, (_, i) => ({ anchor: `s${i + 1}`, y: i * h, h, titre: `section ${i + 1}` }))

test("deltaParSection : une section changée sans édition est un débordement, l'éditée non", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-delta-"))
  const base = join(dir, "base.png"), vari = join(dir, "variante.png")
  await writeFile(base, PNG.sync.write(page([1, 2, 3, 4])))
  // s2 éditée (voulu), s4 changée aussi (pas voulu)
  await writeFile(vari, PNG.sync.write(page([1, 8, 3, 9])))
  const d = await deltaParSection(base, vari, bandes(4), ["s2"])
  assert.deepEqual(d.changees.map((c) => c.anchor).sort(), ["s2", "s4"])
  assert.deepEqual(d.debordements, ["s4"])
  await rm(dir, { recursive: true })
})

test("deltaParSection : une variante qui ne touche que sa section est propre", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-delta-"))
  const base = join(dir, "base.png"), vari = join(dir, "variante.png")
  await writeFile(base, PNG.sync.write(page([1, 2, 3])))
  await writeFile(vari, PNG.sync.write(page([1, 5, 3])))
  const d = await deltaParSection(base, vari, bandes(3), ["s2"])
  assert.deepEqual(d.changees.map((c) => c.anchor), ["s2"])
  assert.deepEqual(d.debordements, [])
  await rm(dir, { recursive: true })
})

test("deltaParSection : une section copiée plus haute que la marge ne fait pas déborder les suivantes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-delta-"))
  const base = join(dir, "base.png"), vari = join(dir, "variante.png")
  await writeFile(base, PNG.sync.write(page([1, 2, 3, 4], 700)))
  await writeFile(vari, PNG.sync.write(page([1, 2, 2, 3, 4], 700)))
  const b = bandes(5, 700).map((x, i) => ({ ...x, anchor: ["s1", "s2", "s2-copie0", "s3", "s4"][i] }))
  const d = await deltaParSection(base, vari, b, ["s2-copie0"])
  assert.deepEqual(d.debordements, [])
  await rm(dir, { recursive: true })
})
