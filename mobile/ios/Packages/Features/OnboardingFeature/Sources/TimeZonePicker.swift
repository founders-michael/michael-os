import DesignSystem
import SwiftUI

/// Every zone the phone knows, searchable by name. The server accepts any IANA zone.
struct TimeZonePicker: View {
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
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
                        Text(gmtOffset(zone))
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
            .searchable(text: $query, prompt: String(localized: "onboarding.zone.search", bundle: .module))
            .navigationTitle(String(localized: "onboarding.zone.label", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "onboarding.zone.cancel", bundle: .module)) { dismiss() }
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
