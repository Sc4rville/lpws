/**
 * ads-script.js — à coller par le media buyer dans Google Ads → Outils → Scripts.
 *
 * Exporte chaque nuit les termes de recherche des 30 derniers jours vers une feuille Google
 * Sheets, que `npm run intents` sait lire (en-têtes GAQL). Aucun token développeur, aucune
 * autorisation Google à demander : le script tourne DANS le compte du buyer, avec ses droits.
 *
 * Marche à suivre : créer une feuille vide, coller son URL ci-dessous, coller ce script,
 * « Autoriser », « Exécuter » une fois, puis planifier « Tous les jours ».
 *
 * NON TESTÉ sur un vrai compte à ce jour : écrit d'après la documentation Google Ads Scripts
 * (AdsApp.report + exportToSheet). À valider sur le premier compte réel, et à dire ici.
 */
var FEUILLE = "https://docs.google.com/spreadsheets/d/COLLER_ICI_L_ID/edit"
var PERIODE = "LAST_30_DAYS"

function main() {
  var requete =
    "SELECT search_term_view.search_term, search_term_view.status, " +
    "segments.keyword.info.text, segments.keyword.info.match_type, " +
    "campaign.name, ad_group.name, " +
    "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions " +
    "FROM search_term_view " +
    "WHERE segments.date DURING " + PERIODE + " AND metrics.impressions > 0 " +
    "ORDER BY metrics.clicks DESC"
  var rapport = AdsApp.report(requete)
  var feuille = SpreadsheetApp.openByUrl(FEUILLE).getSheets()[0]
  feuille.clearContents()
  rapport.exportToSheet(feuille)
  Logger.log("Termes de recherche exportés (" + PERIODE + ") vers " + FEUILLE)
}
