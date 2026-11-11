/**
 * The delivery risk formula. Pure arithmetic over integers so a score can be
 * reproduced by hand from the API response, and so W7.4 can interpret a number
 * it is structurally unable to change.
 *
 * Three rules govern this file:
 *  - An unavailable input is never defaulted. Not to 0, not to 50 — both are
 *    claims. The weights renormalise and `confidence` reports how much of the
 *    model was actually available.
 *  - Below half the model, there is no score at all.
 *  - Nothing is inferred. Slip magnitude, for instance, is unmeasurable here
 *    because due-date history keeps no previous value, so it is not reported.
 */

export const RISK_INPUT_WEIGHTS = {
  capacityPressure: 0.35,
  blockedProportion: 0.25,
  deadlineProximity: 0.20,
  historicalSlip: 0.20,
} as const;

export type RiskInputKey = keyof typeof RISK_INPUT_WEIGHTS;

/** Below this share of the model being available, no score is returned. */
export const MIN_SCORE_CONFIDENCE = 0.5;

/** Work exactly filling capacity scores 50; twice the capacity scores 100. */
export const CAPACITY_RATIO_AT_HALF_RISK = 1;

/** Proximity starts mattering this far from the deadline. */
export const PROXIMITY_HORIZON_DAYS = 60;

/** Slip needs this many completed, dated tasks before it is evidence. */
export const MIN_SLIP_SAMPLE = 5;

export const RISK_BAND_THRESHOLDS = [
  { band: "LOW", min: 0, max: 24 },
  { band: "MODERATE", min: 25, max: 49 },
  { band: "HIGH", min: 50, max: 74 },
  { band: "CRITICAL", min: 75, max: 100 },
] as const;

export type RiskBand = (typeof RISK_BAND_THRESHOLDS)[number]["band"];

