package com.michaelos.core.designsystem.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
private fun ThemePreview(content: @Composable ColumnScope.() -> Unit) {
    MichaelTheme {
        MichaelBackground {
            Column(
                Modifier.padding(MichaelSpace.screenGutter),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
                content = content,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun ButtonsPreview() =
    ThemePreview {
        MichaelButton("Primary", {})
        MichaelButton("Secondary", {}, style = MichaelButtonStyle.Secondary)
        MichaelButton("Ghost", {}, style = MichaelButtonStyle.Ghost)
        MichaelButton("Destructive", {}, style = MichaelButtonStyle.Destructive)
        MichaelButton("Disabled", {}, style = MichaelButtonStyle.Secondary, enabled = false)
    }

@PreviewLightDark
@Composable
private fun ChipsPreview() =
    ThemePreview {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelChip("Today")
            MichaelChip("From Michael", tone = MichaelChipTone.Ai)
            MichaelChip("Due in 9 days", tone = MichaelChipTone.Warn)
            MichaelChip("Overdue", tone = MichaelChipTone.Danger)
        }
    }

@PreviewLightDark
@Composable
private fun FieldsPreview() =
    ThemePreview {
        MichaelTextField("Field", "Send the investor update", {})
        MichaelTextField("Estimate, minutes", "2", {}, error = "Use at least 5 minutes, or leave it empty.")
    }

@PreviewLightDark
@Composable
private fun ControlsPreview() =
    ThemePreview {
        var checked by remember { mutableStateOf(false) }
        var on by remember { mutableStateOf(true) }
        var segment by remember { mutableStateOf("Pending") }
        Row {
            MichaelCheck(checked, "Send the investor update", { checked = it })
            MichaelCheck(true, "Done", {})
        }
        MichaelSegmentedControl(listOf("Pending", "Overdue", "Completed"), segment, { segment = it }, { it })
        MichaelToggle("Daily plan reminder", on, { on = it })
    }

@PreviewLightDark
@Composable
private fun CardsPreview() =
    ThemePreview {
        MichaelCard { MichaelProgressBar(0.43f) }
        AICard { MichaelText("Michael's surface.", MichaelTextStyle.Label, MichaelTheme.colors.text) }
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            StatTile("7", "Planned", Modifier.weight(1f))
            StatTile("5", "Completed", Modifier.weight(1f), highlighted = true)
            StatTile("2", "Missed", Modifier.weight(1f))
        }
    }

@PreviewLightDark
@Composable
private fun MichaelPreview() =
    ThemePreview {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xl)) {
            MichaelOrb(MichaelOrbSize.Small)
            MichaelOrb(MichaelOrbSize.Large)
            MichaelOrb(MichaelOrbSize.Large, activity = MichaelOrbActivity.Thinking)
        }
        TypingDots()
        SkeletonBlock(height = MichaelSpace.lg)
    }

@PreviewLightDark
@Composable
private fun StatesPreview() =
    ThemePreview {
        OfflineBanner("You're offline. Showing your day as of 17:42.", {})
        EmptyStateView("Nothing planned for today", "Add what's on your mind.", "Add a task", {})
        FailureStateView("We couldn't load your tasks.", {})
    }
