import { createHash } from "node:crypto"
import { z } from "zod"
import { classer } from "./classify.ts"
import { grouper } from "./group.ts"
import { Ciblage, type RouteMotCle } from "./ciblage.ts"
import { normaliserMotCle } from "./routage.ts"
import { Intention, Termes, type Terme } from "./schema.ts"

export const EtatIntentions = z.object({
  version: z.literal(1),
  revision: z.string().regex(/^[a-f0-9]{32}$/),
  rapport: Termes,
  marques: z.array(z.string().trim().min(1).max(80)).max(30),
  decisions: z.record(z.string().regex(/^[a-f0-9]{24}$/), Intention.nullable()),
})
export type EtatIntentions = z.infer<typeof EtatIntentions>

const empreinte = (valeur: unknown, taille = 32) =>
  createHash("sha256").update(JSON.stringify(valeur)).digest("hex").slice(0, taille)

export function creerEtat(rapport: unknown, marques: string[] = []): EtatIntentions {
  const r = Termes.parse(rapport)
  if (r.termes.length > 20_000) throw new Error("20 000 lignes maximum : réduisez la période ou le périmètre Google Ads.")
  return EtatIntentions.parse({
    version: 1, rapport: r, marques, decisions: {},
    revision: empreinte({ source: r.source, termes: r.termes, marques }),
  })
}

export function analyser(etat: EtatIntentions, client = "", campagne = "") {
  const { rapport, marques, decisions } = EtatIntentions.parse(etat)
  const classes = rapport.termes.map((t) => classer(t.terme, marques))
  const groupes = grouper(rapport, classes, { client, campagne, methode: "heuristique" })
  const paquets = new Map<string, { route: RouteMotCle; lignes: Terme[] }>()
  for (const t of rapport.termes) {
    const motCle = normaliserMotCle(t.motCle ?? "")
    if (!motCle || /[{}]/.test(motCle)) continue
    const route = { motCle, campagneId: t.campagneId, groupeId: t.groupeId }
    const id = empreinte(route, 24)
    const p = paquets.get(id) ?? { route, lignes: [] }
    p.lignes.push(t); paquets.set(id, p)
  }
  const routes = [...paquets.entries()].map(([id, { route, lignes }]) => {
    const votes = new Map<Intention, number>()
    let incertain = false
    for (const t of lignes) {
      if (t.clics <= 0) continue
      const c = classer(t.terme, marques)
      votes.set(c.intention, (votes.get(c.intention) ?? 0) + t.clics)
      incertain ||= c.confiance === "basse"
    }
    const clics = lignes.reduce((s, x) => s + x.clics, 0)
    const classees = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const suggestion = classees[0]?.[0] ?? null
    const precise = !!route.campagneId && !!route.groupeId
    const automatique = precise && !incertain && votes.size === 1 && suggestion !== "marque" && clics > 0
    const decide = Object.hasOwn(decisions, id)
    const intention = clics === 0 ? null : decide ? decisions[id] : automatique ? suggestion : null
    const raison = clics === 0 ? "Aucun clic observé"
      : decide ? intention ? "Validé par le media buyer" : "Exclu par le media buyer"
      : !precise ? "Identifiants campagne/groupe absents : confirmer le ciblage par mot-clé"
      : votes.size > 1 ? "Plusieurs intentions pour le même mot-clé : original tant que non arbitré"
      : incertain ? "Classement incertain : à relire"
      : suggestion === "marque" ? "Marque/navigation : confirmer la pertinence d'une personnalisation"
      : "Une seule intention observée dans ce groupe"
    return {
      id, ...route, intention, suggestion, raison, clics,
      cout: Math.round(lignes.reduce((s, x) => s + x.cout, 0) * 100) / 100,
      conversions: lignes.reduce((s, x) => s + x.conversions, 0),
      repartition: classees.map(([intention, clics]) => ({ intention, clics })),
      termes: [...new Set(lignes.map((x) => x.terme))].slice(0, 20),
      campagne: lignes[0].campagne, groupeAnnonces: lignes[0].groupeAnnonces,
      decision: decide, automatique: !decide && automatique,
    }
  }).sort((a, b) => b.clics - a.clics || a.id.localeCompare(b.id))
  const clics = rapport.termes.reduce((s, t) => s + t.clics, 0)
  const routables = routes.filter((r) => r.intention).reduce((s, r) => s + r.clics, 0)
  return {
    revision: empreinte({ revision: etat.revision, decisions }),
    importeLe: rapport.importeLe, source: rapport.source, groupes: groupes.groupes, routes,
    clics, routables, couverture: clics ? routables / clics : null,
    notes: [
      "La requête réelle n'est pas disponible au clic. Le routage utilise le mot-clé acheté, jamais le texte de recherche du visiteur.",
      "Les chiffres décrivent les termes visibles du rapport, pas la totalité du trafic : Google masque certaines requêtes.",
      "Un mot-clé large peut déclencher de nouvelles intentions. Les groupes ambigus restent sur l'original tant qu'ils ne sont pas arbitrés.",
      "Performance Max, DSA et AI Max sans mot-clé ne sont pas personnalisés par ce connecteur.",
      "Importer ou corriger le classement ne modifie jamais le ciblage d'un test déjà créé : il garde sa copie figée.",
    ],
  }
}

export function ciblagePour(etat: EtatIntentions, intention: Intention): Ciblage {
  const a = analyser(etat)
  const routes = a.routes.filter((r) => r.intention === intention).map(({ motCle, campagneId, groupeId }) => ({ motCle, campagneId, groupeId }))
  if (!routes.length) throw new Error("Aucun mot-clé validé pour cette intention. Importez puis confirmez le ciblage.")
  return Ciblage.parse({ intention, revision: a.revision, routes })
}
