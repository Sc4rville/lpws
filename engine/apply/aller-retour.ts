/**
 * aller-retour.ts — la preuve que la mécanique est neutre : zéro édition → pixel identique.
 *
 *   capture.html → apply (aucune édition) → variant.html → re-rendu → diff vs capture.html re-rendue
 *
 * Le témoin est la capture elle-même, rendue au même moment : clone.png date de la vérification,
 * et une page animée (Monday) ne se rend jamais deux fois pareil. Comparer à clone.png mettrait
 * ce bruit sur le compte de la mécanique ; il est rapporté à part (`bruit`).
 *
 * Si ce diff n'est pas nul, TOUTE variante porte un bruit qui ne vient pas de son hypothèse :
 * la resérialisation (page.content, recopie des racines d'ombre) a changé la page, et le delta
 * d'une variante mesure ce bruit en plus de ce qu'elle teste.
 *
 * Usage : npm run aller-retour -- <dossier-baseline> [--seuil 0.001]
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyEdits } from "./apply.ts"
import { shoot } from "./run.ts"
import { diffParSection, visualDiff } from "../clone/5_verify/diff.ts"
import { SEUIL_SECTION } from "../clone/5_verify/verify.ts"
import { DESKTOP, MOBILE } from "../clone/1_acquire/render.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { step, fail } from "../shared/log.ts"

const SCOPE = "apply/aller-retour"
/** le bruit de rendu d'un même HTML rendu deux fois ; au-delà, la mécanique a touché la page */
export const SEUIL_ALLER_RETOUR = 0.001

export type AllerRetour = {
  neutre: boolean
  seuil: number
  vues: Record<"desktop" | "mobile", {
    /** variante vide vs témoin : ce que la mécanique a changé */
    ratio: number; heightDelta: number; sectionsChangees: string[]
    /** témoin vs clone.png : ce que la page change d'elle-même d'un rendu à l'autre */
    bruit: number | null
  } | null>
}

export async function allerRetour(baseline: string, seuil = SEUIL_ALLER_RETOUR): Promise<AllerRetour> {
  if (!existsSync(join(baseline, "capture.html"))) fail(SCOPE, `${baseline}/capture.html introuvable`)
  const dir = await mkdtemp(join(tmpdir(), "lpws-aller-retour-"))
  try {
    await applyEdits(baseline, dir, [])
    const vues: AllerRetour["vues"] = { desktop: null, mobile: null }
    for (const [vue, source, fichier, viewport, ref] of [
      ["desktop", "capture.html", "variant.html", DESKTOP, "clone.png"],
      ["mobile", "capture.mobile.html", "variant.mobile.html", MOBILE, "clone.mobile.png"],
    ] as const) {
      if (!existsSync(join(dir, fichier))) continue
      const shot = join(dir, `${vue}.png`), temoin = join(dir, `temoin.${vue}.png`)
      await shoot(baseline, baseline, source, viewport, temoin)
      const { bandes } = await shoot(dir, baseline, fichier, viewport, shot)
      const d = await visualDiff(temoin, shot, join(dir, `diff.${vue}.png`))
      const s = await diffParSection(temoin, shot, bandes, SEUIL_SECTION)
      const bruit = existsSync(join(baseline, ref))
        ? (await visualDiff(join(baseline, ref), temoin, join(dir, `bruit.${vue}.png`))).ratio : null
      vues[vue] = { ratio: d.ratio, heightDelta: d.heightDelta, sectionsChangees: s.sections.filter((x) => !x.fidele).map((x) => x.anchor), bruit }
      step(SCOPE, `${vue} : ${(d.ratio * 100).toFixed(3)}% · Δhauteur ${d.heightDelta}px` +
        (vues[vue]!.sectionsChangees.length ? ` · sections changées : ${vues[vue]!.sectionsChangees.join(", ")}` : "") +
        (bruit !== null ? ` · bruit de la page ${(bruit * 100).toFixed(3)}%` : ""))
    }
    const jugees = Object.values(vues).filter((v) => v !== null)
    return { neutre: jugees.length > 0 && jugees.every((v) => v.ratio <= seuil && v.heightDelta === 0), seuil, vues }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/* CLI */
if (estLance(import.meta.url)) {
  const args = lireArgs()
  const [baseline] = args.libres
  if (!baseline) fail(SCOPE, "usage : npm run aller-retour -- <dossier-baseline> [--seuil 0.001]")
  const seuil = args.option("--seuil") ? Number(args.option("--seuil")) : SEUIL_ALLER_RETOUR
  allerRetour(baseline, seuil).then(async (r) => {
    await writeFile(join(baseline, "aller-retour.json"), JSON.stringify(r, null, 2))
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.neutre ? 0 : 1)
  }).catch((e) => fail(SCOPE, String(e?.message ?? e)))
}
