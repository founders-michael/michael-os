import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

// tokens.json is the source of the design system. These tests fail when the Swift values drift from it.
struct TokenDriftTests {
    private let tokens: [String: Any]

    init() throws {
        let mobile = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let data = try Data(contentsOf: mobile.appending(path: "design/tokens.json"))
        tokens = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func colorsMatch() throws {
        for theme in ["dark", "light"] {
            let json = try section("color", theme).filter { $0.key != "note" }
            #expect(Set(json.keys) == Set(ColorToken.allCases.map(\.rawValue)), "\(theme) colour names")
            for token in ColorToken.allCases {
                let expected = try parseColor(try #require(json[token.rawValue] as? String))
                #expect((theme == "dark" ? token.dark : token.light) == expected, "\(theme).\(token.rawValue)")
            }
        }
    }

    @Test func gradientsMatch() throws {
        for (theme, scheme) in [("dark", ColorScheme.dark), ("light", .light)] {
            let json = try section("gradient", theme)
            let orb = try strings(json["orb"]).map(parseStop)
            #expect(orb == MichaelEffects.orb(scheme), "\(theme).orb")
            #expect(try strings(json["aiBorder"]).map(parseColor) == MichaelEffects.aiBorder(scheme), "\(theme).aiBorder")
            #expect(try strings(json["progress"]).map(parseColor) == MichaelEffects.progress(scheme), "\(theme).progress")

            let page = try strings(json["page"])
            let glows = try page.filter { $0.hasPrefix("radial") }.map(parseGlow)
            #expect(glows == MichaelEffects.pageGlows(scheme), "\(theme).page glows")
            let dots = try page.first { $0.hasPrefix("dot grid") }.map(parseDots)
            #expect(dots == MichaelEffects.pageDots(scheme), "\(theme).page dots")
        }
    }

    @Test func shadowsMatch() throws {
        for (theme, scheme) in [("dark", ColorScheme.dark), ("light", .light)] {
            let json = try section("shadow", theme)
            #expect(try strings(json["card"]).map(parseShadow) == MichaelEffects.cardShadow(scheme))
            #expect(try strings(json["orb"]).map(parseShadow) == MichaelEffects.orbShadow(scheme))
            #expect(try strings(json["ai"]).map(parseShadow) == MichaelEffects.aiShadow(scheme))
        }
    }

    @Test func typeScaleMatches() throws {
        let json = try section("type").filter { $0.key != "note" }
        #expect(Set(json.keys) == Set(MichaelTextStyle.allCases.map(\.rawValue)))
        for style in MichaelTextStyle.allCases {
            let entry = try #require(json[style.rawValue] as? [String: Any])
            #expect(entry["size"] as? Double == Double(style.size), "\(style).size")
            #expect(entry["weight"] as? Int == style.weight, "\(style).weight")
            #expect(entry["tracking"] as? Double == style.tracking, "\(style).tracking")
            #expect(entry["lineHeight"] as? Double == style.lineHeight, "\(style).lineHeight")
            #expect((entry["uppercase"] as? Bool ?? false) == style.isUppercase, "\(style).uppercase")
            #expect((entry["mono"] as? Bool ?? false) == style.isMono, "\(style).mono")
        }
    }

    @Test func metricsMatch() throws {
        try expectNumbers(
            "space",
            [
                "xs": MichaelSpace.xs, "sm": MichaelSpace.sm, "md": MichaelSpace.md, "lg": MichaelSpace.lg,
                "xl": MichaelSpace.xl, "xxl": MichaelSpace.xxl, "screenGutter": MichaelSpace.screenGutter,
                "cardPadding": MichaelSpace.cardPadding,
            ])
        try expectNumbers(
            "size",
            [
                "button": MichaelSize.button, "buttonSmall": MichaelSize.buttonSmall, "field": MichaelSize.field,
                "chip": MichaelSize.chip, "check": MichaelSize.check, "checkTouch": MichaelSize.checkTouch,
                "tabBar": MichaelSize.tabBar, "orbSmall": MichaelSize.orbSmall, "orbLarge": MichaelSize.orbLarge,
                "progressTrack": MichaelSize.progressTrack, "avatar": MichaelSize.avatar,
            ])
        let radius = try section("radius")
        try expectNumbers(
            "radius",
            [
                "card": MichaelRadius.card, "ai": MichaelRadius.ai, "button": MichaelRadius.button,
                "buttonSmall": MichaelRadius.buttonSmall, "field": MichaelRadius.field, "stat": MichaelRadius.stat,
                "pill": MichaelRadius.pill,
            ], ignoring: ["bubble"])
        let bubble = MichaelRadius.bubble
        #expect(
            radius["bubble"] as? [Double]
                == [bubble.topLeading, bubble.topTrailing, bubble.bottomTrailing, bubble.bottomLeading].map(Double.init)
        )
    }

    @Test func motionMatches() throws {
        let json = try section("motion")
        let breathe = try #require(json["orbBreatheMs"] as? [String: Double])
        #expect(breathe["dark"] == MichaelMotion.orbBreathe.dark * 1000)
        #expect(breathe["light"] == MichaelMotion.orbBreathe.light * 1000)
        let milliseconds: [String: TimeInterval] = [
            "orbRingMs": MichaelMotion.orbRing, "aiBorderFlowMs": MichaelMotion.aiBorderFlow,
            "typingDotMs": MichaelMotion.typingDot, "pressMs": MichaelMotion.press,
            "orbThinkingBreatheMs": MichaelMotion.orbThinkingBreathe, "checkMs": MichaelMotion.check,
            "progressMs": MichaelMotion.progress, "skeletonPulseMs": MichaelMotion.skeletonPulse,
            "replyWordMs": MichaelMotion.replyWord, "replyRevealMaxMs": MichaelMotion.replyRevealMax,
        ]
        let numeric = json.filter { $0.value is Double && $0.key != "orbBreatheMs" }
        #expect(Set(numeric.keys) == Set(milliseconds.keys))
        for (key, seconds) in milliseconds {
            #expect((json[key] as? Double).map { $0 / 1000 } == seconds, "\(key)")
        }
    }

    @Test func fontsAreBundled() {
        MichaelFonts.register()
        for style in MichaelTextStyle.allCases {
            #expect(UIFont(name: style.fontName, size: style.size) != nil, "\(style.fontName)")
        }
    }

    private func section(_ path: String...) throws -> [String: Any] {
        var node: Any = tokens
        for key in path {
            node = try #require((node as? [String: Any])?[key], "missing \(key)")
        }
        return try #require(node as? [String: Any])
    }

    private func strings(_ value: Any?) throws -> [String] {
        try #require(value as? [String])
    }

    private func expectNumbers(_ name: String, _ expected: [String: CGFloat], ignoring: Set<String> = ["note"]) throws {
        let json = try section(name).filter { !ignoring.contains($0.key) && $0.key != "note" }
        #expect(Set(json.keys) == Set(expected.keys), "\(name) names")
        for (key, value) in expected {
            #expect(json[key] as? Double == Double(value), "\(name).\(key)")
        }
    }
}

private func parseColor(_ text: String) throws -> RGBA {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("#") {
        return RGBA(hex: try #require(UInt32(trimmed.dropFirst(), radix: 16)))
    }
    let parts = try #require(trimmed.firstMatch(of: /rgba\(([^)]*)\)/)).output.1
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespaces) }
    try #require(parts.count == 4)
    return RGBA(
        try #require(UInt8(parts[0])),
        try #require(UInt8(parts[1])),
        try #require(UInt8(parts[2])),
        try #require(Double(parts[3]))
    )
}

