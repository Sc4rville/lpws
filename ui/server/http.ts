import type { IncomingMessage } from "node:http"

export function lireCorps(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((ok, ko) => {
    const lots: Buffer[] = []
    let n = 0, mort = false
    const echouer = (e: Error) => { if (!mort) { mort = true; req.resume(); ko(e) } }
    let trop = false
    req.on("data", (d: Buffer) => {
      if (mort) return
      n += d.length
      if (n > max) trop = true
      else if (!trop) lots.push(d)
    })
    req.on("end", () => {
      if (mort) return
      mort = true
      if (trop) ko(Object.assign(new Error("corps trop volumineux"), { code: 413 }))
      else ok(Buffer.concat(lots))
    })
    req.on("error", echouer)
    req.on("aborted", () => echouer(Object.assign(new Error("requête interrompue"), { code: 400 })))
  })
}

export async function corpsJson(req: IncomingMessage, max = 2_000_000): Promise<Record<string, any>> {
  const brut = await lireCorps(req, max)
  let v: unknown = {}
  try { v = brut.length ? JSON.parse(brut.toString("utf8")) : {} }
  catch { throw Object.assign(new Error("JSON invalide"), { code: 400 }) }
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw Object.assign(new Error("un objet JSON est attendu"), { code: 400 })
  return v as Record<string, any>
}
