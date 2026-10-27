import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { expandAvailabilityIntervals, intervalFitsAvailability } from "@/lib/calendar-availability";
import { availabilityUpdateSchema } from "@/lib/calendar-validation";

type Fixture = {
  name: string;
  horizon: { from: string; to: string };
  windows: { id: string; weekday: number; startTime: string; endTime: string; timeZone: string; active?: boolean }[];
  session: { start: string; end: string };
  fits: boolean;
  valid?: boolean;
  expectedIntervals?: { start: string; end: string }[];
};

const fixtures = JSON.parse(await readFile(new URL("../../shared/calendar-interval-fixtures.json", import.meta.url), "utf8")) as Fixture[];

describe("shared calendar interval contract", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      if (fixture.valid === false) {
        const validation = availabilityUpdateSchema.safeParse({ windows: fixture.windows.map(({ weekday, startTime, endTime, active }) => ({ weekday, startTime, endTime, active: active ?? true })) });
        assert.equal(validation.success, false);
        return;
      }
      const validation = availabilityUpdateSchema.safeParse({ windows: fixture.windows.map(({ weekday, startTime, endTime, timeZone, active }) => ({ weekday, startTime, endTime, timeZone, active: active ?? true })) });
      assert.equal(validation.success, true);
      const intervals = expandAvailabilityIntervals(fixture.windows, fixture.horizon);
      assert.equal(intervalFitsAvailability(fixture.session.start, fixture.session.end, intervals), fixture.fits);
      if (fixture.expectedIntervals) {
        assert.deepEqual(intervals.map((item) => ({ start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString() })), fixture.expectedIntervals);
      }
    });
  }
});
