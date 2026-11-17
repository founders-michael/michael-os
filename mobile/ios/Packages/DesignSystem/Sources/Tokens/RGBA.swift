import SwiftUI
import UIKit

struct RGBA: Equatable, Sendable {
    let red: UInt8
    let green: UInt8
    let blue: UInt8
    let alpha: Double

    init(_ red: UInt8, _ green: UInt8, _ blue: UInt8, _ alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    init(hex: UInt32) {
        self.init(UInt8((hex >> 16) & 0xFF), UInt8((hex >> 8) & 0xFF), UInt8(hex & 0xFF))
    }

    var uiColor: UIColor {
        UIColor(
            red: CGFloat(red) / 255,
            green: CGFloat(green) / 255,
            blue: CGFloat(blue) / 255,
            alpha: alpha
        )
    }

    var color: Color { Color(uiColor: uiColor) }
}

public struct Themed<Value: Sendable>: Sendable {
    public let dark: Value
    public let light: Value

    public func callAsFunction(_ scheme: ColorScheme) -> Value {
        scheme == .dark ? dark : light
    }
}
