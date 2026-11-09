import assert from "node:assert/strict";
import test from "node:test";
import { filterNavigationCommands, getNavigationCommands, type CommandOrganization } from "./command-palette";

const organization: CommandOrganization = { id: "org-a", name: "Studio A", slug: "studio-a", membership: { role: "MEMBER", status: "ACTIVE" }, managerDefaultScope: "TEAM" };

test("LifestyleOS commands stay personal and never require an organization", () => {
  const commands = getNavigationCommands("/tasks", [], true);
  assert.ok(commands.some((command) => command.href === "/goals"));
  assert.ok(commands.some((command) => command.href === "/habits"));
  assert.ok(commands.some((command) => command.href === "/products"));
  assert.equal(commands.some((command) => command.href.includes("org-a")), false);
});

test("WorkOS commands are scoped to active memberships and include the selected organization's routes", () => {
  const commands = getNavigationCommands("/work/org-a/tasks", [organization, { ...organization, id: "org-b", name: "Suspended", membership: { role: "MEMBER", status: "SUSPENDED" } }], true);
  assert.ok(commands.some((command) => command.href === "/work/org-a/tasks"));
  assert.ok(commands.some((command) => command.href === "/work/org-a/projects"));
  assert.equal(commands.some((command) => command.href.includes("org-b")), false);
  assert.ok(commands.some((command) => command.href === "/products"));
});

test("commands can be searched by label, detail, and keywords", () => {
  const commands = getNavigationCommands("/work", [organization], false);
  assert.ok(filterNavigationCommands(commands, "studio").some((command) => command.href === "/work/org-a"));
  assert.deepEqual(filterNavigationCommands(commands, "habits"), []);
});
