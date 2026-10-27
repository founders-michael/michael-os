"use client";

import { useMemo } from "react";
import { createTimeZoneOptions, resolveTimeZoneChoice } from "@/lib/timezone-options";

export default function TimeZoneSelector({ id, value, onChange, className }: { id: string; value: string; onChange: (value: string) => void; className?: string }) {
  const zones = useMemo(() => createTimeZoneOptions(), []);
  const byZone = useMemo(() => new Map(zones.map((zone) => [zone.timeZone, zone.label])), [zones]);
  function change(next: string) {
    onChange(resolveTimeZoneChoice(next, zones));
  }

  return <>
    <input id={id} className={className} list={`${id}-options`} value={byZone.get(value) ?? value} onChange={(event) => change(event.target.value)} autoComplete="off" placeholder="Search city or timezone" required aria-describedby={`${id}-help`} />
    <datalist id={`${id}-options`}>{zones.map(({ timeZone, label }) => <option key={timeZone} value={label}>{timeZone}</option>)}</datalist>
    <small id={`${id}-help`}>Search a city or region; the saved value is its IANA timezone.</small>
  </>;
}
