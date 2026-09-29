/**
 * citation.ts — un constat cite la page, jamais l'exemple de la règle.
 *
 * `regles.json` décrit une règle en général (« le titre nomme une catégorie, « logiciel
 * marketing » ») : c'est son principe, pas ce qu'on a vu. Quand la règle se déclenche, le buyer
 * doit lire CE qui l'a déclenchée sur SA page : le texte exact, tiré des signaux, et l'ancre
 * data-lpws de l'élément quand il en a une (« le bouton « Submit » (e67) »).
 *
 * Une fonction par règle, typée avec les signaux, comme les déclencheurs (`QUAND`) : une règle
 * sans citation arrête le chargement, en la nommant.
 */
import type { Contexte } from "./contexte.ts"
import { CTA_GENERIQUE, REGLES, type Signaux } from "./regles.ts"
import type { SignauxMecaniques } from "./signaux.ts"

export type RoleCite = "titre" | "sous-titre" | "bouton" | "navigation" | "section" | "formulaire" | "champ" | "texte" | "annonce" | "mesure"
/** un élément de la page cité par un constat : son texte exact, et son ancre data-lpws s'il en a une */
export type ElementCite = { role: RoleCite; texte: string; anchor?: string }
export type Citation = { signal: string; elements: ElementCite[] }
type Citer = (s: Signaux, c: Contexte) => Citation

const court = (t: string, n = 90) => t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t
/** « texte » (e12) : la forme sous laquelle un élément apparaît dans une phrase de constat */
export const dit = (e: ElementCite): string => `« ${court(e.texte) || "(vide)"} »${e.anchor ? ` (${e.anchor})` : ""}`
const liste = (xs: string[], n = 4) => xs.slice(0, n).map((x) => `« ${court(x, 50)} »`).join(", ") + (xs.length > n ? `, et ${xs.length - n} autre(s)` : "")
const el = (role: RoleCite, texte: string, anchor?: string): ElementCite => ({ role, texte, ...(anchor ? { anchor } : {}) })
const pluriel = (n: number, un: string, plusieurs = un + "s") => `${n} ${n > 1 ? plusieurs : un}`

