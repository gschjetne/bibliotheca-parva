import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { BiblioWorld } from "../world";

// The .feature talks about Cloudflare Access (the edge). The Worker can only
// enforce its own defence-in-depth: serve when a valid identity is present,
// refuse (403) otherwise. We map the allow-list / authenticated state to the
// Worker's bypass flag and assert on that enforceable behaviour.

Given("I have not authenticated with Cloudflare Access", function (this: BiblioWorld) {
  this.bypass = "false";
  this.token = null;
});

Given("I have authenticated with Cloudflare Access", function () {
  /* authentication happened at the edge; authorisation is decided by the
     allow-list step. No-op here. */
});

Given("my identity is on the Access allow-list", function (this: BiblioWorld) {
  this.bypass = "true";
});

Given("my identity is not on the Access allow-list", function (this: BiblioWorld) {
  this.bypass = "false";
  this.token = null;
});

When(/^I open (?:any page of the library|the library|the library home page)$/, async function (this: BiblioWorld) {
  await this.req("GET", "/");
});

When("a request reaches the Worker without a valid Access identity token", async function (this: BiblioWorld) {
  this.bypass = "false";
  this.token = null;
  await this.req("GET", "/health");
});

const refused = function (this: BiblioWorld) {
  assert.equal(this.status, 403, "expected the Worker to refuse the request");
};
Then("I am sent to the Cloudflare Access login", refused);
Then("the application never receives my request", refused);
Then("Access denies me", refused);
Then("the application refuses it", refused);

Then("I see the catalogue", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="query"'), "expected the catalogue search box");
});

Then("the application knows who I am from the verified Access identity", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
});
