"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Globe2, LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import TimeZoneSelector from "@/components/timezone-selector";
import { deviceTimeZone, reverseGeocodeUrl, REVERSE_GEOCODER_NAME } from "@/lib/device-location";
import { canonicalTimeZone, localTimeIn, normalizePlaceQuery, placeFromReverseGeocode, type Place } from "@/lib/place-search";

export type CityTimeZoneValue = { timeZone: string; locationLabel: string | null };

const SEARCH_DELAY_MS = 250;
const noSubscription = () => () => {};

type LocateState = "idle" | "confirming" | "locating" | "denied" | "failed";

/**
 * Pick where you are; the time zone follows. Three ways in, all optional:
 *
 * 1. Type a city — searched through `/api/places/search` (the server asks the
 *    geocoder, so the browser's IP never reaches it).
 * 2. "Use my current location" — first says what will happen, then the
 *    browser's own permission prompt asks. Only after both is the position,
 *    rounded to ~1 km, sent to BigDataCloud to name the city and its zone.
 *    Nothing about the position is saved; only the chosen city label is.
 * 3. "Choose a time zone instead" — the plain zone list, for anyone who knows
 *    it or whose city isn't found.
 *
 * Also offers the device's own zone in one tap. Every time zone shown comes
 * with the current time there, so the choice can be checked at a glance.
 */
