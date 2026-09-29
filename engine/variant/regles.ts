/**
 * regles.ts — LA BASE DE CONNAISSANCES : les règles dans regles.json, leurs déclencheurs ici.
 *
 * Les trente règles de docs/brain.html, plus celles de la recherche payante et de la page
 * produit, portées dans une forme qu'une machine peut faire tourner : chaque règle nomme les
 * signaux qu'elle consomme, dit si elle produit un TEST (qu'on sait exécuter avec nos verbes)
 * ou un CONSEIL (à transmettre au client), et porte trois notes qui servent au classement.
 *
 * Trois notes, pas un mot : `impact` (ce que ça peut rapporter), `preuve` (la solidité de ce
 * qu'on sait), `risque` (ce que ça peut casser). La priorité se calcule, elle ne se déclare
 * pas. Et une catégorie « stratégique » échappe au calcul, parce que les grilles sous-notent
 * les changements audacieux (cf. la dernière règle de la KB).
 *
 * Tout ce qui se lit est une DONNÉE (regles.json) : prose, notes, sources, consigne de test.
 * On enrichit ou corrige le brain sans toucher au code, et le fichier est vérifié au chargement
 * (schéma, id unique et préfixé par sa famille, une consigne de variante pour chaque test et
 * seulement pour eux, un déclencheur par règle) : une faute arrête tout, en la nommant.
 *
 * Seul le déclencheur reste du code, typé avec les signaux (`QUAND`) : il répond vrai (la règle
 * se déclenche), faux, ou null : signal manquant, règle non évaluable. Jamais une supposition
 * silencieuse.
 */
import { readFileSync } from "node:fs"
import { z } from "zod"
import type { SignauxMecaniques } from "./signaux.ts"
import type { SignauxJuges } from "./jugement.ts"
import { type Contexte, Niche, nicheDe, texteAnnonce } from "./contexte.ts"
import { accrocheReprise } from "./concordance.ts"

export type Signaux = { m: SignauxMecaniques; j: SignauxJuges | null }

const Famille = z.enum(["mm", "vp", "pr", "fr", "of", "st", "pe", "te", "me", "sea"])
export type Famille = z.infer<typeof Famille>
const Note = (max: number) => z.number().int().min(1).max(max)

/** Une règle telle que regles.json l'écrit. */
export const RegleDonnee = z.object({
  id: z.string().regex(/^[a-z]+(-[a-z0-9]+)+$/),
  famille: Famille,
  niches: z.array(Niche).min(1),
  impact: Note(5),
  preuve: Note(5),
  risque: Note(3),
  /** échappe au calcul de priorité : toujours montré en premier s'il se déclenche */
  strategique: z.boolean().optional(),
  sortie: z.enum(["test", "conseil", "methode"]),
  signal: z.string().min(1),
  pourquoi: z.string().min(1),
  action: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
  /** pour un test : ce que la variante doit changer, et avec quels verbes */
  test: z.object({
    cible: z.enum(["titre", "sous-titre", "cta", "nav", "section", "compteur"]),
    verbes: z.array(z.enum(["set", "remove", "move", "swap", "duplicate"])).min(1),
    consigne: z.string().min(1),
  }).strict().optional(),
}).strict()
  .refine((r) => r.id.startsWith(r.famille + "-"), { message: "l'id commence par sa famille", path: ["id"] })
  .refine((r) => (r.sortie === "test") === !!r.test, { message: "un test, et seulement un test, porte une consigne de variante", path: ["test"] })

export type Quand = (s: Signaux, c: Contexte) => boolean | null
export type Regle = z.infer<typeof RegleDonnee> & { quand: Quand }

export const FAMILLES: Record<Famille, string> = {
  mm: "La promesse tenue", vp: "Ce que la page promet", pr: "La preuve", fr: "La friction",
  of: "L'offre et le prix", st: "L'ordre et l'attention", pe: "La personnalisation",
  te: "La technique", me: "La méthode de test", sea: "La recherche payante",
}

const j = (s: Signaux) => s.j
const chiffreDans = (t: string) => /\d/.test(t)
export const CTA_GENERIQUE = /^(submit|send|soumettre|envoyer|en savoir plus|learn more|cliquez ici|click here|valider|ok|go)$/i

