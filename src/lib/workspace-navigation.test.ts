import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceNavigationItems, isNavigationItemActive } from "@/lib/workspace-navigation";

const lifestyleLinks = ["/", "/assistant", "/tasks", "/goals", "/habits", "/calendar", "/review", "/calendar#planner-heading", "/insights", "/plugins", "/settings"];

test("LifestyleOS navigation is available without onboarding completion or WorkOS membership", () => {
  const items = getWorkspaceNavigationItems("/", []);
  assert.deepEqual(items.map(({ href }) => href), lifestyleLinks);
  assert.equal(items.some(({ name }) => name === "Tasks"), true);
  assert.equal(items.some(({ name }) => name === "Goals"), true);
  assert.equal(items.some(({ name }) => name === "Habits"), true);
  assert.equal(items.some(({ name }) => name === "Calendar"), true);
  assert.equal(items.find(({ name }) => name === "Daily Review")?.href, "/review");
  assert.equal(items.find(({ href }) => href === "/")?.name, "My Day");
  assert.equal(items.find(({ name }) => name === "Plan with Michael")?.href, "/calendar#planner-heading");
});

test("incomplete LifestyleOS onboarding does not remove personal navigation", () => {
  // Onboarding state is intentionally not an input to navigation visibility.
  assert.deepEqual(getWorkspaceNavigationItems("/onboarding", []).map(({ href }) => href), lifestyleLinks);
});

test("WorkOS routes show organization navigation, including capacity, without exposing LifestyleOS links", () => {
  const landing = getWorkspaceNavigationItems("/work", []);
  assert.deepEqual(landing.map(({ href }) => href), ["/work"]);

  const organization = { id: "org-a", managerDefaultScope: "TEAM", membership: { role: "OWNER", status: "ACTIVE" } };
  const items = getWorkspaceNavigationItems("/work/org-a", [organization]);
  assert.deepEqual(items.map(({ name }) => name), ["Overview", "Ask Michael", "Teams", "Projects", "Tasks", "Capacity", "Members", "Invitations", "Organization policy"]);
  assert.equal(items.find(({ name }) => name === "Tasks")?.href, "/work/org-a/tasks");
  assert.equal(items.find(({ name }) => name === "Capacity")?.href, "/work/org-a/capacity");
  assert.equal(items.some(({ href }) => lifestyleLinks.includes(href)), false);
});

test("a Manager sees only the directory scope allowed by organization policy", () => {
  const teamManager = { id: "org-a", managerDefaultScope: "TEAM", membership: { role: "MANAGER", status: "ACTIVE" } };
  const orgManager = { ...teamManager, managerDefaultScope: "ORGANIZATION" };
  assert.deepEqual(getWorkspaceNavigationItems("/work/org-a", [teamManager]).map(({ name }) => name), ["Overview", "Ask Michael", "Teams", "Projects", "Tasks", "Capacity"]);
  assert.deepEqual(getWorkspaceNavigationItems("/work/org-a", [orgManager]).map(({ name }) => name), ["Overview", "Ask Michael", "Teams", "Projects", "Tasks", "Capacity", "Members"]);
});

test("switching route context switches navigation while keeping active-route matching correct", () => {
  const organizations = [{ id: "org-a", managerDefaultScope: "ORGANIZATION", membership: { role: "OWNER", status: "ACTIVE" } }];
  const workItems = getWorkspaceNavigationItems("/work/org-a/members", organizations);
  const personalItems = getWorkspaceNavigationItems("/habits", organizations);
  assert.equal(workItems.some(({ name }) => name === "Members"), true);
  assert.equal(personalItems.some(({ name }) => name === "Habits"), true);
  assert.equal(workItems.some(({ name }) => name === "Habits"), false);
  assert.equal(isNavigationItemActive("/habits", "/habits"), true);
  assert.equal(isNavigationItemActive("/habits/today", "/habits"), true);
  assert.equal(isNavigationItemActive("/tasks", "/"), false);
  assert.equal(isNavigationItemActive("/work/org-a/members", "/work/org-a/members"), true);
});

test("inactive or unknown organization context does not grant organization navigation", () => {
  const inactive = { id: "org-a", managerDefaultScope: "ORGANIZATION", membership: { role: "OWNER", status: "SUSPENDED" } };
  assert.deepEqual(getWorkspaceNavigationItems("/work/org-a", [inactive]).map(({ href }) => href), ["/work"]);
});
