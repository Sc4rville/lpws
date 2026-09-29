import { test } from "node:test"
import assert from "node:assert/strict"
import { marque } from "./paths.ts"

test("marque : le nom de domaine, sans www ni TLD (composé compris)", () => {
  assert.equal(marque("https://www.atlassian.com/software/jira"), "atlassian")
  assert.equal(marque("https://shop.example.co.uk/x"), "example")
  assert.equal(marque("https://acme.io/"), "acme")
})

test("marque : une page locale s'appelle « local », jamais un morceau d'adresse IP", () => {
  assert.equal(marque("http://127.0.0.1:4715/demo/"), "local")
  assert.equal(marque("http://localhost:4700/demo/"), "local")
  assert.equal(marque("http://relay.localhost/"), "local")
  assert.equal(marque("http://[::1]:8080/"), "local")
})
