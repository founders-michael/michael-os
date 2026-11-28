package com.michaelos.feature.calendar

import com.michaelos.core.model.AppError
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.CalendarEventType
import com.michaelos.core.model.CalendarEventsPage
import com.michaelos.core.model.PlanningProposalResponse
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

class CalendarRulesTest {
    private val auckland = ZonedClock("Pacific/Auckland")
    private val day = LocalDate.of(2026, 11, 30)

    private fun event(
        id: String,
        start: String,
        end: String,
    ) = GridItem.Event(
        CalendarEvent(
            id,
            eventType = CalendarEventType.Commitment,
            title = id,
            startAt = Instant.parse(start),
            endAt = Instant.parse(end),
            timeZone = "Pacific/Auckland",
        ),
    )

    @Test
    fun eventsSitOnTheProfileClockAndOverlapsShareTheWidth() {
        val events =
            listOf(
                event("standup", "2026-11-29T20:00:00Z", "2026-11-29T21:00:00Z"),
                event("review", "2026-11-29T20:30:00Z", "2026-11-29T21:30:00Z"),
                event("ping", "2026-11-29T22:00:00Z", "2026-11-29T22:10:00Z"),
                event("train", "2026-11-30T10:00:00Z", "2026-11-30T12:30:00Z"),
            )
        val byId = DayLayout.place(events, day, auckland).associateBy { it.item.event.id }
        assertEquals(9 * 60, byId.getValue("standup").startMinute)
        assertEquals(2, byId.getValue("standup").columns)
        assertEquals(1, byId.getValue("review").column)
        assertEquals(11 * 60 + 30, byId.getValue("ping").endMinute)
        assertTrue(byId.getValue("train").continuesAfter)
        assertEquals(DayLayout.MINUTES_PER_DAY, byId.getValue("train").endMinute)
        val nextDay = DayLayout.place(events, day.plusDays(1), auckland)
        assertEquals(listOf("train"), nextDay.map { it.item.event.id })
        assertEquals(0 to 90, nextDay.first().startMinute to nextDay.first().endMinute)
        val kolkata = DayLayout.place(events, day, ZonedClock("Asia/Kolkata"))
        assertEquals(90, kolkata.first { it.item.event.id == "standup" }.startMinute)
    }

    @Test
    fun anEndBeforeTheStartIsTheNextDayAndAnEqualOneIsRefused() {
        var form =
            EventForm
                .new(day, auckland, auckland.instant(day.minusDays(1)))
                .copy(title = "Night train", kind = EventKind.Unavailable, taskId = "task")
                .withStart(LocalTime.of(23, 0))
                .withEnd(LocalTime.of(1, 30))
        assertTrue(form.endsNextDay)
        val body = form.create(auckland)!!
        assertNull(body.taskId)
        assertEquals(150L * 60, body.endAt.epochSecond - body.startAt.epochSecond)
        assertEquals(day.plusDays(1), auckland.date(body.endAt))
        form = form.withEnd(form.start)
        assertEquals(listOf(EventForm.Problem.NoLength), form.problems)
        assertNull(form.create(auckland))

        val listed = apiJson.decodeFromString<CalendarEventsPage>(ContractExamples.example("calendar-events-list.json"))
        val train = listed.events.first { it.title == "Night train" }
        val edited = EventForm.of(train, auckland)
        assertTrue(edited.endsNextDay)
        assertEquals(train.startAt to train.endAt, edited.interval(auckland))
        val session = listed.events.first { it.eventType == CalendarEventType.TaskSession }
        val json =
            apiJson.encodeToString(
                com.michaelos.core.model.CalendarEventUpdate
                    .serializer(),
                EventForm.of(session, auckland).update(auckland)!!,
            )
        assertTrue(json.contains("\"taskId\":\"${session.taskId}\""))
        assertFalse(json.contains("eventType"))
    }

    @Test
    fun aPlanAppliesOnlyWhatIsKeptAndAStaleOneAsksForANewPlan() {
        val proposal = apiJson.decodeFromString<PlanningProposalResponse>(ContractExamples.example("calendar-plan.json")).proposal
        var review = PlanReview(proposal)
        val session = review.sessions.first()
        assertEquals(1, review.keptCount)
        assertEquals("Draft the quarterly letter", review.title(session.taskId))
        assertEquals(2, review.notes.size)
        assertFalse(review.needsAvailability)
        review = review.toggle(session)
        assertNull(review.apply)
        review = review.toggle(session)
        assertEquals(listOf(session.selectionId), review.apply?.selectedSessionIds)
        assertTrue(review.isExpired(proposal.approvalExpiresAt))
        assertFalse(review.isExpired(proposal.approvalExpiresAt.minusSeconds(1)))
        assertFalse(review.toString().contains(proposal.approvalToken))

        assertEquals(PlanProblem.Stale("Used."), PlanProblem.of(AppError.Conflict(ServerMessage("Used.", "PROPOSAL_USED"))))
        assertEquals(
            PlanProblem.Stale("Expired."),
            PlanProblem.of(AppError.Validation(ServerMessage("Expired.", "PROPOSAL_EXPIRED"), emptyMap())),
        )
        assertEquals(
            PlanProblem.Refused("Too long."),
            PlanProblem.of(AppError.Validation(ServerMessage("Too long.", "INVALID_HORIZON"), emptyMap())),
        )
        val down = AppError.Server(ServerMessage(code = "SOLVER_FAILURE"))
        assertEquals(PlanProblem.Unavailable(down), PlanProblem.of(down))

        var range = PlanRange(day)
        assertTrue(range.isValid(day))
        assertFalse(range.isValid(day.plusDays(1)))
        range = range.copy(last = day.plusDays(8))
        assertFalse(range.isValid(day))
        range = range.withFirst(day.plusDays(1))
        assertEquals(day.plusDays(3), range.last)
    }
}
