import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { relier } from "../clone/1_acquire/relink.ts"
import type { Empreinte } from "../clone/1_acquire/fingerprint.ts"
import { archiverCapture, capturesArchivees } from "../clone/captures.ts"
import { traduire } from "./rejouer.ts"
import type { VariantSpec } from "./spec.ts"

const emp = (a: string, role: Empreinte["role"], text: string, rang: number): Empreinte =>
  ({ a, tag: role === "heading" ? "h1" : role === "link" ? "a" : "p", role, text, cls: [role], path: "body>main>section", sect: "s1", rang, cible: "" })

// hier : titre, bouton, paragraphe, deux cartes muettes identiques
const avant = [emp("e1", "heading", "le crm n°1", 0), emp("e2", "link", "essai gratuit", 0), emp("e3", "text", "des milliers d'équipes nous font confiance", 0)]
// aujourd'hui : une bannière en tête décale tout d'un cran
const apres = [emp("e1", "text", "nouveau : rapport annuel disponible", 0), emp("e2", "heading", "le crm n°1", 0), emp("e3", "link", "essai gratuit", 0), emp("e4", "text", "des milliers d'équipes nous font confiance", 1)]

const spec = (edits: VariantSpec["edits"]): VariantSpec => ({
  nom: "v", hypothese: "h", metrique: "m", risque: "r",
  diagnostic: { regle: "r", signal: "s", priorite: "HIGH", confiance: "Medium", preuve: "p" }, edits,
} as VariantSpec)

test("rejouer : chaque ancre est traduite par le re-liage, copies de duplicate comprises", () => {
  const s = spec([
    { op: "set", anchor: "e1", text: "Le CRM des PME", attendu: { role: "heading", text: "le crm n°1" } },
    { op: "duplicate", anchor: "e2", as: "b", after: "e3" },
    { op: "set", anchor: "e2-b", text: "Voir la démo" },
  ] as VariantSpec["edits"])
  const r = traduire(s, relier(avant, apres), apres)
  assert.deepEqual(r.refus, [])
  assert.deepEqual(r.spec.edits.map((e) => [e.anchor, e.after]), [["e2", undefined], ["e3", "e4"], ["e3-b", undefined]])
  assert.deepEqual(r.spec.edits[0].attendu, { role: "heading", text: "le crm n°1" })
})

test("rejouer : une ancre perdue refuse toute la spec, jamais devinée", () => {
  const sans = apres.filter((e) => e.role !== "heading")
  const r = traduire(spec([{ op: "set", anchor: "e1", text: "x" }] as VariantSpec["edits"]), relier(avant, sans), sans)
  assert.equal(r.refus.length, 1)
  assert.match(r.refus[0], /^e1 : perdue/)
})

test("captures : l'identité de la capture sortante est archivée, la plus récente d'abord", async () => {
  const racine = await mkdtemp(join(tmpdir(), "lpws-cap-"))
  const b = join(racine, "acme", "search", "baseline")
  await mkdir(b, { recursive: true })
  assert.equal(await archiverCapture(b), null, "première capture : rien à archiver")
  for (const d of ["2026-09-01T00:00:00.000Z", "2026-09-20T00:00:00.000Z"]) {
    await writeFile(join(b, "anchors.json"), JSON.stringify([{ a: d }]))
    await writeFile(join(b, "meta.json"), JSON.stringify({ capturedAt: d }))
    await archiverCapture(b)
  }
  const [recente, ancienne] = await capturesArchivees(b)
  assert.match(recente, /2026-09-20/)
  assert.match(ancienne, /2026-09-01/)
  assert.equal(JSON.parse(await readFile(join(ancienne, "anchors.json"), "utf8"))[0].a, "2026-09-01T00:00:00.000Z")
  await rm(racine, { recursive: true })
})