export function bandFor(score: number): RiskBand {
  const match = RISK_BAND_THRESHOLDS.find((entry) => score >= entry.min && score <= entry.max);
  return match?.band ?? "CRITICAL";
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type UnavailableReason =
  | "NO_ESTIMATED_WORK"
  | "CAPACITY_SCOPE_UNAVAILABLE"
  | "NO_OPEN_TASKS"
  | "NO_TARGET_DATE"
  | "INSUFFICIENT_SLIP_HISTORY";

export type RiskInput<TRaw> =
  | { key: RiskInputKey; available: true; raw: TRaw; normalised: number; weight: number }
  | { key: RiskInputKey; available: false; raw: TRaw; unavailableReason: UnavailableReason; weight: number };

export type CapacityPressureRaw = {
  remainingWorkMinutes: number;
  remainingCapacityMinutes: number | null;
  ratio: number | null;
  capacityScope: string | null;
};

/**
 * remainingWork / remainingCapacity, scaled so ratio 1.0 is 50. Capacity at or
 * below zero with work outstanding is maximum pressure; with no work left it is
 * none.
 */
export function capacityPressureInput(raw: CapacityPressureRaw): RiskInput<CapacityPressureRaw> {
  const weight = RISK_INPUT_WEIGHTS.capacityPressure;
  if (raw.remainingCapacityMinutes === null) {
    return { key: "capacityPressure", available: false, raw, unavailableReason: "CAPACITY_SCOPE_UNAVAILABLE", weight };
  }
  if (raw.remainingWorkMinutes <= 0) {
    return { key: "capacityPressure", available: true, raw: { ...raw, ratio: 0 }, normalised: 0, weight };
  }
  if (raw.remainingCapacityMinutes <= 0) {
    return { key: "capacityPressure", available: true, raw: { ...raw, ratio: null }, normalised: 100, weight };
  }
  const ratio = raw.remainingWorkMinutes / raw.remainingCapacityMinutes;
  return {
    key: "capacityPressure",
    available: true,
    raw: { ...raw, ratio },
    normalised: clampPercent((ratio / CAPACITY_RATIO_AT_HALF_RISK) * 50),
    weight,
  };
}

export type BlockedRaw = { blockedOpenTasks: number; openTasks: number };

export function blockedProportionInput(raw: BlockedRaw): RiskInput<BlockedRaw> {
  const weight = RISK_INPUT_WEIGHTS.blockedProportion;
  if (raw.openTasks <= 0) {
    return { key: "blockedProportion", available: false, raw, unavailableReason: "NO_OPEN_TASKS", weight };
  }
  return {
    key: "blockedProportion",
    available: true,
    raw,
    normalised: clampPercent((raw.blockedOpenTasks / raw.openTasks) * 100),
    weight,
  };
}

export type ProximityRaw = { targetDate: string | null; daysRemaining: number | null; source: "MILESTONE" | "PROJECT" | null };

/**
 * Pure proximity to the deadline. Deliberately independent of work volume,
 * which capacity pressure already carries, so each input moves on its own.
 */
export function deadlineProximityInput(raw: ProximityRaw): RiskInput<ProximityRaw> {
  const weight = RISK_INPUT_WEIGHTS.deadlineProximity;
  if (raw.targetDate === null || raw.daysRemaining === null) {
    return { key: "deadlineProximity", available: false, raw, unavailableReason: "NO_TARGET_DATE", weight };
  }
  if (raw.daysRemaining <= 0) return { key: "deadlineProximity", available: true, raw, normalised: 100, weight };
  if (raw.daysRemaining >= PROXIMITY_HORIZON_DAYS) return { key: "deadlineProximity", available: true, raw, normalised: 0, weight };
  return {
    key: "deadlineProximity",
    available: true,
    raw,
    normalised: clampPercent(((PROXIMITY_HORIZON_DAYS - raw.daysRemaining) / PROXIMITY_HORIZON_DAYS) * 100),
    weight,
  };
}

export type SlipRaw = {
  completedWithDueDate: number;
  completedLate: number;
  lateCompletionRate: number | null;
  dueDateChanges: number;
  taskCount: number;
  churnPerTask: number | null;
};

/**
 * Lateness rate at 70%, deadline churn at 30%. Churn counts how often a due
 * date moved, never by how much: `UPDATED` activity records field names only,
 * so slip magnitude in days is not recoverable and is not reported.
 */
export function historicalSlipInput(raw: SlipRaw): RiskInput<SlipRaw> {
  const weight = RISK_INPUT_WEIGHTS.historicalSlip;
  if (raw.completedWithDueDate < MIN_SLIP_SAMPLE) {
    return { key: "historicalSlip", available: false, raw, unavailableReason: "INSUFFICIENT_SLIP_HISTORY", weight };
  }
  const lateRate = raw.completedLate / raw.completedWithDueDate;
  const churn = raw.taskCount > 0 ? Math.min(1, raw.dueDateChanges / raw.taskCount) : 0;
  return {
    key: "historicalSlip",
    available: true,
    raw: { ...raw, lateCompletionRate: lateRate, churnPerTask: churn },
    normalised: clampPercent(70 * lateRate + 30 * churn),
    weight,
  };
}

export type ScoredInput = {
  key: RiskInputKey;
  available: boolean;
  raw: unknown;
  normalised: number | null;
  weight: number;
  effectiveWeight: number | null;
  contribution: number | null;
  unavailableReason?: UnavailableReason;
};

export type RiskScore = {
  score: number | null;
  band: RiskBand | null;
  scoreUnavailable: "INSUFFICIENT_INPUTS" | null;
  confidence: number;
  inputs: ScoredInput[];
  bandThresholds: typeof RISK_BAND_THRESHOLDS;
};

/**
 * Weighted mean over available inputs only. Weights renormalise, and the
 * caller is told how much of the model that represents.
 */
export function scoreDeliveryRisk(inputs: ReadonlyArray<RiskInput<unknown>>): RiskScore {
  const available = inputs.filter((input): input is Extract<RiskInput<unknown>, { available: true }> => input.available);
  const confidence = Number(available.reduce((sum, input) => sum + input.weight, 0).toFixed(4));

  const scored: ScoredInput[] = inputs.map((input) => {
    if (!input.available) {
      return { key: input.key, available: false, raw: input.raw, normalised: null, weight: input.weight, effectiveWeight: null, contribution: null, unavailableReason: input.unavailableReason };
    }
    const effectiveWeight = confidence > 0 ? Number((input.weight / confidence).toFixed(4)) : null;
    return {
      key: input.key,
      available: true,
      raw: input.raw,
      normalised: input.normalised,
      weight: input.weight,
      effectiveWeight,
      contribution: effectiveWeight === null ? null : Number((input.normalised * effectiveWeight).toFixed(4)),
    };
  });

  if (confidence < MIN_SCORE_CONFIDENCE) {
    // Under half the model is not a score, so none is offered.
    return { score: null, band: null, scoreUnavailable: "INSUFFICIENT_INPUTS", confidence, inputs: scored, bandThresholds: RISK_BAND_THRESHOLDS };
  }

  const weighted = available.reduce((sum, input) => sum + input.weight * input.normalised, 0);
  const score = Math.round(weighted / confidence);
  return { score, band: bandFor(score), scoreUnavailable: null, confidence, inputs: scored, bandThresholds: RISK_BAND_THRESHOLDS };
}

// ------------------------------------------------------------------ forecast

export const FORECAST_WINDOW_DAYS = 28;
export const MIN_FORECAST_COMPLETIONS = 3;
export const MIN_FORECAST_PROJECT_AGE_DAYS = 14;

export type ForecastBasis = {
  windowDays: number;
  completions: number;
  weeklyCounts: number[];
  openTaskCount: number;
  tasksPerDay: number | null;
  projectAgeDays: number;
};

export type Forecast = {
  expectedCompletionDays: number | null;
  earliestCompletionDays: number | null;
  /** Null means unbounded: the slowest observed week completed nothing. */
  latestCompletionDays: number | null;
  basis: ForecastBasis;
};

export type ForecastResult =
  | { available: true; forecast: Forecast }
  | { available: false; forecastUnavailable: "INSUFFICIENT_HISTORY"; basis: ForecastBasis };

/**
 * Throughput extrapolation on task COUNT. It ignores estimates and ignores
 * dependencies — a chain of ten blocked tasks forecasts like ten independent
 * ones — which is why the risk score carries the blocked term separately.
 */
export function forecastCompletion(input: {
  weeklyCounts: number[];
  openTaskCount: number;
  projectAgeDays: number;
  windowDays?: number;
}): ForecastResult {
  const windowDays = input.windowDays ?? FORECAST_WINDOW_DAYS;
  const completions = input.weeklyCounts.reduce((sum, count) => sum + Math.max(0, count), 0);
  const basis: ForecastBasis = {
    windowDays,
    completions,
    weeklyCounts: input.weeklyCounts,
    openTaskCount: input.openTaskCount,
    tasksPerDay: completions > 0 ? Number((completions / windowDays).toFixed(4)) : 0,
    projectAgeDays: input.projectAgeDays,
  };

  if (completions < MIN_FORECAST_COMPLETIONS || input.projectAgeDays < MIN_FORECAST_PROJECT_AGE_DAYS) {
    return { available: false, forecastUnavailable: "INSUFFICIENT_HISTORY", basis };
  }
  if (input.openTaskCount <= 0) {
    return { available: true, forecast: { expectedCompletionDays: 0, earliestCompletionDays: 0, latestCompletionDays: 0, basis } };
  }

  const perDay = completions / windowDays;
  const fastestWeek = Math.max(...input.weeklyCounts);
  const slowestWeek = Math.min(...input.weeklyCounts);
  return {
    available: true,
    forecast: {
      expectedCompletionDays: Math.ceil(input.openTaskCount / perDay),
      earliestCompletionDays: fastestWeek > 0 ? Math.ceil((input.openTaskCount / fastestWeek) * 7) : null,
      // A week with zero completions gives no finite bound; say so.
      latestCompletionDays: slowestWeek > 0 ? Math.ceil((input.openTaskCount / slowestWeek) * 7) : null,
      basis,
    },
  };
}
