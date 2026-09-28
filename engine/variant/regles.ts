/**
 * regles.ts — LA BASE DE CONNAISSANCES, en données exécutables.
 *
 * Les trente règles de docs/brain.html, plus quatre propres à la recherche payante, portées
 * dans une forme qu'une machine peut faire tourner : chaque règle nomme les signaux qu'elle
 * consomme, dit si elle produit un TEST (qu'on sait exécuter avec nos verbes) ou un CONSEIL
 * (à transmettre au client), et porte trois notes qui servent au classement.
 *
 * Trois notes, pas un mot : `impact` (ce que ça peut rapporter), `preuve` (la solidité de ce
 * qu'on sait), `risque` (ce que ça peut casser). La priorité se calcule, elle ne se déclare
 * pas. Et une catégorie « stratégique » échappe au calcul, parce que les grilles sous-notent
 * les changements audacieux (cf. la dernière règle de la KB).
 *
 * `quand` répond vrai (la règle se déclenche), faux, ou null : signal manquant, règle non
 * évaluable. Jamais une supposition silencieuse. La prose (signal, pourquoi, action) reste
 * celle du brain : c'est elle que le buyer lit, avec la source.
 */
import type { SignauxMecaniques } from "./signaux.ts"
import type { SignauxJuges } from "./jugement.ts"
import { type Contexte, type Niche, nicheDe } from "./contexte.ts"

export type Signaux = { m: SignauxMecaniques; j: SignauxJuges | null }
export type Famille = "mm" | "vp" | "pr" | "fr" | "of" | "st" | "pe" | "te" | "me" | "sea"
export type Verbe = "set" | "remove" | "move" | "swap" | "duplicate"
export type Cible = "titre" | "sous-titre" | "cta" | "nav" | "section" | "compteur"

export type Regle = {
  id: string
  famille: Famille
  niches: Niche[]
  impact: 1 | 2 | 3 | 4 | 5
  preuve: 1 | 2 | 3 | 4 | 5
  risque: 1 | 2 | 3
  /** échappe au calcul de priorité : toujours montré en premier s'il se déclenche */
  strategique?: boolean
  sortie: "test" | "conseil" | "methode"
  signal: string
  pourquoi: string
  action: string
  sources: string[]
  quand: (s: Signaux, c: Contexte) => boolean | null
  /** pour un test : ce que la variante doit changer, et avec quels verbes */
  test?: { cible: Cible; verbes: Verbe[]; consigne: string }
}

export const FAMILLES: Record<Famille, string> = {
  mm: "La promesse tenue", vp: "Ce que la page promet", pr: "La preuve", fr: "La friction",
  of: "L'offre et le prix", st: "L'ordre et l'attention", pe: "La personnalisation",
  te: "La technique", me: "La méthode de test", sea: "La recherche payante",
}

const tous: Niche[] = ["ecom", "saas", "b2b"]
const j = (s: Signaux) => s.j
const chiffreDans = (t: string) => /\d/.test(t)
const CTA_GENERIQUE = /^(submit|send|soumettre|envoyer|en savoir plus|learn more|cliquez ici|click here|valider|ok|go)$/i

