/**
 * design.ts — récolte le DESIGN SYSTEM d'une page capturée.
 *
 * Le problème que ça résout : `duplicate` ne sait réutiliser que les blocs déjà présents.
 * Si la page du client n'a pas de bloc « objections », on ne peut pas en fabriquer un.
 *
 * Ici on ne copie plus un bloc, on récolte des RÔLES : à quoi ressemble un titre de section
 * chez ce client, un paragraphe d'accroche, une carte, un bouton principal, une bande sombre.
 * Chaque rôle est un nom de balise + la chaîne de classes de l'exemplaire trouvé sur la page.
 *
 * Pourquoi ça préserve le design au pixel : sur un site moderne, tout le style vit dans ces
 * classes (CSS atomique, CSS-in-JS). En les réutilisant, on n'écrit aucune règle CSS — on
 * réemploie celles du client. Le clone étant self-contained, elles sont déjà dans le dossier.
 *
 * S'exécute DANS la page (via page.evaluate) : ne rien importer ici.
 */

export type Role = { tag: string; cls: string }
export type DesignSystem = {
  band?: Role        // la bande de section (padding vertical, fond clair)
  bandDark?: Role    // une bande à fond sombre, si la page en a une
  darkTitle?: Role   // titre TEL QU'ÉCRIT dans la bande sombre (sinon texte noir sur fond noir)
  darkText?: Role
  darkCta?: Role
  container?: Role   // le conteneur centré qui borne la largeur du contenu
  /** la chaîne d'emboîtement exacte, de la bande jusqu'au parent de la grille : c'est elle
   *  qui produit la gouttière et l'alignement. Un seul conteneur ne suffit pas. */
  chain?: Role[]
  title?: Role       // titre de section
  subtitle?: Role    // accroche sous le titre
  grid?: Role        // conteneur de colonnes
  card?: Role        // une colonne
  cardTitle?: Role
  cardText?: Role
  ctaPrimary?: Role  // bouton d'action principal
  manques: string[]  // rôles introuvables — dit honnêtement ce qu'on ne saura pas reproduire
}

