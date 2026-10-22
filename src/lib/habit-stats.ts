export type HabitFrequencyValue = "DAILY" | "SELECTED_DAYS";
export type HabitStatsInput = {
  frequency: HabitFrequencyValue;
  weekdays: number[];
  createdLocalDate: string;
  today: string;
  checkInDates: string[];
};

/** ISO weekday numbering is used throughout: Monday 1, ..., Sunday 7. */
export function isoWeekday(localDate: string): number {
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isHabitScheduled(frequency: HabitFrequencyValue, weekdays: number[], localDate: string) {
  return frequency === "DAILY" || weekdays.includes(isoWeekday(localDate));
}

export function shiftLocalDate(localDate: string, offset: number) {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function calculateHabitStats(input: HabitStatsInput) {
  const checkIns = new Set(input.checkInDates);
  const created = input.createdLocalDate > input.today ? input.today : input.createdLocalDate;

  // The percentage window is the last 30 local calendar dates, inclusive. Only dates
  // since creation that were scheduled under the current frequency are eligible.
  const periodStart = created > shiftLocalDate(input.today, -29) ? created : shiftLocalDate(input.today, -29);
  let eligibleDays = 0;
  let completedDays = 0;
  for (let date = periodStart; date <= input.today; date = shiftLocalDate(date, 1)) {
    if (!isHabitScheduled(input.frequency, input.weekdays, date)) continue;
    eligibleDays += 1;
    if (checkIns.has(date)) completedDays += 1;
  }
  const completionPercentage = eligibleDays === 0 ? 0 : Math.round((completedDays / eligibleDays) * 100);

  // An incomplete habit scheduled for today gets the remainder of the local day;
  // it neither breaks its current streak nor counts as the latest completed day.
  const currentAnchor = isHabitScheduled(input.frequency, input.weekdays, input.today) && !checkIns.has(input.today)
    ? shiftLocalDate(input.today, -1)
    : input.today;
  let currentStreak = 0;
  for (let date = currentAnchor; date >= created; date = shiftLocalDate(date, -1)) {
    if (!isHabitScheduled(input.frequency, input.weekdays, date)) continue;
    if (!checkIns.has(date)) break;
    currentStreak += 1;
  }

  // The active schedule is applied to all retained check-in history. If schedule
  // settings change later, history remains intact but historical streaks recalculate.
  let bestStreak = 0;
  let run = 0;
  for (let date = created; date <= input.today; date = shiftLocalDate(date, 1)) {
    if (!isHabitScheduled(input.frequency, input.weekdays, date)) continue;
    if (checkIns.has(date)) {
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  return { currentStreak, bestStreak, completionPercentage, eligibleDays, completedDays, periodStart, periodEnd: input.today };
}
