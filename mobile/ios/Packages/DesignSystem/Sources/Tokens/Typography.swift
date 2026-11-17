import CoreText
import SwiftUI
import UIKit

public enum MichaelTextStyle: String, CaseIterable, Sendable {
    case display, title, heading, body, label, button, caption, eyebrow, stat

    var size: CGFloat {
        switch self {
        case .display: 32
        case .title: 22
        case .heading: 19
        case .body: 16
        case .label: 14
        case .button: 15
        case .caption: 12
        case .eyebrow: 11
        case .stat: 26
        }
    }

    var weight: Int {
        switch self {
        case .body: 400
        case .label, .caption: 500
        case .display, .title, .heading, .button, .eyebrow, .stat: 600
        }
    }

    var tracking: Double {
        switch self {
        case .display: -0.035
        case .title, .heading, .stat: -0.02
        case .body, .label, .button, .caption: 0
        case .eyebrow: 0.14
        }
    }

    var lineHeight: Double? {
        switch self {
        case .display: 1.05
        case .title: 1.2
        case .heading: 1.25
        case .body: 1.45
        case .label: 1.35
        case .button: 1.2
        case .caption: 1.3
        case .eyebrow, .stat: nil
        }
    }

    var isUppercase: Bool { self == .eyebrow }

    var isMono: Bool { self == .stat }

    var fontName: String {
        let family = isMono ? "GeistMono" : "Geist"
        switch weight {
        case 400: return "\(family)-Regular"
        case 500: return "\(family)-Medium"
        default: return "\(family)-SemiBold"
        }
    }

    fileprivate var scalesLike: Font.TextStyle {
        switch self {
        case .display: .largeTitle
        case .title: .title2
        case .heading: .title3
        case .stat: .title
        case .body: .body
        case .button: .callout
        case .label: .subheadline
        case .caption: .caption
        case .eyebrow: .caption2
        }
    }
}

private struct MichaelTextModifier: ViewModifier {
    let style: MichaelTextStyle
    @ScaledMetric private var size: CGFloat

    init(style: MichaelTextStyle) {
        self.style = style
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: style.scalesLike)
    }

    func body(content: Content) -> some View {
        content
            .font(.custom(style.fontName, fixedSize: size))
            .tracking(style.tracking * size)
            .lineSpacing(lineSpacing)
            .textCase(style.isUppercase ? .uppercase : nil)
    }

    // SwiftUI has no line-height setting before iOS 26, so the token's line height becomes extra spacing
    // on top of the font's own line height.
    private var lineSpacing: CGFloat {
        guard let lineHeight = style.lineHeight, let font = UIFont(name: style.fontName, size: size) else {
            return 0
        }
        return max(0, lineHeight * size - font.lineHeight)
    }
}

extension View {
    public func michaelText(_ style: MichaelTextStyle) -> some View {
        modifier(MichaelTextModifier(style: style))
    }
}

public enum MichaelFonts {
    public static func register() {
        _ = registration
    }

    private static let registration: Void = {
        for url in Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [] {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                assertionFailure("Could not register \(url.lastPathComponent): \(String(describing: error))")
            }
        }
    }()
}
