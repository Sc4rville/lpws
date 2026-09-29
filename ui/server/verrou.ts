const prises = new Set<string>()

export function verrouillerCampagne(cle: string): () => void {
  if (prises.has(cle))
    throw Object.assign(new Error("Une autre opération est déjà en cours sur cette page : attendez qu’elle finisse, puis réessayez."), { code: 409 })
  prises.add(cle)
  let rendu = false
  return () => { if (!rendu) { rendu = true; prises.delete(cle) } }
}

export async function avecCampagne<T>(cle: string, action: () => Promise<T>): Promise<T> {
  const liberer = verrouillerCampagne(cle)
  try { return await action() } finally { liberer() }
}
