/** adresse.ts : une instance hébergée n'ouvre pas les adresses de son propre réseau (audit, capture). */
import { BlockList, isIP } from "node:net"
import { lookup } from "node:dns/promises"

/** En local (sans LPWS_MOT_DE_PASSE), la démo sur localhost doit rester auditable ; LPWS_AUDIT_LOCAL=1 force l'autorisation. */
const LOCAL_AUTORISE = !process.env.LPWS_MOT_DE_PASSE || process.env.LPWS_AUDIT_LOCAL === "1"

const INTERNES = new BlockList()
for (const [r, n] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const)
  INTERNES.addSubnet(r, n, "ipv4")
for (const [r, n] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) INTERNES.addSubnet(r, n, "ipv6")

export const estInterne = (ip: string) => {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
  return v4 ? INTERNES.check(v4, "ipv4") : INTERNES.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4")
}

/** Lève (400) si l'hôte de `url` résout vers une adresse interne et que l'instance est hébergée. */
export async function verifierAdresse(url: URL, localAutorise = LOCAL_AUTORISE): Promise<void> {
  if (localAutorise) return
  const hote = url.hostname.replace(/^\[|\]$/g, "")
  const ips = isIP(hote) ? [hote] : (await lookup(hote, { all: true }).catch(() => [])).map((a) => a.address)
  if (!ips.length) throw Object.assign(new Error(`${hote} ne résout vers aucune adresse.`), { code: 400 })
  if (ips.some(estInterne)) throw Object.assign(new Error("Cette adresse pointe vers un réseau interne : LPWS hébergé ne l’ouvre pas."), { code: 400 })
}
