package com.michaelos.app

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbActivity
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelProgressBar
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.MichaelToggle
import com.michaelos.core.designsystem.component.OfflineBanner
import com.michaelos.core.designsystem.component.SkeletonBlock
import com.michaelos.core.designsystem.component.StatTile
import com.michaelos.core.designsystem.component.TypingDots
import com.michaelos.core.designsystem.theme.MichaelColors
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

private enum class Segment(val title: Int) {
    Pending(R.string.gallery_segment_pending),
    Overdue(R.string.gallery_segment_overdue),
    Completed(R.string.gallery_segment_completed),
}

private enum class Section(val title: Int) {
    Buttons(R.string.gallery_buttons),
    Chips(R.string.gallery_chips),
    Fields(R.string.gallery_fields),
    Cards(R.string.gallery_cards),
    Controls(R.string.gallery_controls),
    Michael(R.string.gallery_michael),
    States(R.string.gallery_states),
    Colors(R.string.gallery_colors),
}

private const val TOTAL = 7
private const val INITIAL_COMPLETED = 3
private const val LARGE_FONT_SCALE = 1.5f
private const val SWATCHES_PER_ROW = 4
private const val SKELETON_TITLE_WIDTH = 1.5f
private const val SKELETON_CHIP_WIDTH = 0.66f