const titre = (m: SignauxMecaniques) => el("titre", m.hero.titre, m.hero.titreAnchor)
const sousTitre = (m: SignauxMecaniques) => el("sous-titre", m.hero.sousTitre, m.hero.sousTitreAnchor)
const bouton = (x: { texte: string; anchor?: string }) => el("bouton", x.texte, x.anchor)
/** le bouton principal : le premier visible sans défiler, sinon le premier de la page */
export const principal = (m: SignauxMecaniques) => m.ctas.find((x) => x.auDessusDuPli) ?? m.ctas[0]
const achat = (m: SignauxMecaniques) => bouton(m.commerce.ajoutPanier)
const envoi = (m: SignauxMecaniques) => m.formulaire.bouton ? bouton(m.formulaire.bouton) : null
const section = (x: SignauxMecaniques["sections"][number]) => el("section", x.titre || "(section sans titre)", x.anchor)
const preuve = (m: SignauxMecaniques) => m.sections.find((x) => x.preuve)
const libelles = (xs: Array<{ texte: string }>) => [...new Set(xs.map((x) => x.texte))]
/** les chiffres tels que l'annonce les écrit (« 2x », « 14-day ») */
export const chiffresDe = (t: string) => [...new Set(t.match(/[^\s«»"'(),;:]*\d[^\s«»"'(),.;:]*/g) ?? [])]
const annonce = (c: Contexte) => [c.annonce.titre, c.annonce.description].filter(Boolean).join(" / ")

/** titre et sous-titre dans une phrase : « le titre « … » (e11) et le sous-titre « … » (e12) » */
const hautDePage = (m: SignauxMecaniques, et = "et") => {
  const t = titre(m), s = sousTitre(m)
  return s.texte ? `le titre ${dit(t)} ${et} le sous-titre ${dit(s)}` : `le titre ${dit(t)}`
}
const hautElements = (m: SignauxMecaniques) => [titre(m), ...(m.hero.sousTitre ? [sousTitre(m)] : [])]

export const CITER: Record<string, Citer> = {
  /* ————— la promesse tenue ————— */
  "mm-promesse-titre": ({ m }, c) => ({
    signal: `L'annonce promet « ${court(annonce(c), 120)} » ; ${hautDePage(m)} ne reprennent pas cette promesse.`,
    elements: [...hautElements(m), el("annonce", c.annonce.titre)],
  }),
  "mm-chiffre-annonce": ({ m }, c) => {
    const n = chiffresDe([annonce(c), c.crea?.accroche ?? ""].join(" "))
    return { signal: `L'annonce affiche ${liste(n)} ; aucun chiffre dans ${hautDePage(m, "ni dans")}.`, elements: [...hautElements(m), el("annonce", annonce(c))] }
  },
  "mm-accroche-crea": ({ m }, c) => ({
    signal: `L'accroche de la créa « ${court(c.crea?.accroche ?? "")} » ne se retrouve ni dans ${hautDePage(m, "ni dans")}.`,
    elements: [...hautElements(m), el("annonce", c.crea?.accroche ?? "")],
  }),
  "mm-intentions-melangees": ({ m }, c) => ({
    signal: `${pluriel(c.annonce.motsCles.length, "mot-clé acheté", "mots-clés achetés")} (${liste(c.annonce.motsCles)}) atterrissent sur la même page, derrière un seul titre ${dit(titre(m))}.`,
    elements: [titre(m), el("annonce", c.annonce.motsCles.join(", "))],
  }),

  /* ————— ce que la page promet ————— */
  "vp-titre-categorie": ({ m }) => ({
    signal: `Le titre ${dit(titre(m))} nomme une catégorie de produit, pas le résultat que le visiteur obtient.`,
    elements: [titre(m)],
  }),
  "vp-cadre-de-reference": ({ m }) => ({
    signal: `Ni le titre ${dit(titre(m))} ni le sous-titre ${dit(sousTitre(m))} ne disent à quoi le produit se compare, ni ce qu'il remplace.`,
    elements: hautElements(m),
  }),
  "vp-niveau-lecture": ({ m }) => ({
    signal: `Le texte compte ${m.lisibilite.motsParPhrase} mots par phrase en moyenne ; le sous-titre ${dit(sousTitre(m))} se lit à un niveau professionnel.`,
    elements: [sousTitre(m)],
  }),

  /* ————— la preuve ————— */
  "pr-avis-absents": ({ m }) => {
    const p = preuve(m)
    return {
      signal: `Aucune note ni avis client sur la page ; la preuve se limite à ${pluriel(m.preuves.logos, "logo")} et ${pluriel(m.preuves.temoignages.nombre, "témoignage")}${p ? `, dans la section ${dit(section(p))}` : ""}.`,
      elements: p ? [section(p)] : [titre(m)],
    }
  },
  "pr-preuve-segment": ({ m }, c) => {
    const p = preuve(m)
    return {
      signal: `La preuve${p ? ` de la section ${dit(section(p))}` : ""} (${pluriel(m.preuves.logos, "logo")}, ${pluriel(m.preuves.temoignages.nombre, "témoignage")}) ne parle pas à la cible de la campagne, « ${court(c.cible ?? "")} ».`,
      elements: p ? [section(p)] : [titre(m)],
    }
  },
  "pr-temoignages-anonymes": ({ m }) => {
    const p = preuve(m)
    return {
      signal: `${pluriel(m.preuves.temoignages.nombre, "témoignage")} sans aucun nom${p ? ` dans la section ${dit(section(p))}` : ""}.`,
      elements: p ? [section(p)] : [el("texte", pluriel(m.preuves.temoignages.nombre, "témoignage"))],
    }
  },
  "pr-compteur-zero": ({ m }) => ({
    signal: `La page affiche ${dit(el("texte", m.preuves.compteurZeroExtrait, m.preuves.compteurZeroAnchor))} : un compteur à zéro est une preuve contre soi.`,
    elements: [el("texte", m.preuves.compteurZeroExtrait, m.preuves.compteurZeroAnchor)],
  }),
  "pr-b2b-sans-preuve": ({ m }, c) => ({
    signal: `Contrat moyen de ${c.panierMoyen} €, et ni logo ni témoignage sur la page, sous le titre ${dit(titre(m))}.`,
    elements: [titre(m)],
  }),

  /* ————— la friction ————— */
  "fr-formulaire-long": ({ m }) => {
    const b = envoi(m)
    return {
      signal: `Le formulaire${m.formulaire.anchor ? ` (${m.formulaire.anchor})` : ""} demande ${pluriel(m.formulaire.champs, "champ")}, dont ${m.formulaire.obligatoires} obligatoire(s)${b ? `, avant le bouton ${dit(b)}` : ""}.`,
      elements: [el("formulaire", pluriel(m.formulaire.champs, "champ"), m.formulaire.anchor), ...b ? [b] : []],
    }
  },
  "fr-telephone-obligatoire": ({ m }) => {
    const t = m.formulaire.telephone, b = envoi(m)
    return {
      signal: `Le formulaire exige un téléphone dès le premier contact${t ? ` : champ ${dit(el("champ", t.texte, t.anchor))}` : ""}${b ? `, envoyé par le bouton ${dit(b)}` : ""}.`,
      elements: [...t ? [el("champ", t.texte, t.anchor)] : [], ...b ? [b] : []],
    }
  },
  "fr-compte-obligatoire": ({ m }) => ({
    signal: `Le bouton d'achat ${dit(achat(m))} mène à une création de compte avant le paiement.`,
    elements: [achat(m)],
  }),
  "fr-securite-paiement": ({ m }) => {
    const t = m.paiement.tunnel, e = t.element ? el(t.champsCarte ? "champ" : "bouton", t.element.texte, t.element.anchor) : null
    const quoi = [t.panier && "un panier", t.checkout && "un passage en caisse", t.champsCarte && "des champs de carte"].filter(Boolean).join(", ")
    return {
      signal: `La page porte un tunnel de paiement (${quoi}${e ? ` : ${dit(e)}` : ""}) sans aucun repère de sécurité lu (paiement sécurisé, badges de carte, chiffrement).`,
      elements: e ? [e] : [],
    }
  },
  "fr-qualification-faible": ({ m }) => {
    const b = envoi(m)
    return {
      signal: `Vente par un commercial, mais le formulaire ne demande que ${pluriel(m.formulaire.champs, "champ")}${b ? ` avant le bouton ${dit(b)}` : ""}.`,
      elements: [el("formulaire", pluriel(m.formulaire.champs, "champ"), m.formulaire.anchor), ...b ? [b] : []],
    }
  },

  /* ————— l'offre et le prix ————— */
  "of-prix-cache": ({ m }) => {
    const p = principal(m)
    return {
      signal: `Vente en libre-service, et aucun prix lu sur la page${p ? ` ; le bouton principal ${dit(bouton(p))} engage sans dire combien` : ""}.`,
      elements: p ? [bouton(p)] : [titre(m)],
    }
  },
  "of-cta-mode-de-vente": ({ m }, c) => {
    const p = principal(m)
    const autres = libelles(m.ctas).filter((x) => x !== p?.texte)
    return {
      signal: `Le bouton principal ${p ? dit(bouton(p)) : "(aucun)"}${p?.auDessusDuPli ? ", dans le premier écran," : ""} ne correspond pas à une vente en ${c.vente}${autres.length ? ` ; la page propose aussi ${liste(autres, 3)}` : ""}.`,
      elements: p ? [bouton(p)] : [],
    }
  },
  "of-garantie-absente": ({ m }) => ({
    signal: `Aucune garantie affichée${m.prix.valeurs.length ? ` pour des prix de ${liste(m.prix.valeurs, 3)}` : ""} ; ${hautDePage(m)} ne lèvent pas le risque.`,
    elements: hautElements(m),
  }),

  /* ————— l'achat en ligne ————— */
  "of-livraison-invisible": ({ m }) => ({
    signal: `Le bouton d'achat ${dit(achat(m))} est là, mais la page ne dit ni le coût ni le délai de livraison.`,
    elements: [achat(m)],
  }),
  "of-retours-invisibles": ({ m }) => ({
    signal: `Le bouton d'achat ${dit(achat(m))} est là, mais aucune politique de retour n'est lue sur la page.`,
    elements: [achat(m)],
  }),
  "of-paiement-fractionne": ({ m }, c) => ({
    signal: `Panier moyen de ${c.panierMoyen} €${m.prix.valeurs.length ? `, prix ${liste(m.prix.valeurs, 3)}` : ""}, et aucun paiement en plusieurs fois près du bouton ${dit(achat(m))}.`,
    elements: [achat(m)],
  }),
  "fr-guide-tailles": ({ m }) => ({
    signal: `Un choix de taille avant le bouton ${dit(achat(m))}, et aucun guide des tailles sur la page.`,
    elements: [achat(m)],
  }),
  "te-prix-barre-sans-reference": ({ m }) => ({
    signal: `Un prix barré s'affiche${m.prix.valeurs.length ? ` (prix lus : ${liste(m.prix.valeurs, 3)})` : ""} sans prix de référence sur les 30 derniers jours.`,
    elements: [el("texte", m.prix.valeurs.join(" · ")), achat(m)],
  }),
  "fr-achat-sous-le-pli-mobile": ({ m }) => ({
    signal: `Sur téléphone, le bouton d'achat ${dit(achat(m))} n'est pas dans le premier écran${m.commerce.ajoutPanier.y !== null ? ` (à ${m.commerce.ajoutPanier.y} px sur ordinateur)` : ""}.`,
    elements: [achat(m)],
  }),
  "fr-sans-carte-cache": ({ m }) => {
    const e = el("texte", m.commerce.sansCarte.extrait, m.commerce.sansCarte.anchor)
    return { signal: `${dit(e)} n'est dit que sous le premier écran du téléphone ; ${hautDePage(m)} ne le disent pas.`, elements: [e, ...hautElements(m)] }
  },

  /* ————— l'ordre et l'attention ————— */
  "st-promesse-sous-le-pli": ({ m }) => ({
    signal: `Le titre ${dit(titre(m))} commence à ${m.hero.y} px, sous le premier écran.`,
    elements: [titre(m)],
  }),
  "st-nav-complete": ({ m }) => ({
    signal: `Le menu${m.nav.anchor ? ` (${m.nav.anchor})` : ""} garde ${pluriel(m.nav.liens, "lien")}${m.nav.textes.length ? ` (${liste(m.nav.textes, 6)})` : ""} : autant de sorties sur une page de campagne.`,
    elements: [el("navigation", m.nav.textes.join(" · ") || pluriel(m.nav.liens, "lien"), m.nav.anchor)],
  }),
  "st-objections-absentes": ({ m }) => ({
    signal: `Aucune section ne traite les objections : ${m.sections.length ? `les sections lues sont ${liste(m.sections.map((x) => x.titre || "(sans titre)"), 6)}` : "aucune section lue"}.`,
    elements: m.sections.slice(0, 6).map(section),
  }),
  "st-douze-fonctionnalites": ({ m }) => ({
    signal: `${m.fonctionnalitesListees} fonctionnalités listées, sans hiérarchie, sous le titre ${dit(titre(m))}.`,
    elements: [titre(m), el("texte", pluriel(m.fonctionnalitesListees, "fonctionnalité listée", "fonctionnalités listées"))],
  }),

  /* ————— la personnalisation ————— */
  "pe-identite": ({ m }) => ({
    signal: `Le haut de page s'adresse à l'identité supposée du visiteur : ${hautDePage(m)}.`,
    elements: hautElements(m),
  }),

  /* ————— la technique ————— */
  "te-vitesse": ({ m }) => ({
    signal: `Le plus gros élément visible s'affiche en ${m.vitesse.lcpMs} ms (médiane de ${pluriel(m.vitesse.tirs, "chargement")} de la vraie page), au-delà de 2 500 ms.`,
    elements: [el("mesure", `LCP ${m.vitesse.lcpMs} ms`)],
  }),
  "te-mesure-cassee": () => ({
    signal: "Aucun tag de mesure chargé par la page : ni Google Tag Manager, ni gtag, ni pixel Meta, ni autre outil connu. Aucune conversion ne peut remonter.",
    elements: [el("mesure", "aucun tag de mesure chargé")],
  }),

  /* ————— la méthode ————— */
  "me-volume": (_s, c) => ({
    signal: `${c.visiteursMois} visiteurs par mois déclarés pour cette campagne : seul un gros changement se mesure.`,
    elements: [el("mesure", `${c.visiteursMois} visiteurs par mois`)],
  }),
  "me-qualite": () => ({
    signal: "La qualité des contacts n'est pas suivie à côté de la conversion pour cette campagne.",
    elements: [el("mesure", "qualité des contacts non suivie")],
  }),
  "me-couleur-bouton": ({ m }) => {
    const p = principal(m)
    return { signal: `Un test de couleur est demandé${p ? ` sur le bouton ${dit(bouton(p))}` : ""}.`, elements: p ? [bouton(p)] : [] }
  },

  /* ————— la recherche payante ————— */
  "sea-motcle-titre": ({ m }, c) => ({
    signal: `Aucun mot-clé acheté (${liste(c.annonce.motsCles)}) n'apparaît dans ${hautDePage(m, "ni dans")}.`,
    elements: [...hautElements(m), el("annonce", c.annonce.motsCles.join(", "))],
  }),
  "sea-cta-pli-mobile": ({ m }) => {
    const p = m.ctas[0]
    return {
      signal: `Sur téléphone, aucun bouton d'action dans le premier écran${p ? ` ; le premier, ${dit(bouton(p))}, arrive plus bas` : ""}.`,
      elements: p ? [bouton(p)] : [],
    }
  },
  "sea-cta-generique": ({ m }) => {
    const g = m.ctas.filter((x) => CTA_GENERIQUE.test(x.texte))
    const noms = g.map((x) => `« ${court(x.texte, 50)} » (${x.anchor}${x.auDessusDuPli ? ", dans le premier écran" : `, à ${x.y} px`})`)
    return {
      signal: g.length > 1 ? `Les boutons ${noms.join(", ")} ne disent pas ce que le visiteur obtient en cliquant.`
        : `Le bouton ${noms[0]} ne dit pas ce que le visiteur obtient en cliquant.`,
      elements: g.map(bouton),
    }
  },
  "sea-trop-de-ctas": ({ m }) => {
    const haut = m.ctas.filter((x) => x.auDessusDuPli)
    const n = new Set(haut.map((x) => x.texte.toLowerCase())).size
    return { signal: `${n} appels à l'action différents dans le premier écran : ${liste(libelles(haut), 6)}.`, elements: haut.map(bouton) }
  },
}

const sansCitation = REGLES.filter((r) => !Object.hasOwn(CITER, r.id)).map((r) => r.id)
const orphelines = Object.keys(CITER).filter((id) => !REGLES.some((r) => r.id === id))
if (sansCitation.length || orphelines.length)
  throw new Error(`citation.ts : ${[...sansCitation.map((x) => `${x} sans citation`), ...orphelines.map((x) => `citation ${x} sans règle`)].join(" ; ")}`)

/** Ce que la règle a vu sur CETTE page : la phrase du constat, et les éléments qu'elle cite. */
export const citer = (id: string, s: Signaux, c: Contexte): Citation => CITER[id](s, c)
