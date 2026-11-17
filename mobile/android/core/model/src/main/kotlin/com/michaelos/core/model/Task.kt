@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalDate

@Serializable
data class Task(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: TaskStatus,
    val priority: TaskPriority,
    val estimatedDurationMinutes: Int? = null,
    val remainingDurationMinutes: Int? = null,
    val dueDate: LocalDate? = null,
    val completedAt: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable(with = TaskStatusSerializer::class)
enum class TaskStatus(
    override val wire: String,
) : OpenEnum {
    Todo("TODO"),
    InProgress("IN_PROGRESS"),
    Completed("COMPLETED"),
    Unknown("unknown"),
}

internal object TaskStatusSerializer : OpenEnumSerializer<TaskStatus>("TaskStatus", TaskStatus.entries, TaskStatus.Unknown)

@Serializable(with = TaskPrioritySerializer::class)
enum class TaskPriority(
    override val wire: String,
) : OpenEnum {
    Low("LOW"),
    Medium("MEDIUM"),
    High("HIGH"),
    Unknown("unknown"),
}

internal object TaskPrioritySerializer : OpenEnumSerializer<TaskPriority>("TaskPriority", TaskPriority.entries, TaskPriority.Unknown)

@Serializable
data class TaskResponse(
    val task: Task,
)

@Serializable
data class TaskPage(
    val tasks: List<Task>,
    val page: Int,
    val limit: Int,
    val total: Int,
    val pages: Int,
)
