/**
 * prepare.ts — une variante locale → un dossier publiable, sans perdre la mesure.
 *
 * C'est le seul endroit de la machine où l'on REMET du JavaScript dans la page. Le clone en
 * est débarrassé exprès (rejouer le JS d'un framework sur un DOM sérialisé casse
 * l'hydratation), mais une page vers laquelle part du trafic payant sans mesure ne vaut
 * rien. On réinjecte donc le strict nécessaire, écrit par nous, et rien d'autre :
 *
 *   1. le relais des identifiants de clic (gclid & co) vers le vrai tunnel du client ;
 *   2. le Consent Mode v2 AVANT les pixels (sinon ils partent sans consentement) ;
 *   3. les pixels du client ;
 *   4. `noindex` + `canonical` : une variante ne concurrence jamais la page qu'elle teste.
 *
 * Purement mécanique et hors ligne : aucune décision ici, tout vient de la config validée.
 */
import { readFile, writeFile, mkdir, cp } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { PARAMS_CLIC, type DeployConfig } from "./config.ts"
import { step } from "../shared/log.ts"

const SCOPE = "deploy/prepare"

export type PrepareReport = {
  fichiers: string[]
  ctaRecables: number
  ctaIntrouvables: string[]
  pixels: string[]
  /** ce que cette page ne saura PAS faire malgré la préparation — dit, jamais maquillé */
  honnetete: string[]
}

/** Le relais : capte les paramètres de clic et les recolle à chaque sortie vers le client. */
function scriptRelais(domaines: string[]): string {
  return `(function(){
  var P=${JSON.stringify(PARAMS_CLIC)};
  var D=${JSON.stringify(domaines)};
  var q=new URLSearchParams(location.search), garde={};
  P.forEach(function(k){ if(q.has(k)) garde[k]=q.get(k) });
  try{
    if(Object.keys(garde).length) sessionStorage.setItem('lpws_clic',JSON.stringify(garde));
    else garde=JSON.parse(sessionStorage.getItem('lpws_clic')||'{}');
  }catch(e){}
  if(!Object.keys(garde).length) return;
  function suivi(h){ try{ var u=new URL(h,location.href); return D.some(function(d){ return u.hostname===d||u.hostname.endsWith('.'+d) }) }catch(e){ return false } }
  function decore(){
    document.querySelectorAll('a[href]').forEach(function(a){
      var h=a.getAttribute('href'); if(!h||!suivi(h)) return;
      var u=new URL(h,location.href);
      Object.keys(garde).forEach(function(k){ if(!u.searchParams.has(k)) u.searchParams.set(k,garde[k]) });
      a.setAttribute('href',u.toString());
    });
    document.querySelectorAll('form[action]').forEach(function(f){
      var h=f.getAttribute('action'); if(!h||!suivi(h)) return;
      var u=new URL(h,location.href);
      Object.keys(garde).forEach(function(k){ if(!u.searchParams.has(k)) u.searchParams.set(k,garde[k]) });
      f.setAttribute('action',u.toString());
    });
  }
  decore();
  document.addEventListener('DOMContentLoaded',decore);
})();`
}

/** Consent Mode v2 : refus par défaut, AVANT tout pixel. La bannière du client débloque. */
const SCRIPT_CONSENT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});`

function scriptsPixels(cfg: DeployConfig): { head: string; poses: string[] } {
  const poses: string[] = []
  let head = ""
  if (cfg.pixels.consentModeV2) { head += `<script>${SCRIPT_CONSENT}</script>\n`; poses.push("consent-mode-v2") }
  if (cfg.pixels.gtag.length > 0) {
    const premier = cfg.pixels.gtag[0]
    head += `<script async src="https://www.googletagmanager.com/gtag/js?id=${premier}"></script>\n`
    head += `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());`
      + cfg.pixels.gtag.map((id) => `gtag('config','${id}');`).join("") + `</script>\n`
    poses.push(...cfg.pixels.gtag.map((id) => `gtag:${id}`))
  }
  if (cfg.pixels.meta) {
    head += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?`
      + `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;`
      + `n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;`
      + `s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',`
      + `'https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.pixels.meta}');fbq('track','PageView');</script>\n`
    poses.push(`meta:${cfg.pixels.meta}`)
  }
  return { head, poses }
}

