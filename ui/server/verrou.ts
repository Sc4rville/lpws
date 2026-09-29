/** verrou.ts : une seule mutation à la fois par campagne.
 *
 * Lancer, arrêter ou créer un test réécrit tests.json puis republie la balise : deux
 * opérations simultanées sur la même page s'écraseraient l'une l'autre. On refuse la
 * seconde (409) plutôt que de la faire patienter en silence — un appel qui attendrait
 * agirait sur un état que l'appelant n'a pas vu.
 */
const prises = new Set<string>()

/** Prend le verrou de la campagne tout de suite (pas de file) ; rend la fonction qui le rend. */
export function verrouillerCampagne(cle: string): () => void {
  if (prises.has(cle))
    throw Object.assign(new Error("Une autre opération est déjà en cours sur cette page : attendez qu’elle finisse, puis réessayez."), { code: 409 })
  prises.add(cle)
  let rendu = false
  return () => { if (!rendu) { rendu = true; prises.delete(cle) } }
}

/** Prend le verrou, fait l'action, le rend quoi qu'il arrive. */
export async function avecCampagne<T>(cle: string, action: () => Promise<T>): Promise<T> {
  const liberer = verrouillerCampagne(cle)
  try { return await action() } finally { liberer() }
}
