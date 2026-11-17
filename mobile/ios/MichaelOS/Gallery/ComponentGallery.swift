#if DEBUG
    import DesignSystem
    import SwiftUI

    struct ComponentGallery: View {
        var body: some View {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 0) {
                        GalleryPanel(id: "dark", title: String(localized: "gallery.dark")).environment(\.colorScheme, .dark)
                        GalleryPanel(id: "light", title: String(localized: "gallery.light")).environment(\.colorScheme, .light)
                    }
                }
                .background(MichaelBackground())
                .onAppear {
                    // Launch with `-gallerySection light.cards` to open at a section when checking on a simulator.
                    if let section = UserDefaults.standard.string(forKey: "gallerySection") {
                        proxy.scrollTo(section, anchor: .top)
                    }
                }
            }
        }
    }

    private enum Segment: CaseIterable {
        case pending, overdue, completed

        var title: String {
            switch self {
            case .pending: String(localized: "gallery.segment.pending")
            case .overdue: String(localized: "gallery.segment.overdue")
            case .completed: String(localized: "gallery.segment.completed")
            }
        }
    }

    private struct GalleryPanel: View {
        let id: String
        let title: String

        @State private var isChecked = false
        @State private var field = String(localized: "gallery.field.value")
        @State private var minutes = String(localized: "gallery.field.error.value")
        @State private var segment = Segment.pending
        @State private var reminder = true
        @State private var completed = 3
        @State private var isThinking = true

        private let total = 7
        private let swatches: [(String, KeyPath<MichaelPalette, Color>)] = [
            ("text", \.text), ("muted", \.muted), ("accent", \.accent), ("fill", \.fill),
            ("surface", \.surface), ("raise", \.raise), ("warn", \.warn), ("danger", \.danger),
        ]

        var body: some View {
            VStack(alignment: .leading, spacing: MichaelSpace.xl) {
                Text(title)
                    .michaelText(.display)
                    .foregroundStyle(Color.michael.text)
                    .accessibilityAddTraits(.isHeader)
                buttons.id("\(id).buttons")
                chips.id("\(id).chips")
                fields.id("\(id).fields")
                cards.id("\(id).cards")
                controls.id("\(id).controls")
                michael.id("\(id).michael")
                states.id("\(id).states")
                colors.id("\(id).colors")
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.vertical, MichaelSpace.xxl)
            .background(MichaelBackground())
        }

        private var buttons: some View {
            section("gallery.buttons") {
                MichaelButton(String(localized: "gallery.primary")) {}
                MichaelButton(String(localized: "gallery.secondary"), style: .secondary) {}
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: MichaelSpace.sm) { minorButtons }
                    VStack(spacing: MichaelSpace.sm) { minorButtons }
                }
            }
        }

        @ViewBuilder private var minorButtons: some View {
            MichaelButton(String(localized: "gallery.ghost"), style: .ghost) {}
                .fixedSize(horizontal: true, vertical: false)
            MichaelButton(String(localized: "gallery.disabled"), style: .secondary) {}.disabled(true)
                .fixedSize(horizontal: true, vertical: false)
            MichaelButton(String(localized: "gallery.destructive"), style: .destructive) {}
                .fixedSize(horizontal: true, vertical: false)
        }

        private var chips: some View {
            section("gallery.chips") {
                HStack(spacing: MichaelSpace.sm) {
                    MichaelChip(String(localized: "gallery.chip.today"))
                    MichaelChip(String(localized: "gallery.chip.ai"), tone: .ai)
                }
                HStack(spacing: MichaelSpace.sm) {
                    MichaelChip(String(localized: "gallery.chip.warn"), tone: .warn)
                    MichaelChip(String(localized: "gallery.chip.danger"), tone: .danger)
                }
                HStack(spacing: 0) {
                    MichaelCheck(isChecked: isChecked, label: String(localized: "gallery.check.label")) {
                        isChecked.toggle()
                    }
                    MichaelCheck(isChecked: !isChecked, label: String(localized: "gallery.check.label")) {
                        isChecked.toggle()
                    }
                    MichaelOrb(size: .small)
                        .padding(.leading, MichaelSpace.sm)
                }
            }
        }

        private var fields: some View {
            section("gallery.fields") {
                MichaelTextField(String(localized: "gallery.field"), text: $field)
                MichaelTextField(
                    String(localized: "gallery.field.error.label"),
                    text: $minutes,
                    error: String(localized: "gallery.field.error")
                )
                MichaelSegmentedControl(selection: $segment, options: Segment.allCases, title: \.title)
            }
        }

        private var cards: some View {
            section("gallery.cards") {
                MichaelCard {
                    VStack(alignment: .leading, spacing: MichaelSpace.md) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(String(localized: "gallery.card.title"))
                                .michaelText(.label)
                                .foregroundStyle(Color.michael.muted)
                            Spacer()
                            Text(String(localized: "gallery.card.count \(completed) \(total)"))
                                .michaelText(.label)
                                .foregroundStyle(Color.michael.text)
                        }
                        MichaelProgressBar(value: Double(completed) / Double(total))
                        MichaelButton(String(localized: "gallery.card.advance"), style: .ghost) {
                            completed = completed == total ? 0 : completed + 1
                        }
                    }
                }
                AICard {
                    HStack(alignment: .top, spacing: MichaelSpace.md) {
                        MichaelOrb(size: .small)
                        Text(String(localized: "gallery.ai.body"))
                            .michaelText(.label)
                            .foregroundStyle(Color.michael.text)
                    }
                }
                // Three tiles in a row break words at accessibility sizes; the Review screen in Phase 9 needs the same fallback.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: MichaelSpace.sm) { statTiles }
                    VStack(spacing: MichaelSpace.sm) { statTiles }
                }
            }
        }

        @ViewBuilder private var statTiles: some View {
            StatTile(value: 7.formatted(), label: String(localized: "gallery.stat.planned"))
            StatTile(value: 5.formatted(), label: String(localized: "gallery.stat.completed"), isHighlighted: true)
            StatTile(value: 2.formatted(), label: String(localized: "gallery.stat.missed"))
        }

        private var controls: some View {
            section("gallery.controls") {
                MichaelToggle(String(localized: "gallery.toggle"), isOn: $reminder)
                MichaelToggle(String(localized: "gallery.thinking"), isOn: $isThinking)
            }
        }

        private var michael: some View {
            section("gallery.michael") {
                HStack(spacing: MichaelSpace.xxl) {
                    MichaelOrb(activity: isThinking ? .thinking : .idle, size: .large)
                    VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                        TypingDots()
                        Text(String(localized: "gallery.typing"))
                            .michaelText(.label)
                            .foregroundStyle(Color.michael.text)
                    }
                }
                .padding(.vertical, MichaelSpace.lg)
                .padding(.leading, MichaelSpace.lg)
                VStack(alignment: .leading, spacing: MichaelSpace.md) {
                    SkeletonBlock(width: MichaelSize.orbLarge * 1.5, height: MichaelSpace.md)
                    HStack(spacing: MichaelSpace.md) {
                        SkeletonBlock(width: MichaelSize.check, height: MichaelSize.check, cornerRadius: MichaelRadius.pill)
                        SkeletonBlock(height: MichaelSpace.lg)
                        SkeletonBlock(width: MichaelSize.orbLarge * 0.66, height: MichaelSize.chip, cornerRadius: MichaelRadius.pill)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "gallery.loading"))
            }
        }

        private var states: some View {
            section("gallery.states") {
                OfflineBanner(message: String(localized: "gallery.offline")) {}
                EmptyStateView(
                    title: String(localized: "gallery.empty.title"),
                    message: String(localized: "gallery.empty.message"),
                    actionTitle: String(localized: "gallery.empty.action")
                ) {}
                .padding(.vertical, MichaelSpace.lg)
                FailureStateView(message: String(localized: "gallery.failure")) {}
            }
        }

        private var colors: some View {
            section("gallery.colors") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MichaelSpace.sm), count: 4), spacing: MichaelSpace.sm) {
                    ForEach(swatches, id: \.0) { name, color in
                        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                            RoundedRectangle(cornerRadius: MichaelSpace.sm)
                                .fill(Color.michael[keyPath: color])
                                .overlay { RoundedRectangle(cornerRadius: MichaelSpace.sm).strokeBorder(Color.michael.border2) }
                                .frame(height: MichaelSize.chip)
                            Text(verbatim: name)
                                .michaelText(.caption)
                                .foregroundStyle(Color.michael.muted)
                        }
                    }
                }
            }
        }

        private func section(
            _ key: String.LocalizationValue,
            @ViewBuilder content: () -> some View
        ) -> some View {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                Text(String(localized: key))
                    .michaelText(.eyebrow)
                    .foregroundStyle(Color.michael.faint)
                    .accessibilityAddTraits(.isHeader)
                content()
            }
        }
    }
#endif