export default function CityTimeZonePicker({ value, onChange, inputClassName, error }: {
  value: CityTimeZoneValue;
  onChange: (next: CityTimeZoneValue) => void;
  inputClassName?: string;
  error?: string;
}) {
  const id = useId();
  const listId = `${id}-results`;
  const rawDevice = useSyncExternalStore(noSubscription, deviceTimeZone, () => null);
  // Chrome reports retired names ("Asia/Calcutta"); compare and save the current one.
  const device = rawDevice ? canonicalTimeZone(rawDevice) : null;
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "empty" | "failed">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [locate, setLocate] = useState<LocateState>("idle");
  const [manual, setManual] = useState(false);
  const requestId = useRef(0);
  // Read through the external-store hook so the server render (no navigator)
  // and the first client render agree; the button appears after hydration.
  const geolocationAvailable = useSyncExternalStore(noSubscription, () => "geolocation" in navigator, () => false);

  // Debounced search; a newer keystroke makes an older response irrelevant.
  useEffect(() => {
    const normalized = normalizePlaceQuery(query);
    if (!normalized) return;
    const current = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearchState("searching");
      try {
        const response = await fetch(`/api/places/search?q=${encodeURIComponent(normalized)}`, { cache: "no-store" });
        const result = await response.json() as { places?: Place[]; error?: string };
        if (current !== requestId.current) return;
        if (!response.ok) { setPlaces([]); setSearchState("failed"); setSearchMessage(result.error ?? "City search isn't available right now."); return; }
        const found = result.places ?? [];
        setPlaces(found);
        setActive(found.length ? 0 : -1);
        setOpen(true);
        setSearchState(found.length ? "idle" : "empty");
      } catch {
        if (current !== requestId.current) return;
        setPlaces([]); setSearchState("failed"); setSearchMessage("We couldn't search right now. Check your connection, or choose a time zone instead.");
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(place: Place) {
    onChange({ timeZone: place.timeZone, locationLabel: place.label });
    setQuery("");
    setPlaces([]);
    setOpen(false);
    setActive(-1);
    setSearchState("idle");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !places.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % places.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + places.length) % places.length); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(places[active]!); }
    else if (event.key === "Escape") { setOpen(false); }
  }

  function useCurrentLocation() {
    setLocate("locating");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(reverseGeocodeUrl(position.coords.latitude, position.coords.longitude), { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error("lookup failed");
        const place = placeFromReverseGeocode(await response.json(), deviceTimeZone());
        if (!place) throw new Error("no place");
        choose(place);
        setLocate("idle");
      } catch { setLocate("failed"); }
    }, (failure) => setLocate(failure.code === failure.PERMISSION_DENIED ? "denied" : "failed"), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 });
  }

  const typed = normalizePlaceQuery(query) !== null;
  const showList = open && typed && places.length > 0;

  return <div className="m-city-picker">
    <div className="m-city-current" aria-live="polite">
      <MapPin size={16} aria-hidden="true" />
      <div>
        <strong>{value.locationLabel ?? value.timeZone}</strong>
        <span suppressHydrationWarning>{value.locationLabel ? `${value.timeZone} · ` : "Time zone · "}{localTimeIn(value.timeZone)} there now</span>
      </div>
    </div>

    {!manual ? <>
      <div className="m-city-search">
        <Search size={16} aria-hidden="true" />
        <input
          id={`${id}-search`}
          className={inputClassName}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-option-${active}` : undefined}
          aria-label="Search your city"
          aria-describedby={`${id}-help`}
          placeholder="Search your city, e.g. Bengaluru"
          autoComplete="off"
          value={query}
          maxLength={80}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); if (!normalizePlaceQuery(event.target.value)) { setPlaces([]); setSearchState("idle"); } }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => setOpen(true)}
        />
        {searchState === "searching" && typed && <LoaderCircle className="spin m-city-spinner" size={15} aria-label="Searching" />}
      </div>
      {showList && <ul id={listId} role="listbox" className="m-city-results" aria-label="Matching cities">
        {places.map((place, index) => <li
          key={place.id}
          id={`${id}-option-${index}`}
          role="option"
          aria-selected={index === active}
          className={index === active ? "m-on" : undefined}
          onMouseDown={(event) => { event.preventDefault(); choose(place); }}
          onMouseEnter={() => setActive(index)}
        >
          <strong>{place.city}</strong>
          <span>{[place.region, place.country].filter(Boolean).join(", ")}{place.region || place.country ? " · " : ""}{place.timeZone} · {localTimeIn(place.timeZone)}</span>
        </li>)}
      </ul>}
      <small id={`${id}-help`} className="m-city-help">
        {typed && searchState === "empty" ? "No cities match. Try a nearby larger city, or choose a time zone instead."
          : searchState === "failed" && typed ? searchMessage
            : "Type your city and pick it from the list; we set your time zone from it."}
      </small>

      <div className="m-city-actions">
        {geolocationAvailable && locate === "idle" && <button type="button" className="m-btn m-btn-sm" onClick={() => setLocate("confirming")}><LocateFixed size={14} aria-hidden="true" />Use my current location</button>}
        {device && device !== canonicalTimeZone(value.timeZone) && locate === "idle" && <button type="button" className="m-btn m-btn-g m-btn-sm" onClick={() => onChange({ timeZone: device, locationLabel: null })}>Use this device&apos;s time zone ({device})</button>}
        <button type="button" className="m-btn m-btn-g m-btn-sm" onClick={() => setManual(true)}><Globe2 size={14} aria-hidden="true" />Choose a time zone instead</button>
      </div>

      {locate === "confirming" && <div className="m-city-consent" role="group" aria-label="Share your location">
        <p>Your browser will ask for permission to share your location. It&apos;s rounded to about 1&nbsp;km and sent to {REVERSE_GEOCODER_NAME} only to find your city and its time zone. Your position isn&apos;t saved — only the city you end up choosing.</p>
        <div><button type="button" className="m-btn m-btn-p m-btn-sm" onClick={useCurrentLocation}>Continue</button><button type="button" className="m-btn m-btn-g m-btn-sm" onClick={() => setLocate("idle")}>Not now</button></div>
      </div>}
      {locate === "locating" && <p className="m-city-status" role="status"><LoaderCircle className="spin" size={14} aria-hidden="true" />Finding your city…</p>}
      {locate === "denied" && <p className="m-city-status" role="status">Location permission was declined. Search for your city instead — you can allow location later in your browser&apos;s site settings. <button type="button" className="m-city-link" onClick={() => setLocate("idle")}>OK</button></p>}
      {locate === "failed" && <p className="m-city-status" role="status">We couldn&apos;t find your city from your location. Search for it instead. <button type="button" className="m-city-link" onClick={useCurrentLocation}>Try again</button></p>}
    </> : <div className="m-city-manual">
      <TimeZoneSelector id={`${id}-zone`} className={inputClassName} value={value.timeZone} onChange={(timeZone) => onChange({ timeZone, locationLabel: null })} />
      <button type="button" className="m-city-link" onClick={() => setManual(false)}>Search by city instead</button>
    </div>}

    {error && <span className="settings-field-error m-city-error" role="alert">{error}</span>}
  </div>;
}
