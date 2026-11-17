import SwiftUI

public struct EmptyStateView: View {
    private let title: String
    private let message: String
    private let actionTitle: String
    private let action: () -> Void

    public init(title: String, message: String, actionTitle: String, action: @escaping () -> Void) {
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: MichaelSpace.xl) {
            ZStack {
                Circle()
                    .strokeBorder(Color.michael.chipBorder)
                    .frame(width: MichaelSize.orbLarge * 1.25, height: MichaelSize.orbLarge * 1.25)
                MichaelOrb(size: .large)
            }
            VStack(spacing: MichaelSpace.sm) {
                Text(title)
                    .michaelText(.title)
                    .foregroundStyle(Color.michael.text)
                    .accessibilityAddTraits(.isHeader)
                Text(message)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
            }
            .multilineTextAlignment(.center)
            MichaelButton(actionTitle, action: action)
        }
        .padding(.horizontal, MichaelSpace.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

public struct FailureStateView: View {
    private let message: String
    private let onRetry: () -> Void

    public init(message: String, onRetry: @escaping () -> Void) {
        self.message = message
        self.onRetry = onRetry
    }

    public var body: some View {
        VStack(spacing: MichaelSpace.lg) {
            Image(systemName: "exclamationmark.circle")
                .font(.title2.weight(.medium))
                .foregroundStyle(Color.michael.danger)
                .accessibilityHidden(true)
            Text(message)
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .multilineTextAlignment(.center)
            MichaelButton(String(localized: "state.tryAgain", bundle: .module), style: .secondary, action: onRetry)
        }
        .padding(.horizontal, MichaelSpace.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

public struct OfflineBanner: View {
    private let message: String
    private let onRetry: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    public init(message: String, onRetry: @escaping () -> Void) {
        self.message = message
        self.onRetry = onRetry
    }

    public var body: some View {
        // At accessibility sizes the message needs the full width, so Retry moves below it.
        let layout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            : AnyLayout(HStackLayout(spacing: MichaelSpace.sm))
        layout {
            HStack(spacing: MichaelSpace.sm) {
                Image(systemName: "wifi.slash")
                    .foregroundStyle(Color.michael.warn)
                    .accessibilityHidden(true)
                Text(message)
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.warn)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, typeSize.isAccessibilitySize ? MichaelSpace.sm : 0)
            Button(action: onRetry) {
                Text(String(localized: "state.retry", bundle: .module))
                    .michaelText(.button)
                    .underline()
                    .foregroundStyle(Color.michael.warn)
                    .fixedSize()
                    .padding(.horizontal, MichaelSpace.md)
                    .frame(minHeight: MichaelSize.checkTouch)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, MichaelSpace.md)
        .padding(.vertical, MichaelSpace.xs)
        .background(Color.michael.warnBg, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
        .accessibilityElement(children: .contain)
    }
}

#Preview {
    ThemePreview {
        OfflineBanner(message: "You're offline. Showing your day as of 17:42.") {}
        EmptyStateView(
            title: "Nothing planned for today",
            message: "Add what's on your mind and Michael will help you fit it into the day.",
            actionTitle: "Add a task"
        ) {}
        FailureStateView(message: "We couldn't load your tasks. Check your connection and try again.") {}
    }
}
