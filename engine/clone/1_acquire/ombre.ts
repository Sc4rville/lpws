/**
 * LE SHADOW DOM N'EST PAS DANS outerHTML. Un composant (Lightning chez Salesforce : en-tête,
 * barre de recherche, lecteur vidéo, pied de page) rend son contenu dans une racine fantôme que
 * toute sérialisation ignore : dans le clone il reste un trou blanc.
 *
 * On recopie chaque racine ouverte en <template shadowrootmode="open"> : l'analyseur HTML la
 * rattache au rechargement. Et comme il la rattache, le gabarit disparaît du DOM : chaque
 * étape qui recharge puis réécrit capture.html (2_styles, 3_assets, apply) doit rappeler cette
 * fonction juste avant `page.content()`, sinon l'ombre est perdue à nouveau.
 *
 * Les feuilles construites (adoptedStyleSheets) deviennent des <style> dans le gabarit. Une
 * racine FERMÉE est inaccessible : elle reste un trou.
 *
 * Fonction PAGE (page.evaluate) : autonome, sans import.
 */
export function recopieOmbre(): number {
  let n = 0
  const parcourir = (racine: Document | ShadowRoot): void => {
    racine.querySelectorAll("*").forEach((el) => {
      const sr = el.shadowRoot
      if (!sr) return
      el.querySelectorAll(":scope > template[shadowrootmode]").forEach((t) => t.remove())
      parcourir(sr)
      const t = document.createElement("template")
      t.setAttribute("shadowrootmode", "open")
      if (sr.delegatesFocus) t.setAttribute("shadowrootdelegatesfocus", "")
      let css = ""
      for (const sheet of sr.adoptedStyleSheets ?? []) {
        try { css += [...sheet.cssRules].map((r) => r.cssText).join("\n") + "\n" } catch { /* inaccessible */ }
      }
      t.innerHTML = (css ? `<style>${css}</style>` : "") + sr.innerHTML
      el.prepend(t)
      n++
    })
  }
  parcourir(document)
  return n
}
