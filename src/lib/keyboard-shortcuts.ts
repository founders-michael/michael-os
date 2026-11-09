export type KeyboardShortcut = {
  key: string;
  mod?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInEditable?: boolean;
  enabled?: () => boolean;
};

type ShortcutRegistration = { shortcut: KeyboardShortcut; handler: (event: KeyboardEvent) => void; token: symbol };

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null };
  return element.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName?.toUpperCase() ?? "") || element.getAttribute?.("role") === "textbox";
}

function matches(event: KeyboardEvent, shortcut: KeyboardShortcut) {
  const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const modifierMatches = shortcut.mod
    ? (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
    : event.metaKey === Boolean(shortcut.meta) && event.ctrlKey === Boolean(shortcut.ctrl) && event.shiftKey === Boolean(shortcut.shift) && event.altKey === Boolean(shortcut.alt);
  return keyMatches && modifierMatches;
}

export class KeyboardShortcutRegistry {
  private registrations = new Map<string, ShortcutRegistration>();

  register(id: string, shortcut: KeyboardShortcut, handler: (event: KeyboardEvent) => void) {
    const token = Symbol(id);
    this.registrations.set(id, { shortcut, handler, token });
    return () => {
      if (this.registrations.get(id)?.token === token) this.registrations.delete(id);
    };
  }

  dispatch(event: KeyboardEvent) {
    for (const { shortcut, handler } of [...this.registrations.values()]) {
      if (!matches(event, shortcut) || shortcut.enabled?.() === false) continue;
      if (!shortcut.allowInEditable && isEditableKeyboardTarget(event.target)) continue;
      event.preventDefault();
      handler(event);
    }
  }

  get size() { return this.registrations.size; }
}

const registry = new KeyboardShortcutRegistry();
let listening = false;

function handleKeyDown(event: KeyboardEvent) {
  registry.dispatch(event);
}

export function registerKeyboardShortcut(id: string, shortcut: KeyboardShortcut, handler: (event: KeyboardEvent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const unregister = registry.register(id, shortcut, handler);
  if (!listening) {
    window.addEventListener("keydown", handleKeyDown);
    listening = true;
  }
  return () => {
    unregister();
    if (registry.size === 0 && listening) {
      window.removeEventListener("keydown", handleKeyDown);
      listening = false;
    }
  };
}
