/**
 * mark.ts — marquage du DOM au moment de la capture.
 *
 * Injecte un identifiant stable `data-lpws="e<n>"` sur chaque élément porteur de contenu
 * ou de structure. C'est L'ANCRAGE de toute la suite : `page.json` (4_structure) et `apply`
 * (round-trip) pointent vers ces ids — jamais vers des sélecteurs CSS calculés, qui cassent
 * à la première variante.
 *
 * La numérotation suit l'ordre du document → déterministe : deux captures du même DOM
 * donnent les mêmes ids.
 *
 * S'exécute DANS la page (via page.evaluate) : ne rien importer ici.
 */

/** Marque le DOM. Retourne le nombre d'éléments marqués. */
export function markDom(): number {
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
  return n
}