/** Recâble un CTA vers le vrai tunnel du client, par son ancre. */
function recable(html: string, anchor: string, href: string): { html: string; ok: boolean } {
  // l'ancre est posée sur la balise : on ne touche qu'à SON attribut href, jamais au markup
  const re = new RegExp(`(<a\\b[^>]*data-lpws="${anchor}"[^>]*?)(\\shref="[^"]*")?([^>]*>)`, "i")
  if (!re.test(html)) return { html, ok: false }
  return {
    html: html.replace(re, (_m, avant, _href, apres) => `${avant} href="${href}"${apres}`),
    ok: true,
  }
}

function injecte(html: string, cfg: DeployConfig, relais: string, pixels: string): string {
  const tete = `<meta name="robots" content="noindex,nofollow">\n`
    + `<link rel="canonical" href="${cfg.canonical}">\n`
    + pixels
    + `<script>${relais}</script>\n`
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + "\n" + tete)
    : tete + html
}

export async function prepareVariant(
  variantDir: string, baselineDir: string, cfg: DeployConfig, outDir: string,
): Promise<PrepareReport> {
  await mkdir(outDir, { recursive: true })

  const hotes = new Set<string>(cfg.domainesSuivis)
  hotes.add(new URL(cfg.canonical).hostname.replace(/^www\./, ""))
  for (const c of cfg.cta) hotes.add(new URL(c.href).hostname.replace(/^www\./, ""))
  const relais = scriptRelais([...hotes])
  const { head: pixels, poses } = scriptsPixels(cfg)

  const fichiers: string[] = []
  const ctaIntrouvables: string[] = []
  let ctaRecables = 0

  for (const [src, dest] of [["variant.html", "index.html"], ["variant.mobile.html", "index.mobile.html"]]) {
    const chemin = join(variantDir, src)
    if (!existsSync(chemin)) continue
    let html = await readFile(chemin, "utf8")
    for (const c of cfg.cta) {
      const r = recable(html, c.anchor, c.href)
      html = r.html
      if (r.ok) { if (src === "variant.html") ctaRecables++ }
      else if (src === "variant.html") ctaIntrouvables.push(c.anchor)
    }
    await writeFile(join(outDir, dest), injecte(html, cfg, relais, pixels))
    fichiers.push(dest)
  }
  if (fichiers.length === 0)
    throw new Error(`aucun variant.html dans ${variantDir} — appliquer une spec d'abord`)

  // les octets vivent dans la baseline : une variante ne les duplique pas, la publication si
  if (existsSync(join(baselineDir, "assets")))
    await cp(join(baselineDir, "assets"), join(outDir, "assets"), { recursive: true })

  const honnetete = [
    "formulaires natifs non fonctionnels : le clone est servi sans le JS du client — les CTA renvoient vers son tunnel réel",
    "les pixels remis sont ceux de la config, pas ceux détectés sur la page d'origine : à rapprocher de resources.json avant mise en ligne",
    "mesure non vérifiée par cette étape : une variante n'est prête que si un clic de test remonte dans le compte du client",
  ]
  if (ctaIntrouvables.length > 0)
    honnetete.push(`CTA introuvables (ancres ${ctaIntrouvables.join(", ")}) : la page part sans sortie recâblée`)
  if (!cfg.pixels.consentModeV2)
    honnetete.push("Consent Mode v2 désactivé : hors UE seulement, sinon mesure illégale et hits jetés")

  step(SCOPE, `${fichiers.length} page(s) · ${ctaRecables}/${cfg.cta.length} CTA recâblés · pixels : ${poses.join(", ") || "aucun"}`)
  return { fichiers, ctaRecables, ctaIntrouvables, pixels: poses, honnetete }
}
