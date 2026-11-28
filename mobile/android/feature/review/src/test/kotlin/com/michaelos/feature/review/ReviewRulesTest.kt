package com.michaelos.feature.review

import com.michaelos.core.model.DailyReview
import com.michaelos.core.model.ReflectionSave
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class ReviewRulesTest {
    @Test
    fun aMoveMustBeAfterTheReviewAndNotBeforeToday() {
        val review = LocalDate.of(2026, 11, 20)
        val today = LocalDate.of(2026, 11, 28)
        assertEquals(today, CarryForwardForm.earliest(review, today))
        assertEquals(today.plusDays(1), CarryForwardForm.earliest(today, today))
        assertEquals(CarryForwardForm.Problem.TooEarly, CarryForwardForm(today.minusDays(1)).problem(review, today))
        assertNull(CarryForwardForm(today).problem(review, today))
        val start = LocalTime.of(9, 0)
        assertEquals(CarryForwardForm.Problem.OneTime, CarryForwardForm(today, startTime = start).problem(review, today))
        assertEquals(CarryForwardForm.Problem.EndNotAfterStart, CarryForwardForm(today, start, start).problem(review, today))
    }

    @Test
    fun theSaveIsBuiltFieldByFieldWithoutUpdatedAt() {
        val loaded = apiJson.decodeFromString<DailyReview>(ContractExamples.example("review-today.json"))
        val draft =
            ReflectionDraft
                .of(loaded.reflection)
                .with(ReflectionDraft.Field.WentWell, "a".repeat(ReflectionDraft.TEXT_LIMIT + 5))
                .toggleSkipped("task-1")
        val body = apiJson.encodeToString(ReflectionSave.serializer(), draft.save(loaded.date))
        assertFalse(body.contains("updatedAt"))
        assertEquals(ReflectionDraft.TEXT_LIMIT, draft[ReflectionDraft.Field.WentWell].length)
        assertEquals(listOf("task-1"), draft.save(loaded.date).intentionallySkippedTaskIds)
        assertEquals(ReviewLine.Completed(done = 0, planned = 2, percent = 0, open = 2), ReviewLine.of(loaded))
    }
}
