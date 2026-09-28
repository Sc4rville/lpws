/**
 * modele.ts — le seul endroit qui parle au modèle.
 *
 * Le modèle tourne sur les crédits du plan (`claude -p`, compte connecté), pas sur l'API au
 * jeton. Sa réponse n'est jamais crue sur parole : on en extrait le JSON, il passe le schéma, et
 * une réponse hors format est réessayée puis déclarée absente (`null`). Jamais une supposition.
 */
import { spawn } from "node:child_process"
import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { z } from "zod"
import { step } from "./log.ts"
import { premierEcart } from "./json.ts"

/**
 * CE QUE COÛTE UN APPEL : `claude -p --output-format json` rapporte sa durée et son coût. Chaque
 * appel s'ajoute à clients/couts.jsonl, pour répondre à la question qui conditionne la grille
 * tarifaire (docs/business-model-rapport.md §8, décision 2) : combien coûte un diagnostic ?
 * Lecture : `npm run couts`.
 */
export const JOURNAL_COUTS = join("clients", "couts.jsonl")
export type Cout = { quand: string; scope: string; modele: string; dureeMs: number | null; coutUsd: number | null; jetonsEntree: number | null; jetonsSortie: number | null; campagne?: string }

async function noterCout(scope: string, brut: Record<string, unknown>): Promise<void> {
  const u = (brut.usage ?? {}) as Record<string, number | undefined>
  const n = (x: unknown) => typeof x === "number" ? x : null
  const c: Cout = { quand: new Date().toISOString(), scope, modele: process.env.LPWS_MODELE ?? "sonnet",
    dureeMs: n(brut.duration_ms), coutUsd: n(brut.total_cost_usd),
    jetonsEntree: u.input_tokens !== undefined ? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : null,
    jetonsSortie: n(u.output_tokens), campagne: process.env.LPWS_CAMPAGNE }
  try { await mkdir("clients", { recursive: true }); await appendFile(JOURNAL_COUTS, JSON.stringify(c) + "\n") } catch {}
}

/** Le texte brut répondu par `claude -p`. Modèle : LPWS_MODELE, sinon sonnet. */
export function demander(prompt: string, scope = "modele"): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn("claude", ["-p", "--output-format", "json", "--model", process.env.LPWS_MODELE ?? "sonnet"], { stdio: ["pipe", "pipe", "pipe"] })
    let out = "", err = ""
    p.stdout.on("data", (d) => out += d)
    p.stderr.on("data", (d) => err += d)
    p.on("error", (e) => ko(e))
    p.on("close", (code) => {
      if (code !== 0) return ko(new Error(`claude -p a quitté avec ${code} : ${err.slice(0, 200)}`))
      let brut: Record<string, unknown> | null = null
      try { brut = JSON.parse(out) } catch {}
      if (!brut) return ok(out)
      noterCout(scope, brut).finally(() => ok(String(brut!.result ?? "")))
    })
    p.stdin.write(prompt); p.stdin.end()
  })
}

/** Le JSON contenu dans une réponse, du premier ouvrant au dernier fermant. */
export function extraireJson(t: string, forme: "objet" | "liste"): string {
  const [o, f] = forme === "objet" ? ["{", "}"] : ["[", "]"]
  const i = t.indexOf(o), j = t.lastIndexOf(f)
  return i >= 0 && j > i ? t.slice(i, j + 1) : t
}

/** La réponse validée par `schema`, ou `null` après `essais` réponses refusées. */
export async function demanderValide<S extends z.ZodTypeAny>(
  scope: string, prompt: string, schema: S, forme: "objet" | "liste", essais = 2,
): Promise<z.infer<S> | null> {
  for (let essai = 1; essai <= essais; essai++) {
    try {
      const r = schema.safeParse(JSON.parse(extraireJson(await demander(prompt, scope), forme)))
      if (r.success) { step(scope, `réponse du modèle au contrat (essai ${essai})`); return r.data }
      step(scope, `réponse hors schéma (essai ${essai}) : ${premierEcart(r.error)}`)
    } catch (e) {
      step(scope, `échec (essai ${essai}) : ${String((e as Error).message).slice(0, 160)}`)
    }
  }
  return null
}
