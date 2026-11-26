import DesignSystem
import Models
import SwiftUI

/// Natural-language capture: the words go to Michael as a drafting request, which the user then sends. Michael's
/// draft card shows what he understood before anything is saved.
struct CaptureBar: View {
    let ask: (String) -> Void
    @State private var text = ""

    static let limit = 340

    var body: some View {
        AICard {
            HStack(spacing: MichaelSpace.sm) {
                MichaelOrb(size: .small)
                    .accessibilityHidden(true)
                // Vertical, so long words and large text sizes wrap; Return still sends.
                TextField(String(localized: "tasks.capture.placeholder", bundle: .module), text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityLabel(String(localized: "tasks.capture.label", bundle: .module))
                    .onChange(of: text) { _, value in
                        if value.contains("\n") {
                            text = value.replacingOccurrences(of: "\n", with: "")
                            send()
                        } else if value.count > Self.limit {
                            text = String(value.prefix(Self.limit))
                        }
                    }
                Button(action: send) {
                    Image(systemName: "arrow.right")
                        .foregroundStyle(Color.michael.text)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall))
                }
                .buttonStyle(.plain)
                .disabled(trimmed.isEmpty)
                .accessibilityLabel(String(localized: "tasks.capture.send", bundle: .module))
            }
        }
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func send() {
        guard !trimmed.isEmpty else { return }
        ask(String(localized: "tasks.capture.prompt \(trimmed)", bundle: .module))
        text = ""
    }
}

struct TasksEmptyState: View {
    let query: TaskQuery
    let onCreate: () -> Void

    var body: some View {
        if query.view == .all && query.priority == nil && query.search.isEmpty {
            EmptyStateView(
                title: String(localized: "tasks.empty.title", bundle: .module),
                message: String(localized: "tasks.empty.message", bundle: .module),
                actionTitle: String(localized: "tasks.empty.action", bundle: .module),
                action: onCreate
            )
        } else {
            VStack(spacing: MichaelSpace.sm) {
                Text(title)
                    .michaelText(.title)
                    .foregroundStyle(Color.michael.text)
                Text(String(localized: "tasks.empty.filtered.message", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MichaelSpace.xxl)
        }
    }

    private var title: String {
        if !query.search.isEmpty { return String(localized: "tasks.empty.search \(query.search)", bundle: .module) }
        switch query.view {
        case .overdue: return String(localized: "tasks.empty.overdue", bundle: .module)
        case .completed: return String(localized: "tasks.empty.completed", bundle: .module)
        case .pending: return String(localized: "tasks.empty.pending", bundle: .module)
        case .all: return String(localized: "tasks.empty.priority", bundle: .module)
        }
    }
}

struct TasksSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            SkeletonBlock(height: MichaelSize.field)
            SkeletonBlock(height: MichaelSize.checkTouch)
            ForEach(0..<6, id: \.self) { _ in
                SkeletonBlock(height: MichaelSize.field)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MichaelSpace.screenGutter)
        .accessibilityElement()
        .accessibilityLabel(String(localized: "tasks.loading", bundle: .module))
    }
}

/// Search hides in Michael's order, which ranks every open task.
struct Searchable: ViewModifier {
    let isOn: Bool
    @Binding var text: String

    func body(content: Content) -> some View {
        if isOn {
            content.searchable(text: $text, prompt: String(localized: "tasks.search", bundle: .module))
        } else {
            content
        }
    }
}
