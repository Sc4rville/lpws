import type { Ciblage, RouteMotCle } from "./ciblage.ts"

export const normaliserMotCle = (s: string): string =>
  s.normalize("NFKC").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim().replace(/^\[(.*)\]$/, "$1").replace(/^"(.*)"$/, "$1").trim()

export function routesSeCroisent(a: RouteMotCle, b: RouteMotCle): boolean {
  return normaliserMotCle(a.motCle) === normaliserMotCle(b.motCle)
    && (!a.campagneId || !b.campagneId || a.campagneId === b.campagneId)
    && (!a.groupeId || !b.groupeId || a.groupeId === b.groupeId)
}

export function ciblagesSeCroisent(a?: Ciblage, b?: Ciblage): boolean {
  return !a || !b || a.routes.some((x) => b.routes.some((y) => routesSeCroisent(x, y)))
}

export function correspondAuClic(ciblage: Ciblage, params: URLSearchParams): boolean {
  const motCle = normaliserMotCle(params.get("lpws_kw") ?? "")
  const type = params.get("lpws_mt") ?? ""
  const reseau = params.get("lpws_net") ?? ""
  if (!motCle || /[{}]/.test(motCle) || type === "a" || (type && !["e", "p", "b"].includes(type))) return false
  if (reseau && !["g", "s"].includes(reseau)) return false
  return ciblage.routes.some((r) => normaliserMotCle(r.motCle) === motCle
    && (!r.campagneId || r.campagneId === params.get("lpws_cp"))
    && (!r.groupeId || r.groupeId === params.get("lpws_ag")))
}

type VarianteCiblee = { nom: string; part: number; page: string; ciblage?: Ciblage; experience?: string }
type Choix<T> = {
  variante: T | null
  intention: string
  experience: string
  motif: string
  apercu: boolean
}

function memePage(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b)
    return x.origin === y.origin && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "")
  } catch { return false }
}

function fraction(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

export function choisirPourClic<T extends VarianteCiblee>(
  config: { actif: boolean; variantes: T[] }, url: string, identite: string,
): Choix<T> {
  const vide: Choix<T> = { variante: null, intention: "inconnue", experience: "", motif: "aucun ciblage", apercu: false }
  let params: URLSearchParams
  try { params = new URL(url).searchParams } catch { return { ...vide, motif: "URL invalide" } }
  const force = params.get("lpws")
  const surPage = config.variantes.filter((v) => memePage(v.page, url))
  if (!surPage.length) return { ...vide, motif: "page hors test", apercu: !!force }
  if (!config.actif || force === "off") return { ...vide, motif: "désactivé", apercu: !!force }
  if (force) {
    const v = surPage.find((x) => x.nom === force)
    return { ...vide, variante: v ?? null, intention: v?.ciblage?.intention ?? "generale", motif: "aperçu hors mesure", apercu: true }
  }
  const eligibles = surPage.filter((v) => Number.isFinite(v.part) && v.part > 0 && v.part <= 100
    && (!v.ciblage || correspondAuClic(v.ciblage, params)))
  if (eligibles.length !== 1) return { ...vide, motif: eligibles.length ? "ciblages concurrents : original conservé" : "aucun test éligible" }
  const v = eligibles[0]
  const sert = fraction((v.experience || v.nom) + ":" + identite) * 100 < v.part
  return {
    variante: sert ? v : null, intention: v.ciblage?.intention ?? "generale",
    experience: v.experience ?? "", motif: sert ? "variante" : "témoin du même ciblage", apercu: false,
  }
}
