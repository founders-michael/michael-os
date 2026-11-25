package com.michaelos.feature.assistant

import com.michaelos.core.data.AssistantRepository
import com.michaelos.core.data.CalendarRepository
import com.michaelos.core.data.GoalRepository
import com.michaelos.core.data.HabitRepository
import com.michaelos.core.data.MemoryRepository
import com.michaelos.core.data.TaskRepository
import javax.inject.Inject

/** The repositories the chat reads and the five a draft can be saved through. */
class AssistantRepositories
    @Inject
    constructor(
        val assistant: AssistantRepository,
        val tasks: TaskRepository,
        val goals: GoalRepository,
        val habits: HabitRepository,
        val calendar: CalendarRepository,
        val memories: MemoryRepository,
    )
