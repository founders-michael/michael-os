import assert from "node:assert/strict";
import test from "node:test";
import {
  productAuthDestination,
  productAuthHref,
  productChoices,
  signedInProductDestination,
} from "@/lib/product-entry";

test("the public entry exposes two distinct product authentication paths", () => {
  assert.deepEqual(productChoices.map(({ name }) => name), ["LifestyleOS", "WorkOS"]);
  assert.equal(productAuthHref("lifestyle", "login"), "/lifestyle/login");
  assert.equal(productAuthHref("work", "register"), "/work/register");
  assert.equal(productAuthHref("work", "register", "/accept-invitation?token=abc"), "/work/register?returnTo=%2Faccept-invitation%3Ftoken%3Dabc");
});

test("authentication destinations respect the selected product without creating cross-product requirements", () => {
  assert.equal(productAuthDestination("lifestyle", "register"), "/onboarding");
  assert.equal(productAuthDestination("work", "register"), "/work");
  assert.equal(signedInProductDestination("work", false), "/work");
  assert.equal(signedInProductDestination("lifestyle", false), "/onboarding");
  assert.equal(signedInProductDestination("lifestyle", true), "/");
});
