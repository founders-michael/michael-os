import assert from "node:assert/strict";
import test from "node:test";
import { KeyboardShortcutRegistry } from "./keyboard-shortcuts";

function keyEvent(key: string, options: Partial<KeyboardEvent> = {}) {
  let prevented = false;
  const event = {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: () => { prevented = true; },
    ...options,
  } as KeyboardEvent;
  return { event, prevented: () => prevented };
}

test("shortcut registrations clean up and duplicate ids replace safely", () => {
  const registry = new KeyboardShortcutRegistry();
  const hits: string[] = [];
  const removeOld = registry.register("palette", { key: "k", mod: true, allowInEditable: true }, () => hits.push("old"));
  registry.register("palette", { key: "k", mod: true, allowInEditable: true }, () => hits.push("new"));
  removeOld();
  const { event, prevented } = keyEvent("k", { ctrlKey: true });
  registry.dispatch(event);
  assert.deepEqual(hits, ["new"]);
  assert.equal(prevented(), true);
  assert.equal(registry.size, 1);
});

test("normal shortcuts are ignored in editable controls but modifier shortcuts can opt in", () => {
  const registry = new KeyboardShortcutRegistry();
  let normal = 0;
  let command = 0;
  registry.register("help", { key: "?" }, () => normal++);
  registry.register("palette", { key: "k", mod: true, allowInEditable: true }, () => command++);
  const inputTarget = { tagName: "INPUT" } as unknown as EventTarget;
  registry.dispatch(keyEvent("?", { target: inputTarget }).event);
  registry.dispatch(keyEvent("k", { metaKey: true, target: inputTarget }).event);
  assert.equal(normal, 0);
  assert.equal(command, 1);
});

test("shortcut enabled predicates allow Escape to close only active overlays", () => {
  const registry = new KeyboardShortcutRegistry();
  let open = false;
  let closes = 0;
  registry.register("overlay", { key: "Escape", allowInEditable: true, enabled: () => open }, () => { open = false; closes++; });
  registry.dispatch(keyEvent("Escape").event);
  assert.equal(closes, 0);
  open = true;
  registry.dispatch(keyEvent("Escape").event);
  assert.equal(closes, 1);
});
