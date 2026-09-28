import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PNG } from "pngjs"
import { diffParSection, visualDiff, type Bande } from "./diff.ts"

const W = 320
/** une page faite de bandes ; chaque ligne a sa teinte (texture verticale non périodique) pour que le recalage ait prise */
const bruit = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
function page(bandes: Array<{ h: number; graine: number }>): PNG {
  const H = bandes.reduce((t, b) => t + b.h, 0)
  const img = new PNG({ width: W, height: H })
  let y0 = 0
  for (const b of bandes) {
    for (let y = 0; y < b.h; y++) {
      const v = bruit(y + 1000 * b.graine) * 255
      for (let x = 0; x < W; x++) {
        const i = ((y0 + y) * W + x) * 4
        img.data[i] = v; img.data[i + 1] = (v * b.graine) % 255; img.data[i + 2] = x < W / 2 ? 40 : 200; img.data[i + 3] = 255
      }
    }
    y0 += b.h
  }
  return img
}

const bandesDe = (hs: number[]): Bande[] => {
  let y = 0
  return hs.map((h, i) => { const b = { anchor: `s${i + 1}`, y, h, titre: `section ${i + 1}` }; y += h; return b })
}

test("diffParSection : un décalage n'est pas une casse, une section changée l'est", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-diff-"))
  const live = join(dir, "live.png"), clone = join(dir, "clone.png")
  await writeFile(live, PNG.sync.write(page([{ h: 300, graine: 1 }, { h: 400, graine: 2 }, { h: 500, graine: 3 }, { h: 300, graine: 4 }])))
  // le clone : s1 plus haute de 40 px (titre sur une ligne de plus), s3 différente
  await writeFile(clone, PNG.sync.write(page([{ h: 340, graine: 1 }, { h: 400, graine: 2 }, { h: 500, graine: 7 }, { h: 300, graine: 4 }])))

  const entiere = await visualDiff(live, clone, join(dir, "diff.png"))
  assert.ok(entiere.ratio > 0.5, `page entière : tout paraît cassé (${entiere.ratio})`)

  const r = await diffParSection(live, clone, bandesDe([340, 400, 500, 300]), 0.03)
  const [s1, s2, s3, s4] = r.sections
  assert.equal(s2.decalage, -40)
  assert.ok(s2.fidele && s4.fidele, JSON.stringify(r.sections.map((s) => [s.anchor, s.decalage, s.ratio])))
  assert.ok(!s3.fidele, "la section vraiment changée est désignée")
  assert.ok(s1.ratio < 0.2, `s1 : seuls les 40 px en trop diffèrent (${s1.ratio}, ${s1.decalage})`)
  assert.deepEqual(r.nonJugees, [])
  await rm(dir, { recursive: true })
})

test("diffParSection : un motif répétitif ne fait pas glisser la bande", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-diff-"))
  const img = new PNG({ width: W, height: 900 })
  for (let y = 0; y < 900; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, v = y % 13 < 6 ? 30 : 220
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255
  }
  const f = join(dir, "grille.png")
  await writeFile(f, PNG.sync.write(img))
  const r = await diffParSection(f, f, [{ anchor: "s1", y: 0, h: 450, titre: "" }, { anchor: "s2", y: 450, h: 450, titre: "" }], 0.03)
  assert.deepEqual(r.sections.map((s) => s.decalage), [0, 0])
  assert.equal(r.ratioAligne, 0)
  await rm(dir, { recursive: true })
})

test("diffParSection : une section hors de la preuve n'est pas jugée", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lpws-diff-"))
  const img = join(dir, "a.png")
  await writeFile(img, PNG.sync.write(page([{ h: 300, graine: 1 }])))
  const r = await diffParSection(img, img, [{ anchor: "s1", y: 0, h: 300, titre: "" }, { anchor: "s2", y: 400, h: 200, titre: "" }], 0.03)
  assert.equal(r.sections[0].ratio, 0)
  assert.deepEqual(r.nonJugees, ["s2"])
  await rm(dir, { recursive: true })
})
