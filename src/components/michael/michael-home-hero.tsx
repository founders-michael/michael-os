"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, Clock3, LoaderCircle, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { cityFromReverseGeocode, deviceTimeZone, locationFromTimeZone, PRECISE_CITY_STORAGE_KEY, readPreciseCity, REVERSE_GEOCODER_NAME, reverseGeocodeUrl, sameLocalTime, type PreciseCity } from "@/lib/device-location";
import { Collapsible } from "@animate-ui/react/primitives/radix-ui";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import MichaelPresence from "@/components/michael/michael-presence";
import type { HomeAskPrompt } from "@/lib/my-day-model";

const CLOCK_TICK_MS = 30_000;

/**
 * The user's local time, first rendered from the server's `now` (so the
 * server and client markup agree) and then kept current while the page is open.
 */
function LocalClock({ now, timeZone }: { now: string; timeZone: string }) {
  const [instant, setInstant] = useState(() => new Date(now));
  useEffect(() => {
    const id = setInterval(() => setInstant(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return <time dateTime={instant.toISOString()}>{new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(instant)}</time>;
}

const noSubscription = () => () => {};

const PRECISE_CITY_EVENT = "michael-precise-city";

/** The remembered city, read from this browser only; changes in other tabs and here both re-render. */
function subscribePreciseCity(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PRECISE_CITY_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(PRECISE_CITY_EVENT, onChange); };
}
function storedPreciseCity() {
  try { return localStorage.getItem(PRECISE_CITY_STORAGE_KEY); } catch { return null; }
}
function writePreciseCity(value: PreciseCity | null) {
  try {
    if (value) localStorage.setItem(PRECISE_CITY_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(PRECISE_CITY_STORAGE_KEY);
  } catch { /* storage unavailable: the city lasts this page only */ }
  window.dispatchEvent(new Event(PRECISE_CITY_EVENT));
}

type LocateStatus = "idle" | "confirming" | "locating" | "denied" | "failed";

/**
 * Where the user is opening MichaelOS from, and the time there.
 *
 * By default the city comes from the device's time zone: no prompt, nothing
 * sent anywhere — but a zone names one city for a whole region (Bengaluru
 * reports Asia/Kolkata). "Show my city" is an explicit opt-in: it first says
 * what will happen, then the browser's own permission prompt asks, and only
 * then is the position, rounded to ~1 km, sent to BigDataCloud to name the
 * city. Only the city name is kept, in this browser, for 12 hours, and
 * "Forget" removes it. Nothing reaches the user's account or our server.
 *
 * Renders after hydration: the server cannot know the device's zone.
 */
function DeviceLocationCard({ planTimeZone, planLocation }: { planTimeZone: string; planLocation: string | null }) {
  const zone = useSyncExternalStore(noSubscription, deviceTimeZone, () => null);
  const storedCity = useSyncExternalStore(subscribePreciseCity, storedPreciseCity, () => null);
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState<LocateStatus>("idle");
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  if (!zone) return null;

  const precise = readPreciseCity(storedCity, now.getTime());
  const place = locationFromTimeZone(zone);
  const time = new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(now);
  const differs = !sameLocalTime(zone, planTimeZone, now);
  const planTime = new Intl.DateTimeFormat("en", { timeZone: planTimeZone, hour: "numeric", minute: "2-digit" }).format(now);
  const geolocationAvailable = typeof navigator !== "undefined" && "geolocation" in navigator;

  function locate() {
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(reverseGeocodeUrl(position.coords.latitude, position.coords.longitude), { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error("lookup failed");
        const city = cityFromReverseGeocode(await response.json());
        if (!city) throw new Error("no city");
        writePreciseCity(city);
        setStatus("idle");
      } catch { setStatus("failed"); }
    }, (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "failed"), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 });
  }

  const note = differs
    ? `Your plans use ${planLocation ? planLocation.split(", ")[0] : planTimeZone} time · ${planTime} there`
    : precise ? `Your location${precise.region ? ` · ${precise.region}` : ""}` : `From your device's time zone${place.region ? ` · ${place.region}` : ""}`;

  return <div className={`m-home-location${differs ? " m-home-location-away" : ""}`}>
    <div className="m-home-location-row">
      <MapPin size={15} aria-hidden="true" />
      <span className="m-home-location-place">{precise?.city ?? place.city ?? zone}</span>
      <time className="m-mono m-home-location-time" dateTime={now.toISOString()}>{time}</time>
    </div>
    <span className="m-home-location-note">{note}</span>

    {precise
      ? <button type="button" className="m-home-location-link" onClick={() => { writePreciseCity(null); setStatus("idle"); }}>Forget my city</button>
      : geolocationAvailable && <>
        {status === "idle" && <button type="button" className="m-home-location-link" onClick={() => setStatus("confirming")}>Show my city</button>}
        {status === "confirming" && <div className="m-home-location-consent" role="group" aria-label="Share your location">
          <p>Your browser will ask for your location. It is rounded to about 1&nbsp;km and sent to {REVERSE_GEOCODER_NAME} only to look up the city name. Just the city is kept, in this browser, for 12 hours — not in your account.</p>
          <div><button type="button" className="m-btn m-btn-p m-btn-sm" onClick={locate}>Allow</button><button type="button" className="m-btn m-btn-g m-btn-sm" onClick={() => setStatus("idle")}>Not now</button></div>
        </div>}
        {status === "locating" && <span className="m-home-location-status" role="status"><LoaderCircle size={13} className="my-day-spin" aria-hidden="true" />Finding your city…</span>}
        {status === "denied" && <span className="m-home-location-status" role="status">Location permission was declined, so the city comes from your time zone. You can allow it in your browser&apos;s site settings.</span>}
        {status === "failed" && <span className="m-home-location-status" role="status">Couldn&apos;t look up your city. <button type="button" className="m-home-location-link" onClick={locate}>Try again</button></span>}
      </>}
  </div>;
}

/**
 * The top of Home: Michael, the user's day in one line, and what to ask next.
 *
 * Everything in it is computed from the user's saved data by the tested
 * helpers in `my-day-model.ts` — the greeting on the user's own clock, the
 * briefing from real counts, the prompts from the same counts. None of it is
 * generated by a model: the page must not spend a model turn, or send the
 * user's data anywhere, just because it was opened. The prompts only open
 * the assistant with a question filled in.
 */
export default function MichaelHomeHero({ greeting, name, dateLabel, now, timeZone, locationLabel, wakeUpTime, focusSessionMinutes, briefing, attention, basis, prompts, refreshing, onRefresh }: {
  greeting: string;
  name: string;
  dateLabel: string;
  now: string;
  timeZone: string;
  /** The saved city ("Bengaluru, Karnataka, India"); shown instead of the zone name when set. */
  locationLabel: string | null;
  wakeUpTime: string;
  focusSessionMinutes: number;
  briefing: string;
  /** Overdue plus due today; `null` when tasks could not be loaded. */
  attention: number | null;
  basis: ReactNode;
  prompts: HomeAskPrompt[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="m-ai m-home-hero" aria-labelledby="michael-home-greeting">
      <span className="m-orbw m-home-orb" aria-hidden="true">
        <span className="m-ring" /><span className="m-ring m-r2" />
        <MichaelPresence state="idle" size="xl" />
      </span>

      <div className="m-home-copy">
        <div className="m-eyebrow"><span className="m-live" aria-hidden="true" /><span>{dateLabel} · <LocalClock now={now} timeZone={timeZone} /> · <span title={timeZone}>{locationLabel ? locationLabel.split(", ")[0] : timeZone}</span></span></div>
        <h1 id="michael-home-greeting" className="m-display m-home-greeting">{greeting}, <span className="m-glow">{name}</span></h1>
        <p className="m-home-briefing"><span className="m-neon">Michael · </span>{briefing}</p>

        <Collapsible.Root className="m-home-basis">
          <Collapsible.Trigger className="m-home-basis-trigger">
            See what this is based on <ChevronDown className="m-home-basis-chevron" size={14} aria-hidden="true" />
          </Collapsible.Trigger>
          <Collapsible.Content className="m-home-basis-content">{basis}</Collapsible.Content>
        </Collapsible.Root>

        {prompts.length > 0 && (
          <nav className="m-home-prompts" aria-label="Ask Michael about your day">
            {prompts.map((prompt) => (
              <Link key={prompt.href} href={prompt.href} className="m-prompt">
                <Sparkles size={15} aria-hidden="true" />
                <span>{prompt.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="m-home-side">
        <div className="m-stat m-stat-glow">
          {/* initiallyStable: without it the counter SSRs 0 and counts up, briefly showing a wrong figure. */}
          <b>{attention === null ? "—" : <SlidingNumber number={attention} initiallyStable />}</b>
          <span className="m-muted">{attention === 1 ? "needs attention" : "need attention"}</span>
        </div>
        <DeviceLocationCard planTimeZone={timeZone} planLocation={locationLabel} />
        <div className="m-chip m-home-rhythm"><Clock3 size={14} aria-hidden="true" /> Wake {wakeUpTime} · {focusSessionMinutes} min focus</div>
        <button className="m-btn m-btn-g m-btn-sm m-home-refresh" type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh today's overview">
          {refreshing ? <LoaderCircle className="my-day-spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          {refreshing ? "Refreshing" : "Refresh brief"}
        </button>
      </div>
    </section>
  );
}