private func parseStop(_ text: String) throws -> ColorStop {
    let match = try #require(text.wholeMatch(of: /(\S+) (\d+)%/))
    return ColorStop(color: try parseColor(String(match.output.1)), location: try #require(Double(match.output.2)) / 100)
}

private func parseShadow(_ text: String) throws -> ShadowLayer {
    let match = try #require(text.wholeMatch(of: /(-?\d+) (-?\d+) (\d+) (rgba\(.*\))/))
    return ShadowLayer(
        x: CGFloat(try #require(Double(match.output.1))),
        y: CGFloat(try #require(Double(match.output.2))),
        blur: CGFloat(try #require(Double(match.output.3))),
        color: try parseColor(String(match.output.4))
    )
}

private func parseGlow(_ text: String) throws -> RadialGlow {
    let match = try #require(
        text.wholeMatch(of: /radial (\d+)x(\d+) at (-?\d+)% (-?\d+)%: (rgba\([^)]*\)) to transparent (\d+)%/)
    )
    return RadialGlow(
        width: CGFloat(try #require(Double(match.output.1))),
        height: CGFloat(try #require(Double(match.output.2))),
        centerX: try #require(Double(match.output.3)) / 100,
        centerY: try #require(Double(match.output.4)) / 100,
        color: try parseColor(String(match.output.5)),
        fadeEnd: try #require(Double(match.output.6)) / 100
    )
}

private func parseDots(_ text: String) throws -> DotGrid {
    let match = try #require(text.wholeMatch(of: /dot grid (\d+)px: (rgba\([^)]*\)) (\d+)px/))
    return DotGrid(
        spacing: CGFloat(try #require(Double(match.output.1))),
        color: try parseColor(String(match.output.2)),
        radius: CGFloat(try #require(Double(match.output.3)))
    )
}
