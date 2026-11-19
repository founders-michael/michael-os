import DesignSystem
import SwiftUI

/// Stands in for the chat until Phase 5. A question handed over from My Day is shown, not sent.
public struct AssistantPlaceholder: View {
    private let prompt: String?

    public init(prompt: String?) {
        self.prompt = prompt
    }

    public var body: some View {
        VStack(spacing: MichaelSpace.lg) {
            MichaelOrb(size: .large)
            Text(String(localized: "assistant.placeholder", bundle: .module))
                .michaelText(.title)
                .foregroundStyle(Color.michael.text)
            if let prompt {
                VStack(spacing: MichaelSpace.xs) {
                    Text(String(localized: "assistant.prompt.title", bundle: .module))
                        .michaelText(.eyebrow)
                        .foregroundStyle(Color.michael.faint)
                    Text(prompt)
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                }
                .multilineTextAlignment(.center)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, MichaelSpace.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MichaelBackground())
    }
}

#Preview {
    AssistantPlaceholder(prompt: "Help me decide what to do with my 2 overdue tasks.")
}
