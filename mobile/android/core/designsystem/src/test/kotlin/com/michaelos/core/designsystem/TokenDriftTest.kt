package com.michaelos.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import com.michaelos.core.designsystem.theme.ColorStop
import com.michaelos.core.designsystem.theme.ColorToken
import com.michaelos.core.designsystem.theme.DotGrid
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.RadialGlow
import com.michaelos.core.designsystem.theme.ShadowLayer
import com.michaelos.core.designsystem.theme.Themed
import com.michaelos.core.designsystem.theme.rgba
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

// tokens.json is the source of the design system. These tests fail when the Kotlin values drift from it.
class TokenDriftTest {
    private val tokens: JsonObject =
        Json.parseToJsonElement(File(checkNotNull(System.getProperty("tokens.path"))).readText()).jsonObject

    private fun section(vararg path: String): JsonObject = path.fold(tokens) { node, key -> node.getValue(key).jsonObject }

    private fun strings(element: JsonElement?): List<String> = element?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()

    private fun JsonObject.withoutNote() = filterKeys { it != "note" }

    @Test
    fun colorsMatch() {
        for (theme in listOf("dark", "light")) {
            val json = section("color", theme)
            assertEquals("$theme colour names", json.keys, ColorToken.entries.map { it.key }.toSet())
            ColorToken.entries.forEach { token ->
                val expected = parseColor(json.getValue(token.key).jsonPrimitive.content)
                assertEquals("$theme.${token.key}", expected, token.pick(theme == "dark"))
            }
        }
    }

    @Test
    fun gradientsMatch() {
        for (theme in listOf("dark", "light")) {
            val json = section("gradient", theme)
            val dark = theme == "dark"
            assertEquals("$theme.orb", strings(json["orb"]).map(::parseStop), MichaelEffects.orb.pick(dark))
            assertEquals("$theme.aiBorder", strings(json["aiBorder"]).map(::parseColor), MichaelEffects.aiBorder.pick(dark))
            assertEquals("$theme.progress", strings(json["progress"]).map(::parseColor), MichaelEffects.progress.pick(dark))
            val page = strings(json["page"])
            assertEquals("$theme.page glows", page.filter { it.startsWith("radial") }.map(::parseGlow), MichaelEffects.pageGlows.pick(dark))
            assertEquals(
                "$theme.page dots",
                page.firstOrNull { it.startsWith("dot grid") }?.let(::parseDots),
                MichaelEffects.pageDots.pick(dark),
            )
        }
    }

    @Test
    fun shadowsMatch() {
        val pairs = mapOf("card" to MichaelEffects.cardShadow, "orb" to MichaelEffects.orbShadow, "ai" to MichaelEffects.aiShadow)
        for (theme in listOf("dark", "light")) {
            val json = section("shadow", theme)
            assertEquals(json.keys, pairs.keys)
            pairs.forEach { (key, themed: Themed<List<ShadowLayer>>) ->
                assertEquals("$theme.$key", strings(json[key]).map(::parseShadow), themed.pick(theme == "dark"))
            }
        }
    }

    @Test
    fun typeScaleMatches() {
        val json = section("type").withoutNote()
        assertEquals(json.keys, MichaelTextStyle.entries.map { it.key }.toSet())
        MichaelTextStyle.entries.forEach { style ->
            val entry = json.getValue(style.key).jsonObject
            assertEquals("${style.key}.size", entry.getValue("size").jsonPrimitive.int, style.size)
            assertEquals("${style.key}.weight", entry.getValue("weight").jsonPrimitive.int, style.weight)
            assertEquals("${style.key}.tracking", entry.getValue("tracking").jsonPrimitive.float, style.tracking)
            assertEquals("${style.key}.lineHeight", entry["lineHeight"]?.jsonPrimitive?.floatOrNull, style.lineHeight)
            assertEquals("${style.key}.uppercase", entry["uppercase"]?.jsonPrimitive?.booleanOrNull ?: false, style.uppercase)
            assertEquals("${style.key}.mono", entry["mono"]?.jsonPrimitive?.booleanOrNull ?: false, style.mono)
        }
    }