@Composable
fun ComponentGallery() {
    val scroll = rememberScrollState()
    val sectionTops = remember { mutableStateMapOf<String, Int>() }
    var thinking by rememberSaveable { mutableStateOf(true) }
    // Launch with `--es gallerySection light.cards` to open at a section when checking on an emulator.
    val target = LocalActivity.current?.intent?.getStringExtra("gallerySection")
    val targetTop = target?.let { sectionTops[it] }
    LaunchedEffect(targetTop) {
        if (targetTop != null) scroll.scrollTo(targetTop)
    }
    MichaelBackground {
        Column(
            modifier =
                Modifier
                    .verticalScroll(scroll)
                    .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            listOf("dark" to true, "light" to false).forEach { (panel, dark) ->
                MichaelTheme(darkTheme = dark) {
                    MichaelBackground {
                        Column(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.xxl),
                            verticalArrangement = Arrangement.spacedBy(MichaelSpace.xl),
                        ) {
                            MichaelText(
                                stringResource(if (dark) R.string.gallery_dark else R.string.gallery_light),
                                MichaelTextStyle.Display,
                                MichaelTheme.colors.text,
                                modifier = Modifier.semantics { heading() },
                            )
                            Section.entries.forEach { section ->
                                val key = "$panel.${section.name.lowercase()}"
                                Column(
                                    modifier =
                                        Modifier.onGloballyPositioned {
                                            sectionTops[key] = it.positionInRoot().y.toInt() + scroll.value
                                        },
                                    verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
                                ) {
                                    GallerySection(section, thinking) { thinking = it }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.GallerySection(
    section: Section,
    thinking: Boolean,
    onThinkingChange: (Boolean) -> Unit,
) {
    MichaelText(
        stringResource(section.title),
        MichaelTextStyle.Eyebrow,
        MichaelTheme.colors.faint,
        modifier = Modifier.semantics { heading() },
    )
    when (section) {
        Section.Buttons -> Buttons()
        Section.Chips -> Chips()
        Section.Fields -> Fields()
        Section.Cards -> Cards()
        Section.Controls -> Controls(thinking, onThinkingChange)
        Section.Michael -> Michael(thinking)
        Section.States -> States()
        Section.Colors -> Swatches()
    }
}

@Composable
private fun Buttons() {
    MichaelButton(stringResource(R.string.gallery_primary), {}, Modifier.fillMaxWidth())
    MichaelButton(stringResource(R.string.gallery_secondary), {}, Modifier.fillMaxWidth(), style = MichaelButtonStyle.Secondary)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelButton(stringResource(R.string.gallery_ghost), {}, style = MichaelButtonStyle.Ghost)
        MichaelButton(stringResource(R.string.gallery_disabled), {}, style = MichaelButtonStyle.Secondary, enabled = false)
        MichaelButton(stringResource(R.string.gallery_destructive), {}, style = MichaelButtonStyle.Destructive)
    }
}

@Composable
private fun Chips() {
    var checked by rememberSaveable { mutableStateOf(false) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelChip(stringResource(R.string.gallery_chip_today))
        MichaelChip(stringResource(R.string.gallery_chip_ai), tone = MichaelChipTone.Ai)
        MichaelChip(stringResource(R.string.gallery_chip_warn), tone = MichaelChipTone.Warn)
        MichaelChip(stringResource(R.string.gallery_chip_danger), tone = MichaelChipTone.Danger)
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        MichaelCheck(checked, stringResource(R.string.gallery_check_label), { checked = it })
        MichaelCheck(!checked, stringResource(R.string.gallery_check_label), { checked = !it })
        MichaelOrb(MichaelOrbSize.Small, Modifier.padding(start = MichaelSpace.sm))
    }
}

@Composable
private fun Fields() {
    val initialField = stringResource(R.string.gallery_field_value)
    val initialMinutes = stringResource(R.string.gallery_field_error_value)
    var field by rememberSaveable { mutableStateOf(initialField) }
    var minutes by rememberSaveable { mutableStateOf(initialMinutes) }
    var segment by rememberSaveable { mutableStateOf(Segment.Pending) }
    MichaelTextField(stringResource(R.string.gallery_field), field, { field = it })
    MichaelTextField(
        stringResource(R.string.gallery_field_error_label),
        minutes,
        { minutes = it },
        error = stringResource(R.string.gallery_field_error),
    )
    MichaelSegmentedControl(Segment.entries, segment, { segment = it }, { stringResource(it.title) })
}

@Composable
private fun Cards() {
    var completed by rememberSaveable { mutableIntStateOf(INITIAL_COMPLETED) }
    val colors = MichaelTheme.colors
    MichaelCard {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MichaelText(stringResource(R.string.gallery_card_title), MichaelTextStyle.Label, colors.muted, Modifier.weight(1f))
                MichaelText(stringResource(R.string.gallery_card_count, completed, TOTAL), MichaelTextStyle.Label, colors.text)
            }
            MichaelProgressBar(completed.toFloat() / TOTAL)
            MichaelButton(
                stringResource(R.string.gallery_card_advance),
                { completed = if (completed == TOTAL) 0 else completed + 1 },
                Modifier.fillMaxWidth(),
                style = MichaelButtonStyle.Ghost,
            )
        }
    }
    AICard {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            MichaelOrb(MichaelOrbSize.Small)
            MichaelText(stringResource(R.string.gallery_ai_body), MichaelTextStyle.Label, colors.text)
        }
    }
    // Three tiles in a row break words past 1.5x text; the Review screen in Phase 9 needs the same fallback.
    if (LocalDensity.current.fontScale >= LARGE_FONT_SCALE) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) { StatTiles(Modifier.fillMaxWidth()) }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) { StatTiles(Modifier.weight(1f)) }
    }
}

@Composable
private fun StatTiles(modifier: Modifier) {
    StatTile(7.toString(), stringResource(R.string.gallery_stat_planned), modifier)
    StatTile(5.toString(), stringResource(R.string.gallery_stat_completed), modifier, highlighted = true)
    StatTile(2.toString(), stringResource(R.string.gallery_stat_missed), modifier)
}

@Composable
private fun Controls(
    thinking: Boolean,
    onThinkingChange: (Boolean) -> Unit,
) {
    var reminder by rememberSaveable { mutableStateOf(true) }
    MichaelToggle(stringResource(R.string.gallery_toggle), reminder, { reminder = it })
    MichaelToggle(stringResource(R.string.gallery_thinking), thinking, onThinkingChange)
}

@Composable
private fun Michael(thinking: Boolean) {
    Row(
        modifier = Modifier.padding(MichaelSpace.lg),
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xxl),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MichaelOrb(
            MichaelOrbSize.Large,
            activity = if (thinking) MichaelOrbActivity.Thinking else MichaelOrbActivity.Idle,
        )
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            TypingDots()
            MichaelText(stringResource(R.string.gallery_typing), MichaelTextStyle.Label, MichaelTheme.colors.text)
        }
    }
    val loading = stringResource(R.string.gallery_loading)
    Column(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = loading },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        SkeletonBlock(height = MichaelSpace.md, width = MichaelSize.orbLarge * SKELETON_TITLE_WIDTH)
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md), verticalAlignment = Alignment.CenterVertically) {
            SkeletonBlock(height = MichaelSize.check, width = MichaelSize.check, cornerRadius = MichaelRadius.pill)
            SkeletonBlock(height = MichaelSpace.lg, modifier = Modifier.weight(1f))
            SkeletonBlock(height = MichaelSize.chip, width = MichaelSize.orbLarge * SKELETON_CHIP_WIDTH, cornerRadius = MichaelRadius.pill)
        }
    }
}

@Composable
private fun States() {
    OfflineBanner(stringResource(R.string.gallery_offline), {})
    EmptyStateView(
        stringResource(R.string.gallery_empty_title),
        stringResource(R.string.gallery_empty_message),
        stringResource(R.string.gallery_empty_action),
        {},
        Modifier.padding(vertical = MichaelSpace.lg),
    )
    FailureStateView(stringResource(R.string.gallery_failure), {})
}

private val swatches: List<Pair<String, (MichaelColors) -> Color>> =
    listOf(
        "text" to { it.text },
        "muted" to { it.muted },
        "accent" to { it.accent },
        "fill" to { it.fill },
        "surface" to { it.surface },
        "raise" to { it.raise },
        "warn" to { it.warn },
        "danger" to { it.danger },
    )

@Composable
private fun Swatches() {
    val colors = MichaelTheme.colors
    swatches.chunked(SWATCHES_PER_ROW).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            row.forEach { (name, color) ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                    val shape = RoundedCornerShape(MichaelSpace.sm)
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(MichaelSize.chip)
                            .background(color(colors), shape)
                            .border(1.dp, colors.border2, shape),
                    )
                    MichaelText(name, MichaelTextStyle.Caption, colors.muted)
                }
            }
        }
    }
}
