export function scriptGoogleAds(opts: { endpoint: string; jeton: string; compte: string; campagnes: string[] }): string {
  const url = new URL(opts.endpoint)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("La synchronisation Google Ads exige une URL HTTPS publique sans identifiants ni paramètres.")
  if (!/^\d{10}$/.test(opts.compte) || !opts.campagnes.length || opts.campagnes.some((id) => !/^\d+$/.test(id)))
    throw new Error("Indiquez l'identifiant du compte et au moins une campagne Google Ads.")
  if (!/^[a-f0-9]{64}$/.test(opts.jeton)) throw new Error("Jeton de synchronisation invalide")
  const requete = "SELECT search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type, "
    + "campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions "
    + "FROM search_term_view WHERE segments.date DURING LAST_30_DAYS "
    + "AND campaign.advertising_channel_type = 'SEARCH' AND campaign.id IN (" + opts.campagnes.join(",") + ") "
    + "AND metrics.impressions > 0 ORDER BY metrics.clicks DESC LIMIT 20001"
  return `var LPWS_URL = ${JSON.stringify(url.href)};
var LPWS_JETON = ${JSON.stringify(opts.jeton)};
var LPWS_COMPTE = ${JSON.stringify(opts.compte)};
function main() {
  var compte = AdsApp.currentAccount();
  if (compte.getCustomerId().replace(/-/g, "") !== LPWS_COMPTE) throw new Error("Ce script LPWS appartient à un autre compte Google Ads.");
  var lignes = AdsApp.search(${JSON.stringify(requete)});
  var termes = [];
  while (lignes.hasNext()) {
    var r = lignes.next();
    var kw = r.segments && r.segments.keyword && r.segments.keyword.info || {};
    var type = { EXACT: "exact", PHRASE: "expression", BROAD: "large" }[kw.matchType] || "inconnue";
    termes.push({
      terme: r.searchTermView.searchTerm, motCle: kw.text || undefined, correspondance: type,
      campagneId: String(r.campaign.id), campagne: r.campaign.name,
      groupeId: String(r.adGroup.id), groupeAnnonces: r.adGroup.name,
      impressions: Number(r.metrics.impressions), clics: Number(r.metrics.clicks),
      cout: Number(r.metrics.costMicros) / 1000000, conversions: Number(r.metrics.conversions)
    });
    if (termes.length > 20000) throw new Error("Plus de 20000 lignes : réduisez les campagnes du connecteur. Aucun rapport partiel envoyé.");
  }
  if (!termes.length) throw new Error("Aucun terme visible sur les 30 derniers jours. Rien envoyé, ancien rapport conservé.");
  var payload = {
    source: { fichier: "google-ads-script.json", format: "csv-script", langue: "en", periode: "LAST_30_DAYS",
      compte: LPWS_COMPTE, devise: compte.getCurrencyCode() },
    importeLe: new Date().toISOString(), termes: termes, ignorees: 0
  };
  var reponse = UrlFetchApp.fetch(LPWS_URL, {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + LPWS_JETON },
    payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: false
  });
  if (reponse.getResponseCode() !== 200) throw new Error("Synchronisation LPWS refusée (HTTP " + reponse.getResponseCode() + "). Vérifiez le connecteur dans LPWS.");
  Logger.log("LPWS : " + termes.length + " lignes synchronisées. Aucun paramètre ni annonce Google Ads modifié.");
}
`
}
