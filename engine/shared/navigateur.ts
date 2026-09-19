import { chromium, type Browser, type LaunchOptions } from "playwright"

/** Ce que voit le site : un Chrome ordinaire, pas « HeadlessChrome ». */
export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

/**
 * LE SEUL NAVIGATEUR DU PROJET : le Chromium complet en mode headless.
 * - Le « headless shell » par défaut de Playwright est reconnu par les anti-bots (Akamai sur
 *   salesforce.com : 403 « Access Denied ») ; le Chromium complet, avec un User-Agent sans
 *   « Headless », passe (200).
 * - Et surtout : référence et clone doivent être rendus par le MÊME moteur. Photographier la
 *   page vivante avec l'un et juger le clone avec l'autre a donné Jira à 14 % de différence
 *   (0,8 % avec le même navigateur) : les métriques de texte diffèrent, les lignes se coupent
 *   ailleurs, tout le bas de page dérive. Un seul moteur, partout, y compris apply et l'interface.
 */
export function lancerNavigateur(opts: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch({ channel: "chromium", ...opts, args: ["--no-sandbox", ...(opts.args ?? [])] })
}