/** Le déclencheur de chaque règle de regles.json, par id. */
export const QUAND: Record<string, Quand> = {
  /* ————— la promesse tenue ————— */
  "mm-promesse-titre": (s) => j(s) ? !j(s)!.promesseDansTitre.valeur : null,
  "mm-chiffre-annonce": (s, c) => chiffreDans(texteAnnonce(c)) ? s.m.hero.chiffres.length === 0 : false,
  "mm-accroche-crea": (s, c) => {
    const r = c.crea ? accrocheReprise(c.crea.accroche, s.m.hero.titre + " " + s.m.hero.sousTitre) : null
    return r === null ? null : !r
  },
  "mm-intentions-melangees": (_s, c) => c.annonce.motsCles.length >= 6 ? true : c.annonce.motsCles.length ? false : null,

  /* ————— ce que la page promet ————— */
  "vp-titre-categorie": (s) => j(s) ? j(s)!.titreType.valeur === "categorie" : null,
  "vp-cadre-de-reference": (s) => j(s) ? !j(s)!.cadreDeReference.valeur : null,
  "vp-niveau-lecture": (s) => j(s) ? j(s)!.niveauLecture.valeur !== "simple" : (s.m.lisibilite.motsParPhrase > 22 ? true : null),

  /* ————— la preuve ————— */
  "pr-avis-absents": (s) => !s.m.preuves.avis.presents,
  "pr-preuve-segment": (s, c) => c.cible && j(s) ? !j(s)!.preuveAligneeCible.valeur : null,
  "pr-temoignages-anonymes": (s) => s.m.preuves.temoignages.nombre > 0 ? s.m.preuves.temoignages.avecNom === 0 : false,
  "pr-compteur-zero": (s) => s.m.preuves.compteurZero,
  "pr-b2b-sans-preuve": (s, c) => (c.panierMoyen ?? 0) >= 5000 ? (s.m.preuves.logos === 0 && s.m.preuves.temoignages.nombre === 0) : null,

  /* ————— la friction ————— */
  "fr-formulaire-long": (s) => s.m.formulaire.present ? s.m.formulaire.champs >= 7 : false,
  "fr-telephone-obligatoire": (s) => s.m.formulaire.present ? s.m.formulaire.telephoneObligatoire : false,
  "fr-compte-obligatoire": () => null,
  // un prix affiché n'est pas un tunnel de paiement (la grille tarifaire d'un SaaS) : il faut un
  // panier, un passage en caisse ou des champs de carte sur la page
  "fr-securite-paiement": (s) => {
    const t = s.m.paiement.tunnel
    return t.panier || t.checkout || t.champsCarte ? s.m.paiement.marqueurs.length === 0 : false
  },
  "fr-qualification-faible": (s, c) => c.vente === "commercial" && s.m.formulaire.present ? s.m.formulaire.champs <= 2 : null,

  /* ————— l'offre et le prix ————— */
  "of-prix-cache": (s, c) => c.vente === "libre-service" ? !s.m.prix.visible : null,
  "of-cta-mode-de-vente": (s) => j(s) ? !j(s)!.ctaAligneVente.valeur : null,
  "of-garantie-absente": (s, c) => (c.panierMoyen ?? 0) >= 100 || (j(s)?.risquePercuEleve.valeur ?? false) ? !s.m.garantie.presente : null,

  /* ————— l'achat en ligne : ce que l'acheteur cherche avant de payer ————— */
  "of-livraison-invisible": (s) => s.m.commerce.ajoutPanier.present ? !s.m.commerce.livraison.mentionnee : false,
  "of-retours-invisibles": (s) => s.m.commerce.ajoutPanier.present ? !s.m.commerce.retours.mentionnes : false,
  "of-paiement-fractionne": (s, c) => !s.m.commerce.ajoutPanier.present ? false : c.panierMoyen === undefined ? null : c.panierMoyen >= 100 && s.m.commerce.paiementFractionne.length === 0,
  "fr-guide-tailles": (s) => s.m.commerce.tailles.selecteur ? !s.m.commerce.tailles.guide : false,
  "te-prix-barre-sans-reference": (s) => s.m.commerce.prixBarre.present ? !s.m.commerce.prixBarre.referenceMentionnee : false,
  "fr-achat-sous-le-pli-mobile": (s) => s.m.commerce.ajoutPanier.present ? !s.m.commerce.ajoutPanier.auDessusDuPliMobile : false,
  "fr-sans-carte-cache": (s, c) => c.vente !== "libre-service" ? null : s.m.commerce.sansCarte.mentionne ? !s.m.commerce.sansCarte.auDessusDuPli : false,

  /* ————— l'ordre et l'attention ————— */
  "st-promesse-sous-le-pli": (s) => s.m.hero.titre ? s.m.hero.y > 700 : null,
  "st-nav-complete": (s, c) => nicheDe(c) === "ecom" ? false : (s.m.nav.presente ? s.m.nav.liens >= 5 : false),
  "st-objections-absentes": (s) => j(s) ? !j(s)!.objectionsTraitees.valeur : !s.m.objections.sectionPresente,
  "st-douze-fonctionnalites": (s) => s.m.fonctionnalitesListees >= 12,

  /* ————— la personnalisation ————— */
  "pe-identite": (s) => s.m.personnalisationIdentite,

  /* ————— la technique ————— */
  "te-vitesse": (s) => s.m.vitesse.lcpMs == null ? null : s.m.vitesse.lcpMs > 2500,
  "te-mesure-cassee": (s) => (s.m.mesure.gtm || s.m.mesure.gtag || s.m.mesure.meta || s.m.mesure.autres.length > 0) ? null : true,

  /* ————— la méthode ————— */
  "me-volume": (_s, c) => c.visiteursMois ? c.visiteursMois < 200_000 : null,
  "me-qualite": () => null,
  "me-couleur-bouton": () => null,

  /* ————— la recherche payante : nos leviers à nous ————— */
  "sea-motcle-titre": (s, c) => c.trafic !== "google-search" || !c.annonce.motsCles.length ? null
    : !c.annonce.motsCles.some((k) => (s.m.hero.titre + " " + s.m.hero.sousTitre).toLowerCase().includes(k.toLowerCase())),
  // une page produit a sa propre règle, sur le bouton d'achat (fr-achat-sous-le-pli-mobile)
  "sea-cta-pli-mobile": (s) => s.m.commerce.ajoutPanier.present ? false : s.m.ctas.length ? !s.m.ctaAuDessusDuPliMobile : null,
  // tous les boutons, pas seulement le premier : le « Submit » du formulaire est souvent le
  // dernier de la page, et c'est lui qui convertit
  "sea-cta-generique": (s) => s.m.ctas.length ? s.m.ctas.some((x) => CTA_GENERIQUE.test(x.texte)) : null,
  "sea-trop-de-ctas": (s) => new Set(s.m.ctas.filter((c) => c.auDessusDuPli).map((c) => c.texte.toLowerCase())).size > 4,
}

