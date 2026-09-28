import { chromium, type Browser, type BrowserContextOptions, type LaunchOptions, type Page } from "playwright"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { mimeDe } from "./mime.ts"

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

/**
 * tsx/esbuild enveloppe les fonctions d'un helper `__name` ; il n'existe pas dans la page. Toute
 * page où l'on évalue une fonction du moteur le neutralise d'abord (chaîne brute : non
 * transformée par esbuild).
 */
export async function neutraliserNom(page: Page): Promise<void> {
  await page.addInitScript({ content: "window.__name = (f) => f" })
}

/** Une page neuve, prête à recevoir les fonctions du moteur. */
export async function nouvellePage(browser: Browser, opts: BrowserContextOptions = {}): Promise<Page> {
  const page = await browser.newPage(opts)
  await neutraliserNom(page)
  return page
}

/** Réseau coupé : seul file:// passe. Pour éditer un DOM déjà autonome. */
export async function horsLigne(page: Page): Promise<void> {
  await page.route("**/*", (r) => r.request().url().startsWith("file://") ? r.continue() : r.abort())
}

/**
 * Sert des dossiers locaux sous une ORIGINE HTTP SYNTHÉTIQUE (`http://<nom>.lpws`), pas en
 * file:// : une page file:// a pour origine `null` et Chromium y refuse les fonts par CORS,
 * MÊME locales (constaté sur Jira : fonts rapatriées et pourtant fallback système).
 *
 * Les dossiers sont essayés dans l'ordre (une variante se sert d'abord, puis sa baseline pour
 * les assets qu'elle ne duplique pas). Rien ne sort des dossiers. `index` : le fichier de `/`.
 */
export async function servirDossiers(
  page: Page, origine: string, dossiers: string[], opts: { index?: string } = {},
): Promise<void> {
  await page.route(`${origine}/**`, async (route) => {
    let chemin = decodeURIComponent(new URL(route.request().url()).pathname)
    if (chemin === "/" && opts.index) chemin = "/" + opts.index
    if (!chemin.includes("..")) {
      for (const d of dossiers) {
        try {
          return await route.fulfill({ body: await readFile(join(d, "." + chemin)), contentType: mimeDe(chemin) })
        } catch { /* pas ici → dossier suivant */ }
      }
    }
    await route.fulfill({ status: 404, body: "" })
  })
}
