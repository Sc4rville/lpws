/**
 * selector.ts — transformer une cible en un CHEMIN COURT, vérifié, qu'un navigateur résout en
 * une fraction de milliseconde.
 *
 * Pourquoi ce fichier existe : la première version du tag refaisait tout le rapprochement
 * d'empreintes dans le navigateur du visiteur. Mesuré sur atlassian.com, ~700 ms de calcul par
 * essai (471 empreintes × 471 éléments) et 97 à 188 Ko de charge utile, page masquée 1,5 s.
 * Sur une page dont le Quality Score dépend de la vitesse, c'est disqualifiant.
 *
 * Le rapprochement se fait donc À LA CONSTRUCTION, où le temps est gratuit et où on a déjà un
 * navigateur. Ici on en tire un sélecteur CSS, et on ne garde que lui : la config est passée de
 * 97 Ko à 1 Ko.
 *
 * Ce que le sélecteur N'EST PAS : une garantie. Il peut désigner autre chose demain. Il voyage
 * donc toujours avec un TÉMOIN (rôle + début de texte) que le runtime revérifie avant d'écrire.
 * Le sélecteur dit *où regarder*, le témoin dit *si c'est bien lui*.
 *
 * UNE SEULE FONCTION EXPORTÉE, et c'est imposé : `page.evaluate` n'envoie dans la page que le
 * corps de la fonction appelée. Toute aide définie à côté n'existe pas là-bas — `ReferenceError`,
 * payé deux fois avant de le retenir.
 *
 * S'exécute DANS la page : ne rien importer ici.
 */

/** Ce qu'on embarque pour une cible : où regarder, et comment savoir que c'est bien elle. */
export type Cible = {
  /** sélecteur CSS résolu et vérifié unique au moment de la construction */
  sel: string
  /** le témoin d'identité, revérifié dans le navigateur du visiteur avant toute écriture */
  role: string
  /** début du texte au moment de la construction — tronqué, c'est un témoin pas une copie */
  texte: string
}

/**
 * Deux usages, un seul code.
 *
 * `{ ancres }` : dérive un sélecteur pour chaque élément marqué `data-lpws`. C'est la première
 * passe, sur la page complètement chargée et scrollée, là où le rapprochement d'ancres marche.
 *
 * `{ cibles }` : REVÉRIFIE des sélecteurs sur l'état de page que voit vraiment le visiteur, et
 * les refait s'ils ne tiennent pas. Le piège, payé sur atlassian.com : un chemin positionnel
 * du genre `div:nth-of-type(1) > div > div:nth-of-type(2) > div > p` ne désigne plus rien sur
 * une page à moitié formée, alors qu'un sélecteur par classe stable tenait dès 200 ms. Quand
 * le sélecteur lâche, on repart du témoin — rôle et texte ne dépendent d'aucune structure.
 */