/** regles.json lu et vérifié, chaque règle avec son déclencheur ; sinon une erreur qui dit tout ce qui cloche. */
export function chargerRegles(brut: unknown, quand: Record<string, Quand> = QUAND): Regle[] {
  const r = z.array(RegleDonnee).safeParse(brut)
  if (!r.success) {
    const ids: unknown[] = Array.isArray(brut) ? brut.map((x) => x?.id) : []
    throw new Error(`regles.json : ${r.error.issues.map((i) => [typeof i.path[0] === "number" ? String(ids[i.path[0]] ?? `#${i.path[0]}`) : "", i.path.slice(1).join("."), i.message].filter(Boolean).join(" ")).join(" ; ")}`)
  }
  const ids = r.data.map((x) => x.id)
  const fautes = [
    ...ids.filter((x, i) => ids.indexOf(x) !== i).map((x) => `${x} en double`),
    ...ids.filter((x) => !Object.hasOwn(quand, x)).map((x) => `${x} sans déclencheur dans QUAND`),
    ...Object.keys(quand).filter((x) => !ids.includes(x)).map((x) => `déclencheur ${x} sans règle`),
  ]
  if (fautes.length) throw new Error(`regles.json : ${fautes.join(" ; ")}`)
  return r.data.map((x) => ({ ...x, quand: quand[x.id] }))
}

export const REGLES: Regle[] = chargerRegles(JSON.parse(readFileSync(new URL("./regles.json", import.meta.url), "utf8")))

/** La règle vaut-elle pour cette page ? Ses niches déclarées, face à la niche du contexte. */
export const pourNiche = (r: Pick<Regle, "niches">, c: Contexte): boolean => r.niches.includes(nicheDe(c))

/** impact × preuve ÷ risque, sur 100. Une règle hors de sa niche ne devient jamais un constat
 *  (diagnostic.ts, `horsNiche`) : il n'y a plus de pertinence à pondérer. */
export function score(r: Regle): number {
  return Math.round((r.impact * r.preuve) / r.risque / 25 * 100)
}
