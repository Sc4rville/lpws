/**
 * delta.ts — le delta d'une variante, section par section : ce qui a bougé l'a-t-il été exprès ?
 *
 * Même découpage que le juge du clone (bandesDuRendu + diffParSection), appliqué à variante vs
 * baseline. Une section changée qui ne contient aucune édition est un DÉBORDEMENT : la variante
 * teste autre chose que son hypothèse (une police qui saute, un carrousel qui repart, un bloc
 * composé qui écrase le suivant). Un simple décalage sous une édition n'en est pas un : le
 * recalage l'absorbe.
 */
import { diffParSection, type Bande } from "../clone/5_verify/diff.ts"
import { SEUIL_SECTION } from "../clone/5_verify/verify.ts"

export type DeltaSections = {
  /** sections de la variante qui diffèrent de la baseline, la pire d'abord */
  changees: Array<{ anchor: string; titre: string; ratio: number }>
  /** sections qui contiennent une édition (ou sont l'édition) */
  touchees: string[]
  /** changées sans avoir été touchées : ce que la variante n'avait pas le droit de changer */
  debordements: string[]
}

/** Dans la page rendue : les bandes qui contiennent (ou sont contenues par) un élément édité. */
export function bandesTouchees(arg: { bandes: string[]; ancres: string[] }): string[] {
  const el = (a: string) => document.querySelector(`[data-lpws="${a}"]`)
  const cibles = arg.ancres.map(el).filter((e): e is Element => e !== null)
  return arg.bandes.filter((b) => {
    const bande = el(b)
    return !!bande && cibles.some((c) => bande.contains(c) || c.contains(bande))
  })
}

export async function deltaParSection(
  reference: string, variante: string, bandes: Bande[], touchees: string[], seuil = SEUIL_SECTION,
): Promise<DeltaSections> {
  const s = await diffParSection(reference, variante, bandes, seuil)
  const changees = s.sections.filter((x) => !x.fidele).sort((a, b) => b.ratio - a.ratio)
    .map(({ anchor, titre, ratio }) => ({ anchor, titre, ratio }))
  const t = new Set(touchees)
  return { changees, touchees, debordements: changees.filter((c) => !t.has(c.anchor)).map((c) => c.anchor) }
}