export function resoudreCibles(
  arg: { ancres?: string[]; cibles?: Record<string, Cible> },
): Record<string, Cible | null> {
  const jetable = (c: string) =>
    /^(css|sc|jsx|emotion|styles?)[-_][a-z0-9]{4,}$/i.test(c)
    || /^[a-z]{1,3}[-_]?[0-9a-f]{6,}$/i.test(c)
    || /^[0-9a-f]{8,}$/i.test(c)

  const echappe = (v: string) =>
    (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape?.(v)
    ?? v.replace(/["\\]/g, "\\$&")

  const roleDe = (n: Element): string => {
    const t = n.tagName.toLowerCase()
    if (/^h[1-6]$/.test(t)) return "heading"
    if (t === "a" || t === "button") return "link"
    if (t === "img" || t === "picture" || t === "video" || t === "svg") return "media"
    if (t === "input" || t === "textarea" || t === "select" || t === "label") return "field"
    if (t === "p" || t === "li" || t === "blockquote" || t === "figcaption") return "text"
    return "bande"
  }

  const norme = (x: Element): string =>
    (x.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60)

  const pas = (n: Element): string => {
    const p = n.parentElement
    if (!p) return n.tagName.toLowerCase()
    const freres = [...p.children].filter((f) => f.tagName === n.tagName)
    const i = freres.indexOf(n) + 1
    return freres.length === 1 ? n.tagName.toLowerCase() : `${n.tagName.toLowerCase()}:nth-of-type(${i})`
  }

  /** Dérive le sélecteur le plus court qui désigne CET élément et lui seul. */
  const deriver = (el: Element | null): Cible | null => {
    if (!el) return null
    const seul = (sel: string): boolean => {
      try {
        const trouve = document.querySelectorAll(sel)
        return trouve.length === 1 && trouve[0] === el
      } catch { return false }
    }

    /* 1. les poignées que le site a posées lui-même : elles ont un sens, elles durent */
    const candidats: string[] = []
    const id = el.getAttribute("id")
    if (id && !jetable(id) && !/^\d/.test(id)) candidats.push(`#${echappe(id)}`)
    for (const attr of ["data-testid", "data-test", "data-cy", "data-qa", "name", "aria-label"]) {
      const v = el.getAttribute(attr)
      if (v && v.length < 80) candidats.push(`[${attr}="${v.replace(/"/g, '\\"')}"]`)
    }
    const tag = el.tagName.toLowerCase()
    const classes = [...el.classList].filter((c) => c && !jetable(c))
    if (classes.length) candidats.push(tag + classes.slice(0, 3).map((c) => "." + echappe(c)).join(""))
    for (const c of candidats) if (seul(c)) return { sel: c, role: roleDe(el), texte: norme(el) }

    /* 2. sinon un chemin par position, MAIS ancré sur une poignée stable.
     *
     * Un chemin purement positionnel comme `div:nth-of-type(1) > div > div:nth-of-type(2) > p`
     * est un piège : il est unique sur la page finie et désigne autre chose sur la page en
     * cours de formation. Mesuré sur atlassian.com — le titre, lui, avait une classe stable et
     * tenait dès 200 ms. On exige donc qu'un ancêtre nommé (id, attribut de test, ou classe
     * non hachée) ouvre le chemin. Sans lui, on préfère ne rien rendre : l'aval refusera la
     * variante à la construction plutôt que de la voir clignoter chez le visiteur. */
    let chemin = pas(el)
    let n: Element | null = el.parentElement
    for (let d = 0; d < 12 && n; d++) {
      const pid = n.getAttribute("id")
      if (pid && !jetable(pid) && !/^\d/.test(pid)) {
        const essai = `#${echappe(pid)} > ${chemin}`
        if (seul(essai)) return { sel: essai, role: roleDe(el), texte: norme(el) }
      }
      for (const attr of ["data-testid", "data-test", "data-cy", "data-qa"]) {
        const v = n.getAttribute(attr)
        if (!v || v.length >= 80) continue
        const essai = `[${attr}="${v.replace(/"/g, '\\"')}"] ${chemin}`
        if (seul(essai)) return { sel: essai, role: roleDe(el), texte: norme(el) }
      }
      const pcls = [...n.classList].filter((c) => c && !jetable(c))
      if (pcls.length) {
        const essai = `${n.tagName.toLowerCase()}${pcls.slice(0, 2).map((c) => "." + echappe(c)).join("")} ${chemin}`
        if (seul(essai)) return { sel: essai, role: roleDe(el), texte: norme(el) }
      }
      chemin = `${pas(n)} > ${chemin}`
      n = n.parentElement
    }
    return null
  }

  const out: Record<string, Cible | null> = {}

  if (arg.ancres) {
    for (const a of arg.ancres) out[a] = deriver(document.querySelector(`[data-lpws="${a}"]`))
    return out
  }

  for (const [a, c] of Object.entries(arg.cibles ?? {})) {
    let el: Element | null = null
    try { el = document.querySelector(c.sel) } catch { el = null }
    const colle = (x: Element) => {
      const t = norme(x)
      return roleDe(x) === c.role && (t === c.texte || t.indexOf(c.texte) === 0 || c.texte.indexOf(t) === 0)
    }
    if (el && colle(el)) { out[a] = deriver(el); continue }

    // le sélecteur ne tient pas sur cet état : on repart du témoin
    const tous = [...document.querySelectorAll("*")]
    const exact = tous.filter((n) => roleDe(n) === c.role && norme(n) === c.texte)
    const proches = exact.length ? exact
      : tous.filter((n) => roleDe(n) === c.role && c.texte.length > 8 && norme(n).indexOf(c.texte) === 0)
    out[a] = proches.length === 1 ? deriver(proches[0]) : null
  }
  return out
}
