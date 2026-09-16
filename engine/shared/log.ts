/**
 * log.ts — journal uniforme de l'engine.
 *
 * Toutes les familles loggent pareil : `[famille/étape] message (durée)`.
 * Un seul format → les sorties de la machine restent lisibles quand elle grossit.
 */

export function step(scope: string, msg: string): void {
  process.stderr.write(`[${scope}] ${msg}\n`)
}

/** Chronomètre une opération et logge sa durée. */
export async function timed<T>(scope: string, msg: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const out = await fn()
  step(scope, `${msg} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  return out
}

/** Échec franc : on dit pourquoi et on sort. Jamais de demi-résultat silencieux. */
export function fail(scope: string, msg: string): never {
  process.stderr.write(`[${scope}] ÉCHEC — ${msg}\n`)
  process.exit(1)
}
