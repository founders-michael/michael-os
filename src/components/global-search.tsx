"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Building2, CalendarDays, Check, Command, Flag, Flame, Home, LoaderCircle, Search, Settings2, Users, X } from "lucide-react";
import { filterNavigationCommands, getNavigationCommands, type CommandOrganization, type NavigationCommand } from "@/lib/command-palette";
import { LatestRequestGate } from "@/lib/debounce";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { registerKeyboardShortcut } from "@/lib/keyboard-shortcuts";
import { isWorkContextPath } from "@/lib/workspace-navigation";

type SearchResult = { id: string; type: "Task" | "Goal" | "Habit" | "Calendar"; title: string; detail: string; href: string };
type SearchResponse = { results?: SearchResult[]; error?: string };
type PaletteOption = { id: string; title: string; detail: string; href: string; icon: typeof Home; category: string };
const resultIcons = { Task: Check, Goal: Flag, Habit: Flame, Calendar: CalendarDays };

function commandIcon(command: NavigationCommand) {
  if (command.href.endsWith("/teams") || command.href.endsWith("/members")) return Users;
  if (command.href.endsWith("/projects")) return Building2;
  if (command.href.endsWith("/calendar")) return CalendarDays;
  if (command.href.endsWith("/goals")) return Flag;
  if (command.href.endsWith("/habits")) return Flame;
  if (command.href.endsWith("/settings")) return Settings2;
  return command.href === "/" ? Home : ArrowRight;
}

export default function GlobalSearch({ organizations, lifestyleReady }: { organizations: CommandOrganization[]; lifestyleReady: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestGate = useRef(new LatestRequestGate());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const workContext = isWorkContextPath(pathname);
  const debouncedQuery = useDebouncedValue(query.trim(), 220);
  const commands = useMemo(() => getNavigationCommands(pathname, organizations, lifestyleReady), [pathname, organizations, lifestyleReady]);
  const matchedCommands = useMemo(() => filterNavigationCommands(commands, query), [commands, query]);
  const options = useMemo<PaletteOption[]>(() => [
    ...matchedCommands.map((command) => ({ id: command.id, title: command.label, detail: command.detail, href: command.href, icon: commandIcon(command), category: command.product === "shared" ? "Product" : command.product === "work" ? "WorkOS navigation" : "LifestyleOS navigation" })),
    ...(!workContext && debouncedQuery.length >= 2 && query.trim() === debouncedQuery ? results.map((result) => ({ id: `${result.type}-${result.id}`, title: result.title, detail: result.detail, href: result.href, icon: resultIcons[result.type], category: "Saved item" })) : []),
  ], [debouncedQuery, matchedCommands, query, results, workContext]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError("");
    setLoading(false);
    setActiveIndex(-1);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => registerKeyboardShortcut("global-command-palette", { key: "k", mod: true, allowInEditable: true }, () => setOpen((value) => !value)), []);
  useEffect(() => registerKeyboardShortcut("global-command-palette-escape", { key: "Escape", allowInEditable: true, enabled: () => open }, close), [close, open]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const gate = requestGate.current;
    const normalized = debouncedQuery.trim();
    const request = gate.issue();
    if (!open || workContext || normalized.length < 2 || query.trim() !== normalized) {
      return () => gate.invalidate();
    }
    const controller = new AbortController();
    void fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as SearchResponse;
        if (!response.ok) throw new Error(body.error || "Search is temporarily unavailable.");
        if (gate.isCurrent(request)) setResults(body.results ?? []);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || !gate.isCurrent(request)) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Search is temporarily unavailable.");
      })
      .finally(() => { if (!controller.signal.aborted && gate.isCurrent(request)) setLoading(false); });
    return () => { controller.abort(); gate.invalidate(); };
  }, [debouncedQuery, open, query, workContext]);

  function selectResult(href: string) {
    close();
    window.dispatchEvent(new CustomEvent("michaelos:navigate", { detail: { href } }));
    router.push(href);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") {
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      const first = controls?.[0]; const last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % options.length); }
    if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1)); }
    if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) { event.preventDefault(); selectResult(options[activeIndex]!.href); }
  }

  const waitingForSearch = !workContext && query.trim().length >= 2 && query.trim() !== debouncedQuery;
  const searchIsLoading = !workContext && (loading || waitingForSearch);

  return <>
    <button ref={triggerRef} className="search-button" type="button" aria-label="Open command palette and search" onClick={() => setOpen(true)}><Search size={16} /><span>Search or go to…</span><kbd>⌘ K / Ctrl K</kbd></button>
    {open && <div className="global-search-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title" onKeyDown={(event) => { if (event.key === "Tab" && event.target !== inputRef.current) onInputKeyDown(event as KeyboardEvent<HTMLInputElement>); }}>
        <h2 className="sr-only" id="global-search-title">Search and navigate</h2>
        <div className="global-search-input-row"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setError(""); if (event.target.value.trim().length < 2) { setResults([]); setLoading(false); } else if (!workContext) setLoading(true); }} onKeyDown={onInputKeyDown} placeholder={workContext ? "Search WorkOS pages and organizations…" : "Search pages and saved personal items…"} aria-label="Search navigation commands" aria-controls="global-search-results" aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined} aria-autocomplete="list" role="combobox" aria-expanded={open} /><kbd>ESC</kbd><button type="button" onClick={close} aria-label="Close command palette"><X size={17} /></button></div>
        <div className="global-search-body" id="global-search-results" role="listbox" aria-label="Navigation commands and results">
          {!query.trim() && <p className="global-search-hint">Navigation commands are always available. Type to filter pages{workContext ? "; WorkOS record search is not available yet." : " or search your saved personal items"}.</p>}
          {options.map((option, index) => {
            const Icon = option.icon;
            return <button className={`global-search-result ${activeIndex === index ? "active" : ""}`} id={`global-search-result-${index}`} role="option" aria-selected={activeIndex === index} key={option.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectResult(option.href)}><span className="global-search-result-icon"><Icon size={16} /></span><span className="global-search-result-copy"><strong>{option.title}</strong><small>{option.detail}</small></span><span className="global-search-result-type">{option.category}</span></button>;
          })}
          {searchIsLoading && <p className="global-search-state"><LoaderCircle className="global-search-spin" size={16} />Searching your saved items…</p>}
          {!searchIsLoading && error && <p className="global-search-error" role="alert">{error}</p>}
          {!searchIsLoading && !error && query.trim() && options.length === 0 && <p className="global-search-state">{workContext ? "No matching navigation commands." : "No matching pages or saved items."}</p>}
        </div>
        <footer className="global-search-footer"><span>↑↓ navigate</span><span>Enter open</span><span>Esc close</span><span><Command size={12} /> K / Ctrl K open</span></footer>
      </section>
    </div>}
  </>;
}
