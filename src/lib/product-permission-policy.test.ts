import assert from "node:assert/strict";
import test from "node:test";
import { canManageProductAccess, NEW_USER_PRODUCT_PERMISSIONS, productExperiencesForPermissions } from "@/lib/product-permission-policy";

test("new accounts receive LifestyleOS access only", () => {
  assert.deepEqual(NEW_USER_PRODUCT_PERMISSIONS, ["LIFESTYLE_OS_ACCESS"]);
  assert.deepEqual(productExperiencesForPermissions(NEW_USER_PRODUCT_PERMISSIONS), ["lifestyle"]);
});

test("the product chooser follows explicit independent entitlements", () => {
  assert.deepEqual(productExperiencesForPermissions(["WORK_OS_ACCESS"]), ["work"]);
  assert.deepEqual(productExperiencesForPermissions(["LIFESTYLE_OS_ACCESS", "WORK_OS_ACCESS"]), ["lifestyle", "work"]);
  assert.deepEqual(productExperiencesForPermissions([]), []);
});

test("product entitlement administration rejects self-grants and requires an allowlisted actor", () => {
  const administrators = new Set(["trusted-admin"]);
  assert.equal(canManageProductAccess("target", "trusted-admin", administrators), true);
  assert.equal(canManageProductAccess("trusted-admin", "trusted-admin", administrators), false);
  assert.equal(canManageProductAccess("target", "ordinary-user", administrators), false);
});