    @Test
    fun metricsMatch() {
        assertDp(
            "space",
            mapOf(
                "xs" to MichaelSpace.xs,
                "sm" to MichaelSpace.sm,
                "md" to MichaelSpace.md,
                "lg" to MichaelSpace.lg,
                "xl" to MichaelSpace.xl,
                "xxl" to MichaelSpace.xxl,
                "screenGutter" to MichaelSpace.screenGutter,
                "cardPadding" to MichaelSpace.cardPadding,
            ),
        )
        assertDp(
            "size",
            mapOf(
                "button" to MichaelSize.button,
                "buttonSmall" to MichaelSize.buttonSmall,
                "field" to MichaelSize.field,
                "chip" to MichaelSize.chip,
                "check" to MichaelSize.check,
                "checkTouch" to MichaelSize.checkTouch,
                "tabBar" to MichaelSize.tabBar,
                "orbSmall" to MichaelSize.orbSmall,
                "orbLarge" to MichaelSize.orbLarge,
                "progressTrack" to MichaelSize.progressTrack,
                "avatar" to MichaelSize.avatar,
                "calendarHour" to MichaelSize.calendarHour,
                "calendarGutter" to MichaelSize.calendarGutter,
                "weekDay" to MichaelSize.weekDay,
            ),
        )
        assertDp(
            "radius",
            mapOf(
                "card" to MichaelRadius.card,
                "ai" to MichaelRadius.ai,
                "button" to MichaelRadius.button,
                "buttonSmall" to MichaelRadius.buttonSmall,
                "field" to MichaelRadius.field,
                "stat" to MichaelRadius.stat,
                "pill" to MichaelRadius.pill,
            ),
            ignoring = setOf("bubble"),
        )
        assertEquals(
            section("radius").getValue("bubble").jsonArray.map { it.jsonPrimitive.float },
            MichaelRadius.bubble.map { it.value },
        )
    }

    @Test
    fun motionMatches() {
        val json = section("motion")
        val breathe = json.getValue("orbBreatheMs").jsonObject
        assertEquals(breathe.getValue("dark").jsonPrimitive.int, MichaelMotion.orbBreatheMs.dark)
        assertEquals(breathe.getValue("light").jsonPrimitive.int, MichaelMotion.orbBreatheMs.light)
        val expected =
            mapOf(
                "orbRingMs" to MichaelMotion.ORB_RING_MS,
                "aiBorderFlowMs" to MichaelMotion.AI_BORDER_FLOW_MS,
                "typingDotMs" to MichaelMotion.TYPING_DOT_MS,
                "pressMs" to MichaelMotion.PRESS_MS,
                "orbThinkingBreatheMs" to MichaelMotion.ORB_THINKING_BREATHE_MS,
                "checkMs" to MichaelMotion.CHECK_MS,
                "progressMs" to MichaelMotion.PROGRESS_MS,
                "skeletonPulseMs" to MichaelMotion.SKELETON_PULSE_MS,
                "replyWordMs" to MichaelMotion.REPLY_WORD_MS,
                "replyRevealMaxMs" to MichaelMotion.REPLY_REVEAL_MAX_MS,
            )
        val numeric = json.filterValues { it is JsonPrimitive && !it.isString }
        assertEquals(numeric.keys, expected.keys)
        expected.forEach { (key, value) -> assertEquals(key, json.getValue(key).jsonPrimitive.int, value) }
    }

    private fun assertDp(
        name: String,
        expected: Map<String, Dp>,
        ignoring: Set<String> = emptySet(),
    ) {
        val json = section(name).withoutNote().filterKeys { it !in ignoring }
        assertEquals("$name names", json.keys, expected.keys)
        expected.forEach { (key, value) -> assertEquals("$name.$key", json.getValue(key).jsonPrimitive.float, value.value) }
    }
}

private fun parseColor(text: String): Color {
    val trimmed = text.trim()
    if (trimmed.startsWith("#")) return Color(0xFF000000 or trimmed.drop(1).toLong(16))
    val parts =
        Regex("""rgba\(([^)]*)\)""")
            .find(trimmed)!!
            .groupValues[1]
            .split(",")
            .map { it.trim() }
    return rgba(parts[0].toInt(), parts[1].toInt(), parts[2].toInt(), parts[3].toFloat())
}

private fun parseStop(text: String): ColorStop {
    val (color, percent) = Regex("""(\S+) (\d+)%""").matchEntire(text)!!.destructured
    return ColorStop(parseColor(color), percent.toFloat() / 100)
}

private fun parseShadow(text: String): ShadowLayer {
    val (x, y, blur, color) = Regex("""(-?\d+) (-?\d+) (\d+) (rgba\(.*\))""").matchEntire(text)!!.destructured
    return ShadowLayer(x.toFloat(), y.toFloat(), blur.toFloat(), parseColor(color))
}

private fun parseGlow(text: String): RadialGlow {
    val match = Regex("""radial (\d+)x(\d+) at (-?\d+)% (-?\d+)%: (rgba\([^)]*\)) to transparent (\d+)%""").matchEntire(text)!!
    val (width, height, x, y, color, fade) = match.destructured
    return RadialGlow(width.toFloat(), height.toFloat(), x.toFloat() / 100, y.toFloat() / 100, parseColor(color), fade.toFloat() / 100)
}

private fun parseDots(text: String): DotGrid {
    val (spacing, color, radius) = Regex("""dot grid (\d+)px: (rgba\([^)]*\)) (\d+)px""").matchEntire(text)!!.destructured
    return DotGrid(spacing.toFloat(), parseColor(color), radius.toFloat())
}
