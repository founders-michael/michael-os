from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models.requests import PlannerConstraintInput

SLOT_MINUTES = 15
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


@dataclass(frozen=True, order=True)
class MinuteInterval:
    start: int
    end: int

    @property
    def duration(self) -> int:
        return self.end - self.start


@dataclass(frozen=True)
class PreparedIntervals:
    available: tuple[MinuteInterval, ...]
    occupied: tuple[MinuteInterval, ...]
    free: tuple[MinuteInterval, ...]
    placement_free: tuple[MinuteInterval, ...]
    warnings: tuple[tuple[str, str], ...]


def to_minute(value: datetime) -> int:
    return int(value.astimezone(UTC).timestamp() // 60)


def from_minute(value: int) -> datetime:
    return EPOCH + timedelta(minutes=value)


def ceil_to_slot(value: int, granularity: int = SLOT_MINUTES) -> int:
    return ((value + granularity - 1) // granularity) * granularity


def _resolve_local_wall(local_value: datetime, zone: ZoneInfo) -> tuple[datetime | None, bool]:
    """Resolve a wall time, choosing the earliest instant for an ambiguous time."""
    valid: set[datetime] = set()
    for fold in (0, 1):
        candidate = local_value.replace(tzinfo=zone, fold=fold)
        instant = candidate.astimezone(UTC)
        if instant.astimezone(zone).replace(tzinfo=None) == local_value:
            valid.add(instant)
    if not valid:
        return None, False
    ordered = sorted(valid)
    return ordered[0], len(ordered) > 1


def _local_days(from_at: datetime, to_at: datetime, zone: ZoneInfo) -> list[date]:
    first = from_at.astimezone(zone).date()
    last = (to_at - timedelta(microseconds=1)).astimezone(zone).date()
    days: list[date] = []
    current = first
    while current <= last:
        days.append(current)
        current += timedelta(days=1)
    return days


def _merge(intervals: list[MinuteInterval]) -> list[MinuteInterval]:
    if not intervals:
        return []
    ordered = sorted(intervals)
    merged = [ordered[0]]
    for current in ordered[1:]:
        previous = merged[-1]
        if current.start <= previous.end:
            merged[-1] = MinuteInterval(previous.start, max(previous.end, current.end))
        else:
            merged.append(current)
    return merged


def _clip(interval: MinuteInterval, start: int, end: int) -> MinuteInterval | None:
    clipped = MinuteInterval(max(interval.start, start), min(interval.end, end))
    return clipped if clipped.start < clipped.end else None


def _subtract(available: list[MinuteInterval], occupied: list[MinuteInterval]) -> list[MinuteInterval]:
    result: list[MinuteInterval] = []
    merged_busy = _merge(occupied)
    for window in _merge(available):
        cursor = window.start
        for busy in merged_busy:
            if busy.end <= cursor:
                continue
            if busy.start >= window.end:
                break
            if busy.start > cursor:
                result.append(MinuteInterval(cursor, min(busy.start, window.end)))
            cursor = max(cursor, busy.end)
            if cursor >= window.end:
                break
        if cursor < window.end:
            result.append(MinuteInterval(cursor, window.end))
    return result


def _occupied_intervals(request: PlannerConstraintInput, horizon_start: int, horizon_end: int) -> list[MinuteInterval]:
    intervals: list[MinuteInterval] = []
    for event in request.scheduled_activities:
        clipped = _clip(MinuteInterval(to_minute(event.start_at), to_minute(event.end_at)), horizon_start, horizon_end)
        if clipped:
            intervals.append(clipped)
    for event in request.unavailable_intervals:
        clipped = _clip(MinuteInterval(to_minute(event.start_at), to_minute(event.end_at)), horizon_start, horizon_end)
        if clipped:
            intervals.append(clipped)
    return _merge(intervals)


def expand_availability(request: PlannerConstraintInput) -> tuple[list[MinuteInterval], list[tuple[str, str]]]:
    horizon_start = to_minute(request.horizon.from_)
    horizon_end = to_minute(request.horizon.to)
    intervals: list[MinuteInterval] = []
    warnings: list[tuple[str, str]] = []
    warned_ambiguous = False
    skipped_nonexistent = False
    for window in request.recurring_availability:
        zone = ZoneInfo(window.time_zone)
        start_time = time.fromisoformat(window.start_local_time)
        end_time = time.fromisoformat(window.end_local_time)
        for local_day in _local_days(request.horizon.from_, request.horizon.to, zone):
            if local_day.isoweekday() != window.iso_weekday:
                continue
            start, ambiguous_start = _resolve_local_wall(datetime.combine(local_day, start_time), zone)
            end, ambiguous_end = _resolve_local_wall(datetime.combine(local_day, end_time), zone)
            if start is None or end is None:
                skipped_nonexistent = True
                continue
            if ambiguous_start or ambiguous_end:
                warned_ambiguous = True
            start_minute = to_minute(start)
            end_minute = to_minute(end)
            clipped = _clip(MinuteInterval(start_minute, end_minute), horizon_start, horizon_end)
            if clipped:
                intervals.append(clipped)
    if not request.recurring_availability:
        warnings.append(("AVAILABILITY_UNCONFIGURED", "No recurring availability windows are configured; the planner will not assume any time is free."))
    if skipped_nonexistent:
        warnings.append(("DST_NONEXISTENT_AVAILABILITY_SKIPPED", "A recurring availability window fell on a nonexistent local time during a clock change and was skipped for that date."))
    if warned_ambiguous:
        warnings.append(("DST_AMBIGUOUS_TIME_EARLIER_INSTANT", "An ambiguous local availability boundary used its earlier matching instant."))
    return _merge(intervals), warnings


def prepare_intervals(request: PlannerConstraintInput) -> PreparedIntervals:
    start = to_minute(request.horizon.from_)
    end = to_minute(request.horizon.to)
    available, warnings = expand_availability(request)
    occupied = _occupied_intervals(request, start, end)
    free = _subtract(available, occupied)
    break_minutes = request.preferences.minimum_break_minutes
    if break_minutes:
        buffered = [MinuteInterval(max(start, item.start - break_minutes), min(end, item.end + break_minutes)) for item in occupied]
        placement_free = _subtract(available, buffered)
    else:
        placement_free = free
    return PreparedIntervals(tuple(available), tuple(occupied), tuple(free), tuple(placement_free), tuple(warnings))


def deadline_end(task_due_date: str, time_zone: str) -> datetime:
    """Return the first valid instant at or after local midnight after a due date."""
    local_day = date.fromisoformat(task_due_date) + timedelta(days=1)
    zone = ZoneInfo(time_zone)
    for minute in range(0, 181):
        local_boundary = datetime.combine(local_day, time.min) + timedelta(minutes=minute)
        resolved, _ambiguous = _resolve_local_wall(local_boundary, zone)
        if resolved is not None:
            return resolved
    raise ValueError("Could not resolve the local calendar-day deadline.")


def existing_conflicts(request: PlannerConstraintInput) -> list[dict[str, object]]:
    horizon_start = to_minute(request.horizon.from_)
    horizon_end = to_minute(request.horizon.to)
    events: list[tuple[str, str, int, int]] = []
    for event in request.scheduled_activities:
        clipped = _clip(MinuteInterval(to_minute(event.start_at), to_minute(event.end_at)), horizon_start, horizon_end)
        if clipped:
            events.append((event.id, event.event_type, clipped.start, clipped.end))
    for event in request.unavailable_intervals:
        clipped = _clip(MinuteInterval(to_minute(event.start_at), to_minute(event.end_at)), horizon_start, horizon_end)
        if clipped:
            events.append((event.id, "UNAVAILABLE", clipped.start, clipped.end))
    events.sort(key=lambda item: (item[2], item[3], item[0]))
    conflicts: list[dict[str, object]] = []
    for index, first in enumerate(events):
        for second in events[index + 1 :]:
            if second[2] >= first[3]:
                break
            if first[2] < second[3] and first[3] > second[2]:
                conflicts.append({
                    "existingEventId": first[0],
                    "otherEventId": second[0],
                    "proposedTaskId": None,
                    "startAt": from_minute(max(first[2], second[2])),
                    "endAt": from_minute(min(first[3], second[3])),
                    "eventType": f"{first[1]}_OVERLAPS_{second[1]}",
                })
    return conflicts
