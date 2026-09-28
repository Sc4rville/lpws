import { test } from "node:test"
import assert from "node:assert/strict"
import { controler, langueDe, nombresDe, nomDeSpec, texteDuHtml, type CadreGarde } from "./garde.ts"
import { slugify } from "../shared/paths.ts"

const g = (x: Partial<CadreGarde> = {}): CadreGarde => ({
  page: "Customer support software for small teams. No credit card required. 14 days, every feature. $19 / seat / month. Get a demo",
  annonce: "Shared Inbox for Small Teams. Reply 2x faster.",
  avant: new Map([["e11", "Customer support software for small teams"], ["e13", "Get a demo"]]),
  boutons: new Set(["e13"]),
  ...x,
})

test("nombresDe : milliers, décimales, unités collées", () => {
  assert.deepEqual(nombresDe("1 000 clients, 1,000 users, 2,5 % et 2x, 14-day"), ["1000", "1000", "2.5", "2", "14"])
  assert.deepEqual(nombresDe("de 19 à 39 €"), ["19", "39"])
})

test("controler : un titre fidèle passe, un chiffre de l'annonce est permis", () => {
  assert.deepEqual(controler([{ anchor: "e11", op: "set", text: "A shared inbox that helps small teams reply 2x faster" }], g()), [])
})

test("controler : chiffre inventé, superlatif, exclamation, texte inchangé", () => {
  const r = controler([{ anchor: "e11", op: "set", text: "The best inbox: reply 3x faster!" }], g())
  assert.ok(r.some((x) => x.includes("chiffre") && x.includes("3")), r.join("\n"))
  assert.ok(r.some((x) => x.includes("best")), r.join("\n"))
  assert.ok(r.some((x) => x.includes("exclamation")), r.join("\n"))
  assert.ok(controler([{ anchor: "e13", op: "set", text: "get a  demo" }], g())[0].includes("identique"))
})

test("controler : un superlatif déjà porté par la page n'est pas une invention", () => {
  assert.deepEqual(controler([{ anchor: "e11", op: "set", text: "The leading shared inbox for small teams" }], g({ page: "Relay, the leading help desk" })), [])
})

test("controler : bouton trop long, texte démesuré", () => {
  assert.ok(controler([{ anchor: "e13", op: "set", text: "Start your free trial today and see every feature in action now" }], g())[0].includes("bouton"))
  assert.ok(controler([{ anchor: "e11", op: "set", text: "Small teams ".repeat(20) }], g())[0].includes("plus long"))
})

test("controler : verbes et cible de la règle", () => {
  const portee = { verbes: ["set"], ancres: new Set(["e11"]) }
  const r = controler([{ anchor: "e13", op: "remove" }], g(), portee)
  assert.ok(r.some((x) => x.includes("verbe")) && r.some((x) => x.includes("cible")), r.join("\n"))
  assert.ok(controler([{ anchor: "e13", op: "move" }], g())[0].includes("before"))
  assert.ok(controler([{ anchor: "e13", op: "swap", with: "e13" }], g())[0].includes("elle-même"))
})

test("langueDe : attribut lang, sinon mots outils", () => {
  assert.equal(langueDe('<html lang="fr-FR"><body>x</body></html>'), "français")
  assert.equal(langueDe("<html><body><p>Get the best of your team and your customers with the inbox for you</p></body></html>"), "anglais")
  assert.equal(langueDe("<html><body><p>Pour vous et votre équipe, le logiciel est simple et la prise en main est rapide avec une aide</p></body></html>"), "français")
})

test("texteDuHtml : scripts et styles ne sont pas du texte", () => {
  assert.equal(texteDuHtml("<style>.a{}</style><h1>Salut&nbsp;toi</h1><script>var x = 42</script>"), "Salut toi")
})

test("nomDeSpec : ne coupe que s'il faut, jamais deux fois le même nom", () => {
  const pris = new Set<string>()
  assert.equal(nomDeSpec("Le titre reprend la promesse", pris, slugify), "le-titre-reprend-la-promesse")
  assert.equal(nomDeSpec("Le titre reprend la promesse", pris, slugify), "le-titre-reprend-la-promesse-2")
  assert.equal(nomDeSpec("!!!", pris, slugify), "variante")
  const long = nomDeSpec("Le bouton principal dit exactement ce qui se passe après le clic", pris, slugify)
  assert.ok(long.length <= 44 && !long.endsWith("-"), long)
})

test("controler : urgence fabriquée, faux témoignage, fausse personnalisation", () => {
  const un = (text: string) => controler([{ anchor: "e11", op: "set", text }], g())
  assert.ok(un("Limited time: shared inbox for small teams").some((x) => x.includes("urgence")))
  assert.ok(un("Hurry, small teams reply faster").some((x) => x.includes("urgence")))
  assert.ok(un("“The inbox our small team always needed”").some((x) => x.includes("faux témoignage")))
  assert.ok(un("Built for you, {Company}").some((x) => x.includes("personnalisation")))
  assert.ok(controler([{ anchor: "e11", op: "set", text: "Plus que 3 places pour les petites équipes" }], g({ page: "Support pour petites équipes" })).some((x) => x.includes("urgence")))
})

test("controler : une urgence ou une citation que la page porte déjà n'est pas une invention", () => {
  const page = "Limited time offer. “Relay cut our reply time in half” — Ana, Acme. Customer support software for small teams"
  assert.deepEqual(controler([{ anchor: "e11", op: "set", text: "Limited time offer for small teams" }], g({ page })), [])
  assert.deepEqual(controler([{ anchor: "e11", op: "set", text: "“Relay cut our reply time in half”" }], g({ page })), [])
})

test("texteDuHtml : le texte des racines fantômes capturées (template) compte", () => {
  assert.equal(texteDuHtml('<div><template shadowrootmode="open"><p>Call 1-800-664-9073</p></template></div>'), "Call 1-800-664-9073")
})
