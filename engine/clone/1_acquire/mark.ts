/**
 * mark.ts — marquage du DOM au moment de la capture.
 *
 * Injecte un identifiant stable `data-lpws` sur ce que les variantes devront manipuler.
 * C'est L'ANCRAGE de toute la suite : `page.json` (4_structure) et `apply` pointent vers
 * ces ids — jamais vers des sélecteurs CSS calculés, qui cassent à la première variante.
 *
 * DEUX passes, deux numérotations indépendantes :
 *   `e<n>`  ÉLÉMENTS — contenu et balises sémantiques, repérés par nom de balise.
 *   `s<n>`  SECTIONS — les bandes de haut niveau, repérées par GÉOMÉTRIE.
 *
 * Pourquoi la géométrie pour les sections : sur un site React/CSS-in-JS moderne, les
 * sections sont des `<div>` sans rôle sémantique (constaté sur Jira : ses neuf bandes sont
 * toutes des div anonymes). Un marquage par balise ne leur donne aucune poignée — donc
 * aucune variante ne peut les déplacer, les retirer ni en dupliquer une. Une bande pleine
 * largeur, assez haute, enfant direct du flux principal : c'est une section, quelle que
 * soit sa balise.
 *
 * Les deux numérotations sont séparées pour qu'ajouter la passe structurelle ne décale pas
 * les ids de contenu (les specs de variantes existantes restent valides).
 *
 * La numérotation suit l'ordre du document → déterministe : deux captures du même DOM
 * donnent les mêmes ids.
 *
 * S'exécute DANS la page (via page.evaluate) : ne rien importer ici.
 */

/** Marque le DOM. Retourne le nombre d'éléments et de sections marqués. */
export function markDom(): { elements: number; sections: number } {
  // structure (sections de haut niveau) + contenu (ce qu'une variante voudra éditer)
  const SELECTOR = [
    // structure
    "main", "header", "footer", "nav", "section", "article", "aside",
    // contenu
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "li", "blockquote", "figcaption",
    "a", "button",
    "img", "picture", "video", "svg",
    "form", "input", "textarea", "select", "label",
  ].join(",")

  let n = 0
  document.querySelectorAll(SELECTOR).forEach((el) => {
    // les svg décoratifs imbriqués dans un élément déjà marqué n'apportent rien
    if (el.tagName.toLowerCase() === "svg" && (el.parentElement?.closest("a,button") ?? null)) return
    el.setAttribute("data-lpws", `e${++n}`)
  })

  /* ——— passe structurelle : les bandes de haut niveau, par géométrie ——— */

  const MIN_H = 120          // sous cette hauteur, c'est un composant, pas une bande
  const LARGEUR_MIN = 0.8    // une section occupe la largeur de son conteneur

  /**
   * Descend jusqu'au vrai conteneur de sections. Les pages modernes empilent des div
   * d'enrobage ; il faut les traverser sans s'arrêter au premier niveau où il y a plusieurs
   * enfants — sur une page sans <main>, le body a pour enfants le bandeau, l'en-tête, LE
   * CONTENU, le pied de page et des overlays (constaté sur HubSpot : la descente s'arrêtait
   * au body et ne voyait que 4 « sections »).
   *
   * Règle : on descend tant qu'un enfant DOMINE — soit il est seul à être haut, soit il
   * porte l'essentiel de la hauteur du conteneur et écrase largement le suivant.
   */
  function conteneurDeSections(): Element {
    let c: Element = document.querySelector("main") ?? document.body
    for (let i = 0; i < 10; i++) {
      const hauts = [...c.children]
        .map((k) => ({ el: k, h: k.getBoundingClientRect().height }))
        .filter((k) => k.h > MIN_H)
        .sort((a, b) => b.h - a.h)
      if (hauts.length === 0) break
      if (hauts.length === 1) { c = hauts[0].el; continue }
      // plusieurs enfants hauts : ne descendre que si le premier écrase les autres
      const total = c.getBoundingClientRect().height || 1
      const domine = hauts[0].h > total * 0.6 && hauts[0].h > hauts[1].h * 2
      if (!domine) break
      c = hauts[0].el
    }
    return c
  }

  const conteneur = conteneurDeSections()
  const largeurRef = conteneur.getBoundingClientRect().width || window.innerWidth
  let s = 0
  for (const bande of [...conteneur.children]) {
    const r = bande.getBoundingClientRect()
    if (r.height < MIN_H || r.width < largeurRef * LARGEUR_MIN) continue
    // déjà marquée (balise sémantique) : elle a sa poignée, on n'en pose pas deux
    if (bande.hasAttribute("data-lpws")) { s++; continue }
    bande.setAttribute("data-lpws", `s${++s}`)
  }

  // header / footer / nav vivent hors du conteneur : ils sont déjà marqués par la passe
  // élément, donc déjà déplaçables et supprimables — rien à ajouter.

  return { elements: n, sections: s }
}