export const REGLES: Regle[] = [
  /* ————— la promesse tenue ————— */
  { id: "mm-promesse-titre", famille: "mm", niches: tous, impact: 5, preuve: 4, risque: 1, sortie: "test", strategique: true,
    signal: "La promesse de la publicité n'apparaît pas dans le titre de la page.",
    pourquoi: "Le visiteur a cliqué pour quelque chose qu'il ne retrouve pas. Le clic est payé pour rien.",
    action: "Remettre la promesse exacte de l'annonce dans le titre.",
    sources: ["google-ads", "cxl"],
    quand: (s) => j(s) ? !j(s)!.promesseDansTitre.valeur : null,
    test: { cible: "titre", verbes: ["set"], consigne: "Réécrire le titre pour qu'il reprenne la promesse de l'annonce, avec ses mots, sans rien ajouter que la page n'affirme déjà." } },
  { id: "mm-chiffre-annonce", famille: "mm", niches: tous, impact: 4, preuve: 4, risque: 2, sortie: "test",
    signal: "L'annonce affiche un chiffre, la page n'en a aucun.",
    pourquoi: "Le bénéfice chiffré est le signal de crédibilité le plus fort. Il disparaît juste au moment où il devrait rassurer.",
    action: "Reprendre le chiffre dans le titre, seulement s'il est étayé par le client.",
    sources: ["google-ads", "ftc"],
    quand: (s, c) => chiffreDans(c.annonce.titre + " " + (c.annonce.description ?? "")) ? s.m.hero.chiffres.length === 0 : false,
    test: { cible: "titre", verbes: ["set"], consigne: "Reporter dans le titre ou le sous-titre le chiffre exact de l'annonce. Ne jamais en inventer un autre." } },
  { id: "mm-intentions-melangees", famille: "mm", niches: ["saas", "b2b"], impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Plusieurs intentions très différentes atterrissent sur la même page.",
    pourquoi: "Une page qui parle à tout le monde ne parle précisément à personne.",
    action: "Créer une page par grande intention plutôt qu'une page fourre-tout.",
    sources: ["instapage"],
    quand: (_s, c) => c.annonce.motsCles.length >= 6 ? true : c.annonce.motsCles.length ? false : null },

  /* ————— ce que la page promet ————— */
  { id: "vp-titre-categorie", famille: "vp", niches: tous, impact: 4, preuve: 3, risque: 2, sortie: "test", strategique: true,
    signal: "Le titre nomme une catégorie (« logiciel marketing ») au lieu d'un résultat.",
    pourquoi: "Le visiteur comprend ce que c'est, pas ce qu'il y gagne.",
    action: "Réécrire en résultat obtenu, le plus spécifique possible, sans perdre en clarté.",
    sources: ["meclabs", "nng"],
    quand: (s) => j(s) ? j(s)!.titreType.valeur === "categorie" : null,
    test: { cible: "titre", verbes: ["set"], consigne: "Formuler le résultat que le visiteur obtient, spécifique et compris en trois secondes. Pas de superlatif, pas de chiffre inventé." } },
  { id: "vp-cadre-de-reference", famille: "vp", niches: ["saas", "b2b"], impact: 3, preuve: 3, risque: 1, sortie: "test",
    signal: "On ne comprend pas à quoi le produit se compare.",
    pourquoi: "Sans point de comparaison, le visiteur ne peut pas évaluer la valeur.",
    action: "Nommer la catégorie et les alternatives, même imparfaites.",
    sources: ["dunford"],
    quand: (s) => j(s) ? !j(s)!.cadreDeReference.valeur : null,
    test: { cible: "sous-titre", verbes: ["set"], consigne: "Dans le sous-titre, nommer ce que le visiteur ferait sinon (à la main, avec l'outil X) et ce que la page change." } },
  { id: "vp-niveau-lecture", famille: "vp", niches: tous, impact: 3, preuve: 3, risque: 1, sortie: "test",
    signal: "Le texte est écrit à un niveau de lecture professionnel.",
    pourquoi: "L'effort de lecture réduit la compréhension, donc l'action.",
    action: "Simplifier : une idée par phrase, des mots courants.",
    sources: ["unbounce"],
    quand: (s) => j(s) ? j(s)!.niveauLecture.valeur !== "simple" : (s.m.lisibilite.motsParPhrase > 22 ? true : null),
    test: { cible: "sous-titre", verbes: ["set"], consigne: "Réécrire le sous-titre en phrases courtes et mots courants, sans changer ce qu'il affirme." } },

  /* ————— la preuve ————— */
  { id: "pr-avis-absents", famille: "pr", niches: ["ecom"], impact: 5, preuve: 5, risque: 1, sortie: "conseil",
    signal: "Aucune note ni avis sur un produit qu'on réfléchit avant d'acheter.",
    pourquoi: "Le doute sur la qualité n'est levé par rien.",
    action: "Afficher les avis réels, avec leur nombre.",
    sources: ["luca", "salganik"],
    quand: (s) => !s.m.preuves.avis.presents },
  { id: "pr-preuve-segment", famille: "pr", niches: tous, impact: 3, preuve: 3, risque: 2, sortie: "test",
    signal: "La preuve cite de grands comptes alors que la campagne vise des petites équipes.",
    pourquoi: "Une preuve n'agit que si le visiteur se reconnaît dans le groupe cité.",
    action: "Recadrer la preuve sur le segment que la campagne vise vraiment.",
    sources: ["salganik", "luca"],
    quand: (s, c) => c.cible && j(s) ? !j(s)!.preuveAligneeCible.valeur : null,
    test: { cible: "section", verbes: ["move", "swap"], consigne: "Remonter ou mettre en avant la preuve qui parle au segment visé ; ne rien inventer." } },
  { id: "pr-temoignages-anonymes", famille: "pr", niches: tous, impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Des témoignages sans nom, sans fonction et sans résultat.",
    pourquoi: "Une preuve invérifiable ne prouve rien, et peut faire douter du reste.",
    action: "Nommer, situer, chiffrer, ou retirer.",
    sources: ["cxl", "baymard"],
    quand: (s) => s.m.preuves.temoignages.nombre > 0 ? s.m.preuves.temoignages.avecNom === 0 : false },
  { id: "pr-compteur-zero", famille: "pr", niches: tous, impact: 3, preuve: 4, risque: 1, sortie: "test",
    signal: "Un compteur affiche zéro : zéro partage, zéro avis.",
    pourquoi: "C'est de la preuve sociale à l'envers : ça dit « personne n'y va ».",
    action: "Retirer le compteur tant qu'il est vide.",
    sources: ["cialdini"],
    quand: (s) => s.m.preuves.compteurZero,
    test: { cible: "compteur", verbes: ["remove"], consigne: "Retirer l'élément qui affiche le zéro." } },
  { id: "pr-b2b-sans-preuve", famille: "pr", niches: ["b2b"], impact: 5, preuve: 4, risque: 1, sortie: "conseil",
    signal: "Contrat à montant élevé, mais aucune étude de cas, aucun logo, aucune preuve de conformité.",
    pourquoi: "L'essentiel de la décision se prend sans nous parler. La page doit permettre de s'auto-convaincre.",
    action: "Ajouter études de cas, références et éléments de conformité.",
    sources: ["gartner", "6sense"],
    quand: (s, c) => (c.panierMoyen ?? 0) >= 5000 ? (s.m.preuves.logos === 0 && s.m.preuves.temoignages.nombre === 0) : null },

  /* ————— la friction ————— */
  { id: "fr-formulaire-long", famille: "fr", niches: tous, impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Un formulaire long en tout début de parcours.",
    pourquoi: "Ce sont quels champs qui coûtent, pas combien il y en a.",
    action: "Garder les champs utiles, retirer les invasifs, tester les libellés.",
    sources: ["aagaard"],
    quand: (s) => s.m.formulaire.present ? s.m.formulaire.champs >= 7 : false },
  { id: "fr-telephone-obligatoire", famille: "fr", niches: ["saas", "b2b"], impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Le téléphone est obligatoire dès le premier contact.",
    pourquoi: "C'est le champ qui fait le plus reculer, pour une information rarement utile tout de suite.",
    action: "Le rendre optionnel, ou le demander plus tard. Sauf si l'objectif est de filtrer : c'est un choix business.",
    sources: ["cxl"],
    quand: (s) => s.m.formulaire.present ? s.m.formulaire.telephoneObligatoire : false },
  { id: "fr-compte-obligatoire", famille: "fr", niches: ["ecom"], impact: 5, preuve: 4, risque: 1, sortie: "conseil",
    signal: "Il faut créer un compte pour acheter.",
    pourquoi: "C'est l'une des premières causes d'abandon de panier.",
    action: "Permettre l'achat en invité.",
    sources: ["baymard"],
    quand: () => null },
  { id: "fr-securite-paiement", famille: "fr", niches: ["ecom"], impact: 3, preuve: 3, risque: 1, sortie: "conseil",
    signal: "Aucun signal de sécurité près des champs de paiement.",
    pourquoi: "La méfiance au moment de payer fait abandonner une part non négligeable des paniers.",
    action: "Un ou deux repères reconnus, placés au point de friction. Pas dix.",
    sources: ["baymard"],
    quand: (s) => s.m.prix.visible ? s.m.paiement.marqueurs.length === 0 : null },
  { id: "fr-qualification-faible", famille: "fr", niches: ["b2b"], impact: 3, preuve: 4, risque: 2, sortie: "conseil",
    signal: "L'objectif est la qualité des contacts, mais le formulaire ne demande presque rien.",
    pourquoi: "Moins de friction fait monter le volume et peut faire baisser le retour sur investissement.",
    action: "Assumer des champs de qualification.",
    sources: ["kohavi"],
    quand: (s, c) => c.vente === "commercial" && s.m.formulaire.present ? s.m.formulaire.champs <= 2 : null },

  /* ————— l'offre et le prix ————— */
  { id: "of-prix-cache", famille: "of", niches: ["saas"], impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Produit en libre-service, mais aucun prix visible.",
    pourquoi: "L'incertitude sur le prix retarde la décision et attire les mauvais profils.",
    action: "Afficher le prix, ou au moins la structure de prix.",
    sources: ["plg"],
    quand: (s, c) => c.vente === "libre-service" ? !s.m.prix.visible : null },
  { id: "of-cta-mode-de-vente", famille: "of", niches: ["saas", "b2b"], impact: 4, preuve: 3, risque: 1, sortie: "test",
    signal: "Le bouton principal ne correspond pas à la façon dont la vente se fait.",
    pourquoi: "« Commencer gratuitement » sur une offre qui exige un commercial produit des contacts inexploitables, et l'inverse fait fuir.",
    action: "Aligner le bouton sur le mode de vente réel.",
    sources: ["cxl"],
    quand: (s) => j(s) ? !j(s)!.ctaAligneVente.valeur : null,
    test: { cible: "cta", verbes: ["set"], consigne: "Réécrire le libellé du bouton principal pour qu'il dise exactement ce qui se passe après le clic, selon le mode de vente." } },
  { id: "of-garantie-absente", famille: "of", niches: ["ecom", "saas"], impact: 3, preuve: 3, risque: 2, sortie: "test",
    signal: "Risque perçu élevé et aucune garantie affichée.",
    pourquoi: "Pouvoir revenir en arrière débloque la décision.",
    action: "Afficher la garantie ou la politique de retour, si elle existe réellement.",
    sources: ["cxl", "ftc"],
    quand: (s, c) => (c.panierMoyen ?? 0) >= 100 || (j(s)?.risquePercuEleve.valeur ?? false) ? !s.m.garantie.presente : null,
    test: { cible: "sous-titre", verbes: ["set"], consigne: "Mentionner la garantie ou la politique de retour SEULEMENT si le buyer confirme qu'elle existe ; sinon ne pas produire cette variante." } },

  /* ————— l'ordre et l'attention ————— */
  { id: "st-promesse-sous-le-pli", famille: "st", niches: tous, impact: 4, preuve: 4, risque: 1, sortie: "test",
    signal: "La promesse principale arrive sous la ligne de flottaison.",
    pourquoi: "L'essentiel de l'attention se joue avant le premier défilement.",
    action: "Remonter la promesse, et donner une raison de faire défiler.",
    sources: ["nng"],
    quand: (s) => s.m.hero.titre ? s.m.hero.y > 700 : null,
    test: { cible: "section", verbes: ["move"], consigne: "Remonter la section qui porte la promesse au-dessus de tout ce qui n'est pas la navigation." } },
  { id: "st-nav-complete", famille: "st", niches: ["saas", "b2b"], impact: 3, preuve: 3, risque: 2, sortie: "test",
    signal: "Page de campagne servie avec le menu complet du site.",
    pourquoi: "Chaque lien de navigation est une porte de sortie payée par la publicité. Ne s'applique pas en e-commerce : l'en-tête y porte le panier.",
    action: "Retirer la navigation sur une page de campagne.",
    sources: ["cxl"],
    quand: (s, c) => nicheDe(c) === "ecom" ? false : (s.m.nav.presente ? s.m.nav.liens >= 5 : false),
    test: { cible: "nav", verbes: ["remove"], consigne: "Retirer la navigation principale ; garder le logo si c'est un élément séparé." } },
  { id: "st-objections-absentes", famille: "st", niches: tous, impact: 3, preuve: 2, risque: 1, sortie: "conseil",
    signal: "Aucune section ne traite les objections.",
    pourquoi: "Un doute non traité ne devient pas un refus visible : il devient un report de décision.",
    action: "Ajouter un bloc d'objections avant le dernier appel à l'action (voie hébergée : il faut créer une section).",
    sources: ["lift"],
    quand: (s) => j(s) ? !j(s)!.objectionsTraitees.valeur : !s.m.objections.sectionPresente },
  { id: "st-douze-fonctionnalites", famille: "st", niches: tous, impact: 3, preuve: 3, risque: 2, sortie: "conseil",
    signal: "Douze fonctionnalités listées sans hiérarchie.",
    pourquoi: "Quand tout est au même niveau, rien ne ressort.",
    action: "Garder trois à cinq bénéfices, hiérarchisés.",
    sources: ["nng"],
    quand: (s) => s.m.fonctionnalitesListees >= 12 },

  /* ————— la personnalisation ————— */
  { id: "pe-identite", famille: "pe", niches: tous, impact: 3, preuve: 4, risque: 1, sortie: "test",
    signal: "Personnalisation basée sur l'identité : « Bonjour {Entreprise}, nous avons fait ça pour vous ».",
    pourquoi: "Quand le visiteur pense à sa vie privée, ce type de personnalisation se retourne contre la marque.",
    action: "Personnaliser par contexte (source, intention), pas par identité.",
    sources: ["kimhan"],
    quand: (s) => s.m.personnalisationIdentite,
    test: { cible: "titre", verbes: ["set"], consigne: "Retirer toute mention nominative ; parler du contexte du visiteur (ce qu'il cherchait), pas de qui il est." } },

  /* ————— la technique ————— */
  { id: "te-vitesse", famille: "te", niches: tous, impact: 2, preuve: 2, risque: 1, sortie: "conseil",
    signal: "Le plus gros élément visible met plus de 2,5 secondes à s'afficher.",
    pourquoi: "C'est de l'hygiène, pas un levier marketing : la preuve la plus citée est observationnelle.",
    action: "Alléger les images et le code, sans en faire une priorité stratégique.",
    sources: ["deloitte", "cwv"],
    quand: (s) => s.m.vitesse.lcpMs == null ? null : s.m.vitesse.lcpMs > 2500 },
  { id: "te-mesure-cassee", famille: "te", niches: tous, impact: 5, preuve: 4, risque: 1, sortie: "conseil",
    signal: "Le consentement ou la mesure est cassé.",
    pourquoi: "Sans donnée fiable, on ne peut rien optimiser : on décide dans le noir.",
    action: "Réparer la mesure avant de toucher au marketing.",
    sources: ["consent"],
    quand: (s) => (s.m.mesure.gtm || s.m.mesure.gtag || s.m.mesure.meta || s.m.mesure.autres.length > 0) ? null : true },

  /* ————— la méthode ————— */
  { id: "me-volume", famille: "me", niches: tous, impact: 5, preuve: 5, risque: 1, sortie: "methode",
    signal: "Moins de cent mille visiteurs par mois et par variante.",
    pourquoi: "Un petit changement ne sera jamais détectable : le test dira « rien » quoi qu'il arrive.",
    action: "Interdire les micro-tests. Proposer un changement franc, assumé comme une décision.",
    sources: ["kohavi", "georgiev"],
    quand: (_s, c) => c.visiteursMois ? c.visiteursMois < 200_000 : null },
  { id: "me-qualite", famille: "me", niches: tous, impact: 4, preuve: 4, risque: 1, sortie: "methode",
    signal: "La conversion monte mais la qualité baisse.",
    pourquoi: "L'indicateur facile à mesurer trompe sur la valeur réellement créée.",
    action: "Alerter, et suivre l'indicateur situé plus loin dans la chaîne.",
    sources: ["kohavi", "netflix"],
    quand: () => null },
  { id: "me-couleur-bouton", famille: "me", niches: tous, impact: 1, preuve: 3, risque: 1, sortie: "methode",
    signal: "On demande de tester une couleur de bouton.",
    pourquoi: "C'est de la micro-optimisation avant d'avoir réglé l'offre et le message.",
    action: "Déprioriser sous les changements de fond.",
    sources: ["pxl"],
    quand: () => null },

  /* ————— la recherche payante : nos leviers à nous ————— */
  { id: "sea-motcle-titre", famille: "sea", niches: tous, impact: 4, preuve: 4, risque: 1, sortie: "test",
    signal: "Aucun mot-clé acheté n'apparaît dans le titre ni le sous-titre.",
    pourquoi: "Google note la pertinence entre le mot-clé, l'annonce et la page (Quality Score) : un mot-clé absent se paie au clic.",
    action: "Reprendre le mot-clé principal dans le titre, tel que le visiteur l'a tapé.",
    sources: ["google-ads"],
    quand: (s, c) => c.trafic !== "google-search" || !c.annonce.motsCles.length ? null
      : !c.annonce.motsCles.some((k) => (s.m.hero.titre + " " + s.m.hero.sousTitre).toLowerCase().includes(k.toLowerCase())),
    test: { cible: "titre", verbes: ["set"], consigne: "Intégrer le mot-clé principal dans le titre, naturellement, sans le forcer ni le répéter." } },
  { id: "sea-cta-pli-mobile", famille: "sea", niches: tous, impact: 4, preuve: 4, risque: 1, sortie: "test",
    signal: "Sur mobile, aucun bouton d'action n'est visible sans faire défiler.",
    pourquoi: "La majorité des clics payants arrivent sur mobile ; un bouton sous le pli est un bouton que la moitié des visiteurs ne voient pas.",
    action: "Placer un appel à l'action dans le premier écran mobile.",
    sources: ["nng", "google-ads"],
    quand: (s) => s.m.ctas.length ? !s.m.ctaAuDessusDuPliMobile : null,
    test: { cible: "cta", verbes: ["duplicate", "move"], consigne: "Dupliquer le bouton principal juste sous le sous-titre du hero." } },
  { id: "sea-cta-generique", famille: "sea", niches: tous, impact: 3, preuve: 3, risque: 1, sortie: "test",
    signal: "Un bouton d'action dit « Envoyer », « En savoir plus » ou « Cliquez ici ».",
    pourquoi: "Le libellé du bouton est la dernière promesse avant l'action : un verbe vide n'engage à rien.",
    action: "Dire ce que le visiteur obtient en cliquant.",
    sources: ["cxl", "unbounce"],
    // tous les boutons, pas seulement le premier : le « Submit » du formulaire est souvent le
    // dernier de la page, et c'est lui qui convertit
    quand: (s) => s.m.ctas.length ? s.m.ctas.some((x) => CTA_GENERIQUE.test(x.texte)) : null,
    test: { cible: "cta", verbes: ["set"], consigne: "Remplacer le libellé générique (« Submit », « Envoyer », « En savoir plus ») par un libellé qui nomme le résultat, pris dans ce que la page promet (« Voir ma démo », « Commencer l'essai gratuit »)." } },
  { id: "sea-trop-de-ctas", famille: "sea", niches: tous, impact: 3, preuve: 3, risque: 2, sortie: "test",
    signal: "Plus de quatre appels à l'action différents au-dessus du pli.",
    pourquoi: "Chaque bouton en plus divise l'attention ; une page de campagne a une seule action à obtenir.",
    action: "Garder un bouton principal et au plus un secondaire.",
    sources: ["nng"],
    quand: (s) => new Set(s.m.ctas.filter((c) => c.auDessusDuPli).map((c) => c.texte.toLowerCase())).size > 4,
    test: { cible: "cta", verbes: ["remove"], consigne: "Retirer les appels à l'action secondaires du premier écran, garder le principal." } },
]

/** impact × preuve × pertinence ÷ risque, sur 100. La pertinence : niche et trafic. */
export function score(r: Regle, c: Contexte): number {
  const pertinence = r.niches.includes(nicheDe(c)) ? 1 : 0.4
  return Math.round((r.impact * r.preuve * pertinence) / r.risque / 25 * 100)
}
