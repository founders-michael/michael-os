from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.title() for part in tail)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, alias_generator=to_camel, populate_by_name=True)


Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
LocalTime = Annotated[str, StringConstraints(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
DateOnly = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Priority = Literal["LOW", "MEDIUM", "HIGH"]


def _zone_exists(value: str) -> bool:
    try:
        ZoneInfo(value)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def _parse_timestamp(value: object) -> object:
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    return value


class UserContext(StrictModel):
    time_zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

    @field_validator("time_zone")
    @classmethod
    def valid_time_zone(cls, value: str) -> str:
        if not _zone_exists(value):
            raise ValueError("Use a valid IANA timezone identifier.")
        return value


class PlanningHorizon(StrictModel):
    from_: AwareDatetime = Field(alias="from")
    to: AwareDatetime

    @field_validator("from_", "to", mode="before")
    @classmethod
    def parse_timestamp(cls, value: object) -> object:
        return _parse_timestamp(value)

    @field_validator("from_", "to")
    @classmethod
    def minute_precision(cls, value: datetime) -> datetime:
        normalized = value.astimezone(timezone.utc)
        if normalized.second or normalized.microsecond:
            raise ValueError("Planning timestamps must align to whole minutes.")
        return normalized


class ScheduledActivity(StrictModel):
    id: Identifier
    start_at: AwareDatetime
    end_at: AwareDatetime
    event_type: Literal["TASK_SESSION", "COMMITMENT"]
    scheduling_mode: Literal["FIXED", "FLEXIBLE"]
    task_id: Identifier | None = None
    title: Title
    time_zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

    @field_validator("start_at", "end_at", mode="before")
    @classmethod
    def parse_timestamps(cls, value: object) -> object:
        return _parse_timestamp(value)

    @field_validator("start_at", "end_at")
    @classmethod
    def whole_minute(cls, value: datetime) -> datetime:
        normalized = value.astimezone(timezone.utc)
        if normalized.second or normalized.microsecond:
            raise ValueError("Event timestamps must align to whole minutes.")
        return normalized

    @field_validator("time_zone")
    @classmethod
    def valid_event_zone(cls, value: str) -> str:
        if not _zone_exists(value):
            raise ValueError("Use a valid IANA timezone identifier.")
        return value

    @model_validator(mode="after")
    def valid_interval_and_semantics(self) -> ScheduledActivity:
        if self.start_at >= self.end_at:
            raise ValueError("Event endAt must be later than startAt.")
        if self.event_type == "COMMITMENT" and (self.task_id is not None or self.scheduling_mode != "FIXED"):
            raise ValueError("Commitments must be fixed and cannot reference a task.")
        return self


class FlexibleTask(StrictModel):
    id: Identifier
    title: Title
    duration_minutes: int = Field(ge=5, le=1440)
    priority: Priority
    due_date: DateOnly | None = None
    earliest_start: AwareDatetime | None = None

    @field_validator("earliest_start", mode="before")
    @classmethod
    def parse_earliest_start(cls, value: object) -> object:
        return _parse_timestamp(value)

    @field_validator("due_date")
    @classmethod
    def real_calendar_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                if date.fromisoformat(value).isoformat() != value:
                    raise ValueError
            except ValueError as error:
                raise ValueError("Use a real calendar date in YYYY-MM-DD format.") from error
        return value

    @field_validator("earliest_start")
    @classmethod
    def whole_minute_earliest_start(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            normalized = value.astimezone(timezone.utc)
            if normalized.second or normalized.microsecond:
                raise ValueError("earliestStart must align to whole minutes.")
            return normalized
        return value


class AvailabilityWindow(StrictModel):
    id: Identifier
    iso_weekday: int = Field(ge=1, le=7)
    start_local_time: LocalTime
    end_local_time: LocalTime
    time_zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

    @field_validator("time_zone")
    @classmethod
    def valid_window_zone(cls, value: str) -> str:
        if not _zone_exists(value):
            raise ValueError("Use a valid IANA timezone identifier.")
        return value

    @model_validator(mode="after")
    def positive_same_day_interval(self) -> AvailabilityWindow:
        if self.start_local_time >= self.end_local_time:
            raise ValueError("Availability endLocalTime must be later than startLocalTime; overnight windows are unsupported.")
        return self


class UnavailableInterval(StrictModel):
    id: Identifier
    start_at: AwareDatetime
    end_at: AwareDatetime
    time_zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

    @field_validator("start_at", "end_at", mode="before")
    @classmethod
    def parse_timestamps(cls, value: object) -> object:
        return _parse_timestamp(value)

    @field_validator("start_at", "end_at")
    @classmethod
    def whole_minute(cls, value: datetime) -> datetime:
        normalized = value.astimezone(timezone.utc)
        if normalized.second or normalized.microsecond:
            raise ValueError("Unavailable timestamps must align to whole minutes.")
        return normalized

    @field_validator("time_zone")
    @classmethod
    def valid_zone(cls, value: str) -> str:
        if not _zone_exists(value):
            raise ValueError("Use a valid IANA timezone identifier.")
        return value

    @model_validator(mode="after")
    def positive_interval(self) -> UnavailableInterval:
        if self.start_at >= self.end_at:
            raise ValueError("Unavailable endAt must be later than startAt.")
        return self


class PlanningPreferences(StrictModel):
    granularity_minutes: Literal[15] = 15
    minimum_break_minutes: int = Field(default=0, ge=0, le=120)
    preferred_session_minutes: int = Field(default=60, ge=15, le=240)
    allow_task_splitting: bool = False
    minimum_split_session_minutes: int = Field(default=30, ge=15, le=240)


class PlannerConstraintInput(StrictModel):
    user: UserContext
    horizon: PlanningHorizon
    scheduled_activities: list[ScheduledActivity] = Field(max_length=500)
    flexible_tasks: list[FlexibleTask] = Field(max_length=100)
    recurring_availability: list[AvailabilityWindow] = Field(max_length=50)
    unavailable_intervals: list[UnavailableInterval] = Field(max_length=500)
    constraints: dict[str, Literal[True]]
    preferences: PlanningPreferences = Field(default_factory=PlanningPreferences)

    @model_validator(mode="after")
    def cross_field_invariants(self) -> PlannerConstraintInput:
        expected = {"preserveFixedEvents", "noOverlaps", "dueDatesAreDeadlinesOnly"}
        if set(self.constraints) != expected:
            raise ValueError("constraints must include preserveFixedEvents, noOverlaps, and dueDatesAreDeadlinesOnly, all set to true.")
        if self.horizon.from_ >= self.horizon.to:
            raise ValueError("horizon.to must be later than horizon.from.")
        zone = ZoneInfo(self.user.time_zone)
        first_date = self.horizon.from_.astimezone(zone).date()
        final_date = (self.horizon.to - timedelta(microseconds=1)).astimezone(zone).date()
        if (final_date - first_date).days + 1 > 7:
            raise ValueError("The planning horizon must cover no more than seven local calendar days.")
        if self.horizon.to - self.horizon.from_ > timedelta(days=8):
            raise ValueError("The planning horizon is too long.")
        self._unique_ids("scheduledActivities", [event.id for event in self.scheduled_activities])
        self._unique_ids("flexibleTasks", [task.id for task in self.flexible_tasks])
        self._unique_ids("recurringAvailability", [window.id for window in self.recurring_availability])
        self._unique_ids("unavailableIntervals", [item.id for item in self.unavailable_intervals])
        all_ids = [event.id for event in self.scheduled_activities]
        all_ids.extend(item.id for item in self.unavailable_intervals)
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("Calendar event identifiers must be unique across scheduled activities and unavailable intervals.")
        if len(all_ids) > 500:
            raise ValueError("scheduledActivities and unavailableIntervals may contain at most 500 combined intervals.")
        task_ids = {task.id for task in self.flexible_tasks}
        if any(event.task_id is not None and event.task_id in task_ids for event in self.scheduled_activities):
            raise ValueError("A task cannot be both flexible and represented as an existing task session in the same request.")
        for task in self.flexible_tasks:
            if task.earliest_start is not None and task.earliest_start >= self.horizon.to:
                raise ValueError(f"Task {task.id} earliestStart must be before the planning horizon ends.")
        by_day_zone: dict[tuple[int, str], list[AvailabilityWindow]] = {}
        for window in self.recurring_availability:
            key = (window.iso_weekday, window.time_zone)
            same_day = by_day_zone.setdefault(key, [])
            if any(window.start_local_time < other.end_local_time and window.end_local_time > other.start_local_time for other in same_day):
                raise ValueError("Recurring availability windows on the same weekday and timezone must not overlap.")
            same_day.append(window)
        return self

    @staticmethod
    def _unique_ids(label: str, values: list[str]) -> None:
        if len(values) != len(set(values)):
            raise ValueError(f"{label} must not contain duplicate identifiers.")
