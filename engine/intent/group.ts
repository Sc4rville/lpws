/**
 * group.ts — des termes classés → des groupes d'intention avec leurs chiffres, et le pont
 * mot-clé → intention.
 *
 * Le pont est un vote : un mot-clé acheté a déclenché plusieurs termes, chacun classé ; on
 * lui donne l'intention qui a reçu le plus de CLICS (pas le plus de termes — dix requêtes à
 * un clic pèsent moins qu'une à cent). Même chose par groupe d'annonces, plus grossier mais
 * toujours disponible au clic.
 *
 * Les taux ne sont calculés que quand il y a de quoi : pas de conversions → cpa null, pas de
 * clics → taux null. Un zéro par défaut serait une conclusion, pas une absence.
 */
import { Intents, LIBELLES, INTENTIONS, type Classement, type Intention, type Termes } from "./schema.ts"

type Votes = Map<string, Map<Intention, number>>
const voter = (v: Votes, cle: string | undefined, intention: Intention, poids: number) => {
  if (!cle) return
  const m = v.get(cle) ?? new Map<Intention, number>()
  m.set(intention, (m.get(intention) ?? 0) + poids)
  v.set(cle, m)
}
const gagnant = (m: Map<Intention, number>): Intention => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]

export function grouper(
  t: Termes, classes: Classement[], meta: { client: string; campagne: string; methode: "heuristique" | "skill" },
): Intents {
  const parTerme = new Map(classes.map((c) => [c.terme, c]))
  const acc = new Map<Intention, { termes: typeof t.termes; motsCles: Set<string>; groupes: Set<string> }>()
  for (const i of INTENTIONS) acc.set(i, { termes: [], motsCles: new Set(), groupes: new Set() })
  const vMots: Votes = new Map(), vGroupes: Votes = new Map()

  for (const x of t.termes) {
    const c = parTerme.get(x.terme)
    if (!c) throw new Error(`terme non classé : « ${x.terme} »`)
    const a = acc.get(c.intention)!
    a.termes.push(x)
    if (x.motCle) a.motsCles.add(x.motCle)
    if (x.groupeAnnonces) a.groupes.add(x.groupeAnnonces)
    // poids = clics, avec un plancher à 1 : un terme sans clic compte quand même un peu
    voter(vMots, x.motCle, c.intention, Math.max(x.clics, 1))
    voter(vGroupes, x.groupeAnnonces, c.intention, Math.max(x.clics, 1))
  }

  const groupes = INTENTIONS.map((intention) => {
    const a = acc.get(intention)!
    const termes = [...a.termes].sort((p, q) => q.clics - p.clics)
    const s = termes.reduce((o, x) => ({ impressions: o.impressions + x.impressions, clics: o.clics + x.clics, cout: o.cout + x.cout, conversions: o.conversions + x.conversions }),
      { impressions: 0, clics: 0, cout: 0, conversions: 0 })
    return {
      intention, libelle: LIBELLES[intention],
      termes: termes.map((x) => x.terme),
      motsCles: [...a.motsCles].sort(),
      groupesAnnonces: [...a.groupes].sort(),
      stats: {
        termes: termes.length, ...s,
        cout: Math.round(s.cout * 100) / 100,
        tauxConv: s.clics > 0 ? s.conversions / s.clics : null,
        cpa: s.conversions > 0 ? Math.round(s.cout / s.conversions * 100) / 100 : null,
      },
    }
  }).filter((g) => g.stats.termes > 0).sort((a, b) => b.stats.clics - a.stats.clics)

  const aRevoir = classes.filter((c) => c.confiance === "basse").map((c) => c.terme)
    .sort((a, b) => (parTerme.get(b) ? t.termes.find((x) => x.terme === b)!.clics : 0) - (t.termes.find((x) => x.terme === a)!.clics))
    .slice(0, 50)

  const notes: string[] = []
  if (aRevoir.length) notes.push(`${aRevoir.length} terme(s) classé(s) par défaut en « catégorie générique » (aucun motif reconnu) : à revoir par le skill avant de s'en servir.`)
  notes.push("Google Ads masque les termes à faible volume : ce rapport voit ce qui compte, pas la longue traîne.")
  notes.push("Ces intentions sont dérivées des termes de recherche, jamais de la requête au clic — Google ne la transmet pas. Au clic, seul le mot-clé acheté (lpws_kw) est disponible.")
  const petits = groupes.filter((g) => g.stats.conversions > 0 && g.stats.conversions < 25).map((g) => g.libelle)
  if (petits.length) notes.push(`Moins de 25 conversions sur la période pour : ${petits.join(", ")}. Un test par intention y serait long à conclure.`)

  return Intents.parse({
    client: meta.client, campagne: meta.campagne, calculeLe: new Date().toISOString(), methode: meta.methode,
    termes: t.termes.length, groupes,
    motsCles: Object.fromEntries([...vMots.entries()].map(([k, m]) => [k, gagnant(m)])),
    groupesAnnonces: Object.fromEntries([...vGroupes.entries()].map(([k, m]) => [k, gagnant(m)])),
    aRevoir, notes,
  })
}
