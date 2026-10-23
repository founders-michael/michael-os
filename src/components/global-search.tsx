"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Flag, Flame, LoaderCircle, Search, X } from "lucide-react";

type SearchResult = { id: string; type: "Task" | "Goal" | "Habit" | "Calendar"; title: string; detail: string; href: string };
type SearchResponse = { results?: SearchResult[]; error?: string };
const resultIcons = { Task: Check, Goal: Flag, Habit: Flame, Calendar: CalendarDays };

export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    function onGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as SearchResponse;
        if (!response.ok) throw new Error(body.error || "Search is temporarily unavailable.");
        setResults(body.results ?? []);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Search is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
  }

  function selectResult(result: SearchResult) {
    close();
    router.push(result.href);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1)); }
    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); selectResult(results[activeIndex]!); }
  }

  return <>
    <button className="search-button" type="button" aria-label="Search your workspace" onClick={() => setOpen(true)}><Search size={16} /><span>Search tasks, goals, habits…</span><kbd>⌘ K</kbd></button>
    {open && <div className="global-search-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
        <h2 className="sr-only" id="global-search-title">Search your workspace</h2>
        <div className="global-search-input-row"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setActiveIndex(-1); if (value.trim().length < 2) { setResults([]); setError(""); setLoading(false); } else { setLoading(true); setError(""); } }} onKeyDown={onInputKeyDown} placeholder="Search tasks, goals, habits, calendar…" aria-label="Search saved workspace data" aria-controls="global-search-results" aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined} aria-autocomplete="list" role="combobox" aria-expanded={open} /><kbd>ESC</kbd><button type="button" onClick={close} aria-label="Close search"><X size={17} /></button></div>
        <div className="global-search-body" id="global-search-results" role="listbox" aria-label="Search results">
          {query.trim().length < 2 && <p className="global-search-hint">Search your saved tasks, goals, habits, and calendar events.</p>}
          {loading && <p className="global-search-state"><LoaderCircle className="global-search-spin" size={16} />Searching your workspace…</p>}
          {!loading && error && <p className="global-search-error" role="alert">{error}</p>}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p className="global-search-state">No saved items match “{query.trim()}”.</p>}
          {!loading && results.map((result, index) => {
            const Icon = resultIcons[result.type];
            return <button className={`global-search-result ${activeIndex === index ? "active" : ""}`} id={`global-search-result-${index}`} role="option" aria-selected={activeIndex === index} key={`${result.type}-${result.id}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectResult(result)}><span className="global-search-result-icon"><Icon size={16} /></span><span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span><span className="global-search-result-type">{result.type}</span></button>;
          })}
        </div>
        <footer className="global-search-footer"><span>↑↓ to navigate</span><span>Enter to open</span><span>Esc to close</span></footer>
      </section>
    </div>}
  </>;
}