/** Récolte les rôles. Retourne aussi la liste des rôles introuvables. */
export function harvestDesign(bandesConnues: string[] = []): DesignSystem {
  const ds: DesignSystem = { manques: [] }
  const role = (el: Element | null | undefined): Role | undefined =>
    el ? { tag: el.tagName.toLowerCase(), cls: el.getAttribute("class") ?? "" } : undefined
  const box = (el: Element) => el.getBoundingClientRect()
  const visible = (el: Element) => { const r = box(el); return r.width > 4 && r.height > 4 }
  const selBandes = ['[data-lpws^="s"]', ...bandesConnues.map((a) => `[data-lpws="${a}"]`)].join(",")
  const bandes = [...document.querySelectorAll(selBandes)].filter(visible)

  /* — titre de section : la classe de titre la PLUS FRÉQUENTE dans les bandes.
       Prendre le plus gros donnerait le titre du héros — un cas particulier, pas le
       gabarit courant des sections (constaté sur Jira : titre démesuré et mal aligné). — */
  const candidats = bandes.flatMap((b) => [...b.querySelectorAll("h2,h3")])
    .filter((h) => visible(h) && (h.textContent ?? "").trim().length > 3)
  const freq = new Map<string, { h: Element; n: number; taille: number }>()
  for (const h of candidats) {
    const k = h.getAttribute("class") ?? ""
    const e = freq.get(k)
    if (e) e.n++
    else freq.set(k, { h, n: 1, taille: parseFloat(getComputedStyle(h).fontSize) || 0 })
  }
  const titre = [...freq.values()].sort((a, b) => b.n - a.n || b.taille - a.taille)[0]?.h
  ds.title = role(titre)

  /* — accroche : le paragraphe qui suit immédiatement ce titre — */
  if (titre) {
    let n = titre.nextElementSibling
    while (n && !(n.tagName === "P" && visible(n))) n = n.nextElementSibling
    ds.subtitle = role(n)
  }

  /* — bande + conteneur : on réemploie le conteneur EXACT de ce titre plutôt qu'un ancêtre
       choisi par sa largeur — c'est lui qui porte la gouttière et l'alignement. — */
  const bande = titre?.closest(selBandes) ?? bandes[0]
  ds.band = role(bande)
  // le conteneur définitif est choisi plus bas : celui de la grille porte la gouttière,
  // celui du titre ne l'a pas toujours (constaté sur Jira : titre collé au bord gauche)
  const contenreurDuTitre = titre?.parentElement && titre.parentElement !== bande
    ? titre.parentElement : null

  /* — grille + carte : un parent dont au moins 2 enfants ont une largeur voisine et sont côte à côte — */
  let meilleure: { g: Element; n: number } | null = null
  const ordre = bande ? [bande, ...bandes.filter((b) => b !== bande)] : bandes
  for (const b of ordre) {
    for (const cand of [b, ...b.querySelectorAll("div,ul,section")]) {
      const kids = [...cand.children].filter((k) => visible(k) && box(k).width > 140)
      if (kids.length < 2) continue
      const r0 = box(kids[0]), r1 = box(kids[1])
      const memeLigne = Math.abs(r0.y - r1.y) < 40
      const memeLargeur = Math.abs(r0.width - r1.width) < r0.width * 0.15
      const bornees = box(cand).width > r0.width * 1.5
      if (!memeLigne || !memeLargeur || !bornees) continue
      // on préfère 3 colonnes, sinon le plus de colonnes
      const score = (kids.length === 3 ? 100 : kids.length) + (b === bande ? 1000 : 0)
      if (!meilleure || score > meilleure.n) meilleure = { g: cand, n: score }
    }
  }
  if (meilleure) {
    const carte = [...meilleure.g.children].filter(visible)[0]
    ds.grid = role(meilleure.g)
    ds.card = role(carte)
    ds.cardTitle = role(carte?.querySelector("h2,h3,h4,h5"))
    ds.cardText = role(carte?.querySelector("p"))
  }

  /* — conteneur + chaîne d'emboîtement : on relève TOUS les wrappers entre la bande et la
       grille. Reconstruire un seul conteneur laissait le titre collé au bord gauche. — */
  const ancre = meilleure?.g ?? titre
  const chaine: Role[] = []
  if (ancre && bande) {
    let cur: Element | null = ancre.parentElement
    while (cur && cur !== bande && cur !== document.body) {
      const r = role(cur)
      if (r) chaine.unshift(r)
      cur = cur.parentElement
    }
  }
  ds.chain = chaine.length ? chaine : undefined
  ds.container = chaine[chaine.length - 1] ?? role(contenreurDuTitre)

  /* — bouton principal : le lien/bouton avec un fond opaque, le plus fréquent — */
  const parClasse = new Map<string, { el: Element; n: number }>()
  for (const el of document.querySelectorAll("a,button")) {
    if (!visible(el)) continue
    const r = box(el)
    if (r.height < 28 || r.width < 70) continue
    const bg = getComputedStyle(el).backgroundColor
    const opaque = bg && !/rgba?\((?:0,\s*0,\s*0,\s*0|.*,\s*0(?:\.0+)?)\)/.test(bg) && bg !== "transparent"
    if (!opaque) continue
    const k = el.getAttribute("class") ?? ""
    const e = parClasse.get(k)
    if (e) e.n++; else parClasse.set(k, { el, n: 1 })
  }
  ds.ctaPrimary = role([...parClasse.values()].sort((a, b) => b.n - a.n)[0]?.el)

  /* — une bande sombre, si la page en a une (pour les bandeaux d'appel à l'action) — */
  const sombre = bandes.find((b) => {
    const m = getComputedStyle(b).backgroundColor.match(/\d+/g)
    if (!m) return false
    const [r, g, bl] = m.map(Number)
    return (0.299 * r + 0.587 * g + 0.114 * bl) < 90 && box(b).height > 120
  })
  ds.bandDark = role(sombre)
  // les rôles d'une bande sombre se récoltent DANS la bande : réutiliser le titre d'une
  // section claire donnerait du texte noir sur fond noir
  if (sombre) {
    ds.darkTitle = role(sombre.querySelector("h1,h2,h3"))
    ds.darkText = role([...sombre.querySelectorAll("p")].filter(visible)[0])
    ds.darkCta = role([...sombre.querySelectorAll("a,button")]
      .filter((el) => visible(el) && box(el).height >= 28 && box(el).width >= 70)[0])
  }

  for (const [k, v] of Object.entries(ds))
    if (k !== "manques" && !v) ds.manques.push(k)
  return ds
}
