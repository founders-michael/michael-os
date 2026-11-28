package com.michaelos.core.designsystem.theme

import androidx.compose.ui.graphics.Color

internal fun rgba(red: Int, green: Int, blue: Int, alpha: Float = 1f): Color = Color(red / 255f, green / 255f, blue / 255f, alpha)

// Mirrors color.dark and color.light in mobile/design/tokens.json; TokenDriftTest fails if they differ.
internal enum class ColorToken(val key: String, val dark: Color, val light: Color) {
    Bg("bg", Color(0xFF06080B), Color(0xFFF5F7FA)),
    Side("side", rgba(10, 14, 19, 0.72f), Color(0xFFFFFFFF)),
    Surface("surface", rgba(255, 255, 255, 0.028f), Color(0xFFFFFFFF)),
    Solid("solid", Color(0xFF0C1117), Color(0xFFFFFFFF)),
    Raise("raise", rgba(255, 255, 255, 0.05f), Color(0xFFF2F5F8)),
    Border("border", rgba(255, 255, 255, 0.08f), Color(0xFFE3E8EE)),
    Border2("border2", rgba(255, 255, 255, 0.14f), Color(0xFFD2D9E2)),
    Text("text", Color(0xFFECF2F5), Color(0xFF0B1220)),
    Muted("muted", Color(0xFF9AA7B2), Color(0xFF526071)),
    Faint("faint", Color(0xFF808D99), Color(0xFF5F6B7B)),
    Accent("accent", Color(0xFF41F0B0), Color(0xFF10B981)),
    Accent2("accent2", Color(0xFF5CD6FF), Color(0xFF3B82F6)),
    Atext("atext", Color(0xFF6AF5C4), Color(0xFF047857)),
    Fill("fill", Color(0xFF41F0B0), Color(0xFF0B1220)),
    Onfill("onfill", Color(0xFF03140D), Color(0xFFFFFFFF)),
    Chip("chip", rgba(65, 240, 176, 0.10f), Color(0xFFECFDF5)),
    ChipBorder("chipBorder", rgba(65, 240, 176, 0.28f), Color(0xFFA7F3D0)),
    Warn("warn", Color(0xFFFFC27A), Color(0xFF9A5B00)),
    WarnBg("warnBg", rgba(255, 194, 122, 0.10f), Color(0xFFFFF7E8)),
    Danger("danger", Color(0xFFFF8A94), Color(0xFFB42335)),
    DangerBg("dangerBg", rgba(255, 138, 148, 0.10f), Color(0xFFFFF1F2)),
    Track("track", rgba(255, 255, 255, 0.07f), Color(0xFFE8EDF2)),
    AiSurface("aiSurface", Color(0xFF0B1016), Color(0xFFFFFFFF)),
    OnAccent("onAccent", Color(0xFF03140D), Color(0xFF03140D)),
    Info("info", Color(0xFF8EDFFF), Color(0xFF1D4ED8)),
    InfoBg("infoBg", rgba(92, 214, 255, 0.10f), Color(0xFFEFF6FF)),
    ;

    fun pick(dark: Boolean): Color = if (dark) this.dark else light
}

data class MichaelColors(
    val bg: Color,
    val side: Color,
    val surface: Color,
    val solid: Color,
    val raise: Color,
    val border: Color,
    val border2: Color,
    val text: Color,
    val muted: Color,
    val faint: Color,
    val accent: Color,
    val accent2: Color,
    val atext: Color,
    val fill: Color,
    val onfill: Color,
    val chip: Color,
    val chipBorder: Color,
    val warn: Color,
    val warnBg: Color,
    val danger: Color,
    val dangerBg: Color,
    val track: Color,
    val aiSurface: Color,
    val onAccent: Color,
    val info: Color,
    val infoBg: Color,
) {
    internal companion object {
        fun of(dark: Boolean) =
            MichaelColors(
                bg = ColorToken.Bg.pick(dark),
                side = ColorToken.Side.pick(dark),
                surface = ColorToken.Surface.pick(dark),
                solid = ColorToken.Solid.pick(dark),
                raise = ColorToken.Raise.pick(dark),
                border = ColorToken.Border.pick(dark),
                border2 = ColorToken.Border2.pick(dark),
                text = ColorToken.Text.pick(dark),
                muted = ColorToken.Muted.pick(dark),
                faint = ColorToken.Faint.pick(dark),
                accent = ColorToken.Accent.pick(dark),
                accent2 = ColorToken.Accent2.pick(dark),
                atext = ColorToken.Atext.pick(dark),
                fill = ColorToken.Fill.pick(dark),
                onfill = ColorToken.Onfill.pick(dark),
                chip = ColorToken.Chip.pick(dark),
                chipBorder = ColorToken.ChipBorder.pick(dark),
                warn = ColorToken.Warn.pick(dark),
                warnBg = ColorToken.WarnBg.pick(dark),
                danger = ColorToken.Danger.pick(dark),
                dangerBg = ColorToken.DangerBg.pick(dark),
                track = ColorToken.Track.pick(dark),
                aiSurface = ColorToken.AiSurface.pick(dark),
                onAccent = ColorToken.OnAccent.pick(dark),
                info = ColorToken.Info.pick(dark),
                infoBg = ColorToken.InfoBg.pick(dark),
            )
    }
}
