/**
 * run.ts — orchestrateur de la famille DEPLOY : une variante validée → un dossier publiable
 * et jugé.
 *
 *   variante + config de livraison  →  prepare  →  check  →  publish/<nom>/ + deploy.json
 *
 * Le juge tourne AVANT la mise en ligne, jamais après : une variante qui perd l'identifiant
 * de clic coûte au media buyer son attribution, et ça ne se rattrape pas rétroactivement.
 * Tant que `check` échoue, le dossier est produit mais marqué non publiable.
 *
 * Usage : npm run deploy -- <dossier-variante> <config.json>
 */
import { writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { DeployConfig } from "./config.ts"
import { prepareVariant } from "./prepare.ts"
import { checkDeploy } from "./check.ts"
import { step, fail } from "../shared/log.ts"
import { estLance, lireArgs } from "../shared/cli.ts"
import { lireValide } from "../shared/json.ts"

const SCOPE = "deploy"

export async function deployVariant(variante: string, configPath: string) {
  if (!existsSync(join(variante, "variant.html")))
    fail(SCOPE, `${variante}/variant.html introuvable — appliquer une spec d'abord`)

  // le contrat d'abord : une config invalide ne produit aucun fichier
  const cfg = await lireValide(DeployConfig, configPath).catch((e: Error) => fail(SCOPE, `config de livraison invalide : ${e.message}`))

  // variants/<nom> → ../../publish/<nom> : la publication est voisine de la donnée, pas dedans
  const nom = resolve(variante).split("/").pop()!
  const outDir = join(variante, "..", "..", "publish", nom)

  const prep = await prepareVariant(variante, join(variante, "..", "..", "baseline"), cfg, outDir)
  const juge = await checkDeploy(outDir, cfg)

  await writeFile(join(outDir, "deploy.json"), JSON.stringify({
    variante, config: configPath, prepareAt: new Date().toISOString(),
    publiable: juge.ok, prepare: prep, juge,
  }, null, 2))

  step(SCOPE, `→ ${outDir}`)
  for (const h of prep.honnetete) step(SCOPE, `honnêteté : ${h}`)
  if (!juge.ok) {
    for (const e of juge.echecs) step(SCOPE, `ÉCHEC : ${e}`)
    fail(SCOPE, "livraison non publiable — corriger avant d'envoyer du trafic payant dessus")
  }
  step(SCOPE, "publiable : la mesure survit au trajet (vérifié dans un vrai moteur)")
  return { outDir, prep, juge }
}

/* CLI */
if (estLance(import.meta.url)) {
  const [v, c] = lireArgs().libres
  if (!v || !c) fail(SCOPE, "usage : npm run deploy -- <dossier-variante> <config.json>")
  await deployVariant(v, c)
}
