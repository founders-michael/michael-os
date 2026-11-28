import SwiftUI

public enum MichaelSpace {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
    public static let screenGutter: CGFloat = 16
    public static let cardPadding: CGFloat = 16
}

public enum MichaelRadius {
    public static let card: CGFloat = 18
    public static let ai: CGFloat = 20
    public static let button: CGFloat = 12
    public static let buttonSmall: CGFloat = 10
    public static let field: CGFloat = 12
    public static let stat: CGFloat = 14
    public static let pill: CGFloat = 999
    public static let bubble = RectangleCornerRadii(
        topLeading: 16,
        bottomLeading: 16,
        bottomTrailing: 4,
        topTrailing: 16
    )
}

public enum MichaelSize {
    public static let button: CGFloat = 48
    public static let buttonSmall: CGFloat = 36
    public static let field: CGFloat = 48
    public static let chip: CGFloat = 28
    public static let check: CGFloat = 24
    public static let checkTouch: CGFloat = 44
    public static let tabBar: CGFloat = 56
    public static let orbSmall: CGFloat = 28
    public static let orbLarge: CGFloat = 96
    public static let progressTrack: CGFloat = 8
    public static let avatar: CGFloat = 72
    /// One hour of the calendar day grid.
    public static let calendarHour: CGFloat = 60
    /// The day grid's hour labels.
    public static let calendarGutter: CGFloat = 56
    public static let weekDay: CGFloat = 56
}

public enum MichaelMotion {
    public static let orbBreathe = Themed<TimeInterval>(dark: 4.5, light: 6.0)
    public static let orbRing: TimeInterval = 3.6
    public static let aiBorderFlow: TimeInterval = 7.0
    public static let typingDot: TimeInterval = 1.2
    public static let press: TimeInterval = 0.18
    public static let orbThinkingBreathe: TimeInterval = 2.4
    public static let check: TimeInterval = 0.22
    public static let progress: TimeInterval = 0.4
    public static let skeletonPulse: TimeInterval = 1.4
    /// Michael's reply appears word by word at this pace, after it has arrived whole.
    public static let replyWord: TimeInterval = 0.034
    /// The longest a reply's reveal may take; a long reply is revealed faster per word.
    public static let replyRevealMax: TimeInterval = 3.0
}
