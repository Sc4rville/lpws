/**
 * fingerprint.ts — l'EMPREINTE d'un élément marqué : ce qu'il EST, pas où il est.
 *
 * `e231` ne dit rien d'autre que « le 231ᵉ élément dans l'ordre du document au moment de la
 * capture ». Un paragraphe ajouté en haut de page et le numéro désigne autre chose, sans que
 * rien ne s'en aperçoive. L'empreinte est le nom qui manque : rôle, texte, classes, chemin
 * des parents, section d'appartenance, rang dans cette section.
 *
 * Elle ne remplace pas l'ancre (l'ancre reste la poignée d'`apply`) : elle permet de la
 * RE-LIER d'une capture à la suivante (cf. relink.ts) et de REFUSER une édition dont la
 * cible a changé de nature.
 *
 * Rien n'est pondéré ici : ce fichier ne fait que constater. La décision « est-ce le même
 * élément ? » appartient à relink.ts, qui est testable sans navigateur.
 *
 * S'exécute DANS la page (via page.evaluate), APRÈS markDom : ne rien importer ici.
 */

export type Empreinte = {
  /** « fermee » : sous une racine fantôme fermée, la balise ne pourra pas y écrire chez le visiteur */
  ombre?: "fermee"
  /** l'ancre observée à cette capture — un rang, donc instable : c'est tout le problème */
  a: string
  tag: string
  /** famille stable : un h2 qui devient h3 reste un titre */
  role: "heading" | "text" | "link" | "media" | "field" | "bande" | "autre"
  /** texte normalisé, tronqué — le signal le plus fort quand il existe */
  text: string
  /** classes, hachages de build retirés (CSS-in-JS régénère `css-1x2y3z` à chaque build) */
  cls: string[]
  /** les quatre derniers ancêtres, en balises */
  path: string
  /** l'ancre de la section contenante */
  sect: string
  /** rang parmi les éléments de même rôle DE CETTE SECTION (stable si la section ne bouge pas) */
  rang: number
  /** dernier segment d'url — très discriminant pour un lien ou une image */
  cible: string
}

export function fingerprintDom(): Empreinte[] {
  // LES ANCRES DESCENDENT DANS LE SHADOW DOM (racines ouvertes). En-tête, recherche, vidéo,
  // pied chez Salesforce (Lightning) vivent là : sans ça, visibles dans le clone, jamais éditables.
  // Fonction de page : les aides sont recopiées ici, page.evaluate n'embarque que ce corps.
  const racinesDom = (): (Document | ShadowRoot)[] => {
    const out: (Document | ShadowRoot)[] = [document]
    for (let i = 0; i < out.length; i++) out[i].querySelectorAll("*").forEach((el) => { if (el.shadowRoot) out.push(el.shadowRoot) })
    return out
  }
  const tous = (sel: string): Element[] => racinesDom().flatMap((r) => [...r.querySelectorAll(sel)])
  const parentDe = (el: Element): Element | null => el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null)
  const roleDe = (el: Element): Empreinte["role"] => {
    const t = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(t)) return "heading"
    if (t === "a" || t === "button") return "link"
    if (t === "img" || t === "picture" || t === "video" || t === "svg") return "media"
    if (t === "input" || t === "textarea" || t === "select" || t === "label") return "field"
    if (t === "p" || t === "li" || t === "blockquote" || t === "figcaption") return "text"
    if (t === "section" || t === "main" || t === "header" || t === "footer" || t === "nav"
      || t === "article" || t === "aside" || t === "div") return "bande"
    return "autre"
  }

  const texteDe = (el: Element): string =>
    (el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 140)

  // une classe qui ressemble à un hachage de build ne survit pas au prochain déploiement
  const jetable = (c: string) =>
    /^(css|sc|jsx|emotion|styles?)[-_][a-z0-9]{4,}$/i.test(c)
    || /^[a-z]{1,3}[-_]?[0-9a-f]{6,}$/i.test(c)
    || /^[0-9a-f]{8,}$/i.test(c)

  const classesDe = (el: Element): string[] =>
    [...el.classList].filter((c) => c && !jetable(c)).sort().slice(0, 12)

  const cheminDe = (el: Element): string => {
    const p: string[] = []
    let c: Element | null = parentDe(el)
    for (let i = 0; i < 4 && c; i++) { p.unshift(c.tagName.toLowerCase()); c = parentDe(c) }
    return p.join(">")
  }

  const cibleDe = (el: Element): string => {
    const brut = el.getAttribute("href") ?? el.getAttribute("src") ?? ""
    if (!brut) return ""
    // le dernier segment seulement : les CDN changent d'hôte et de paramètres, pas de fichier
    const sansQuery = brut.split("?")[0].split("#")[0]
    return sansQuery.split("/").filter(Boolean).pop()?.toLowerCase().slice(0, 80) ?? ""
  }

  const sectionDe = (el: Element): string => {
    let c: Element | null = parentDe(el)
    while (c) {
      const a = c.getAttribute("data-lpws")
      if (a && /^s\d+$/.test(a)) return a
      c = parentDe(c)
    }
    return ""
  }

  const out: Empreinte[] = []
  const compteurs = new Map<string, number>()

  // un élément sous un hôte dont la racine était FERMÉE : visible dans le clone (on l'a ouverte à
  // la capture), mais la balise, chez le visiteur, n'y entrera pas
  const sousOmbreFermee = (el: Element): boolean => {
    let n: Node | null = el
    while (n) {
      const racine = n.getRootNode()
      if (!(racine instanceof ShadowRoot)) return false
      if ((racine.host as Element & { __lpwsOmbreFermee?: boolean }).__lpwsOmbreFermee) return true
      n = racine.host
    }
    return false
  }
  tous("[data-lpws]").forEach((el) => {
    const a = el.getAttribute("data-lpws")
    if (!a) return
    const role = roleDe(el)
    const sect = /^s\d+$/.test(a) ? a : sectionDe(el)
    const clef = `${sect}|${role}`
    const rang = (compteurs.get(clef) ?? 0) + 1
    compteurs.set(clef, rang)

    out.push({ ...(sousOmbreFermee(el) ? { ombre: "fermee" as const } : {}),
      a,
      tag: el.tagName.toLowerCase(),
      role,
      text: texteDe(el),
      cls: classesDe(el),
      path: cheminDe(el),
      sect,
      rang,
      cible: cibleDe(el),
    })
  })

  return out
}
