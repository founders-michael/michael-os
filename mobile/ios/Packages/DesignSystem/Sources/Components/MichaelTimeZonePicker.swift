import SwiftUI

/// Every zone the phone knows, searchable by name. The server accepts any IANA zone.
public struct MichaelTimeZonePicker: View {
    @Binding private var selection: String
    private let title: String
    private let searchPrompt: String
    private let cancel: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    public init(selection: Binding<String>, title: String, searchPrompt: String, cancel: String) {
        _selection = selection
        self.title = title
        self.searchPrompt = searchPrompt
        self.cancel = cancel
    }

    /// "GMT+5:30" for a zone, at the current date.
    public static func offset(_ identifier: String) -> String {
        let seconds = TimeZone(identifier: identifier)?.secondsFromGMT() ?? 0
        let sign = seconds < 0 ? "-" : "+"
        let hours = abs(seconds) / 3600
        let minutes = abs(seconds) % 3600 / 60
        return minutes == 0 ? "GMT\(sign)\(hours)" : "GMT\(sign)\(hours):\(String(format: "%02d", minutes))"
    }

    public var body: some View {
        NavigationStack {
            List(zones, id: \.self) { zone in
                Button {
                    selection = zone
                    dismiss()
                } label: {
                    HStack {
                        Text(zone.replacingOccurrences(of: "_", with: " "))
                            .foregroundStyle(Color.michael.text)
                        Spacer()
                        Text(Self.offset(zone))
                            .foregroundStyle(Color.michael.muted)
                        if zone == selection {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Color.michael.accent)
                                .accessibilityHidden(true)
                        }
                    }
                    .michaelText(.body)
                }
                .accessibilityAddTraits(zone == selection ? .isSelected : [])
            }
            .searchable(text: $query, prompt: searchPrompt)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(cancel) { dismiss() }
                }
            }
        }
        .tint(Color.michael.accent)
    }

    private var zones: [String] {
        let all = TimeZone.knownTimeZoneIdentifiers.sorted()
        let words = query.trimmingCharacters(in: .whitespaces)
        guard !words.isEmpty else { return all }
        return all.filter { $0.replacingOccurrences(of: "_", with: " ").localizedCaseInsensitiveContains(words) }
    }
}
