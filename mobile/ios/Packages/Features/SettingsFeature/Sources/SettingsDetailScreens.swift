import DesignSystem
import Models
import SwiftUI

/// My Context: what Michael reads about the user, with a live count against the limit.
struct ContextScreen: View {
    @State private var model: ContextEditorModel

    init(model: @autoclosure () -> ContextEditorModel) {
        _model = State(initialValue: model())
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "settings.context", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if model.saving {
                        ProgressView()
                    } else {
                        Button(String(localized: "settings.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                            .disabled(!model.hasChanges || model.draft.isTooLong || model.conflict != nil)
                    }
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
        case .failed(let error):
            FailureStateView(message: SettingsFormat.message(error)) { _Concurrency.Task { await model.load() } }
        case .editing:
            editor
        }
    }

    private var editor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                Text(String(localized: "settings.context.intro", bundle: .module)).michaelText(.body).foregroundStyle(Color.michael.muted)
                if let failure = model.failure { ErrorBanner(message: SettingsFormat.message(failure)) }
                if let conflict = model.conflict { ConflictCard(saved: conflict, model: model) }
                TextField(
                    String(localized: "settings.context.placeholder", bundle: .module),
                    text: Binding(get: { model.draft.text }, set: { model.edit($0) }), axis: .vertical
                )
                .lineLimit(8...20)
                .michaelText(.body)
                .accessibilityLabel(String(localized: "settings.context", bundle: .module))
                .michaelFieldFrame()
                Text(String(localized: "settings.context.count \(model.draft.count) \(ContextDraft.limit)", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(model.draft.isTooLong ? Color.michael.danger : Color.michael.muted)
                    .monospacedDigit()
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

/// Saved on another device since this one loaded: the saved copy beside the user's, and the choice.
private struct ConflictCard: View {
    let saved: PersonalContext
    let model: ContextEditorModel

    var body: some View {
        MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(String(localized: "settings.context.conflict", bundle: .module)).michaelText(.body).foregroundStyle(Color.michael.text)
                Text(String(localized: "settings.context.conflict.saved", bundle: .module)).michaelText(.label).foregroundStyle(
                    Color.michael.muted)
                Text(saved.summary.isEmpty ? String(localized: "settings.context.conflict.empty", bundle: .module) : saved.summary)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                    .padding(MichaelSpace.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.field))
                MichaelButton(String(localized: "settings.context.keepMine", bundle: .module), size: .small) {
                    _Concurrency.Task { await model.keepMine() }
                }
                MichaelButton(String(localized: "settings.context.useSaved", bundle: .module), style: .secondary, size: .small) {
                    model.useSaved()
                }
            }
        }
    }
}

/// Deleting the account. Required by both stores; it cannot be undone.
struct DeleteAccountScreen: View {
    @State private var model: DeleteAccountModel
    let onDeleted: () -> Void

    init(model: @autoclosure () -> DeleteAccountModel, onDeleted: @escaping () -> Void) {
        _model = State(initialValue: model())
        self.onDeleted = onDeleted
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                Text(String(localized: "settings.delete.intro", bundle: .module)).michaelText(.body).foregroundStyle(Color.michael.text)
                Text(String(localized: "settings.delete.removed", bundle: .module)).michaelText(.body).foregroundStyle(Color.michael.muted)
                if let failure = model.failure { ErrorBanner(message: SettingsFormat.deleteMessage(failure)) }
                MichaelTextField(
                    String(localized: "settings.delete.password", bundle: .module),
                    text: Binding(get: { model.password }, set: { model.password = $0 }), isSecure: true)
                MichaelTextField(
                    String(localized: "settings.delete.type \(DeleteConfirmation.word)", bundle: .module),
                    text: Binding(get: { model.typed }, set: { model.typed = $0 })
                )
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                if model.deleting {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    MichaelButton(String(localized: "settings.delete.confirm", bundle: .module), style: .destructive) {
                        _Concurrency.Task { await model.delete() }
                    }
                    .disabled(!model.isReady)
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .background(MichaelBackground())
        .navigationTitle(String(localized: "settings.delete", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: model.deleted) { _, deleted in
            if deleted { onDeleted() }
        }
    }
}

/// The app uses only Apple's frameworks; this says so rather than leaving the row empty.
struct LicencesScreen: View {
    var body: some View {
        ScrollView {
            Text(String(localized: "settings.licences.ios", bundle: .module))
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, MichaelSpace.screenGutter)
        }
        .background(MichaelBackground())
        .navigationTitle(String(localized: "settings.licences", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
    }
}

enum SettingsFormat {
    static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    static func appearance(_ appearance: Appearance) -> String {
        switch appearance {
        case .system: String(localized: "settings.appearance.system", bundle: .module)
        case .dark: String(localized: "settings.appearance.dark", bundle: .module)
        case .light: String(localized: "settings.appearance.light", bundle: .module)
        }
    }

    static func provider(_ provider: String) -> String {
        switch provider {
        case "credential": String(localized: "settings.provider.email", bundle: .module)
        case "google": String(localized: "settings.provider.google", bundle: .module)
        case "apple": String(localized: "settings.provider.apple", bundle: .module)
        case "github": String(localized: "settings.provider.github", bundle: .module)
        default: provider
        }
    }

    static func deleteMessage(_ error: AppError) -> String {
        if case .conflict(let server) = error, server.code == "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION" {
            return String(localized: "settings.delete.organization", bundle: .module)
        }
        if case .validation(let server, _) = error, server.code == "INVALID_PASSWORD" {
            return String(localized: "settings.delete.wrongPassword", bundle: .module)
        }
        return message(error)
    }

    static func message(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "settings.error.offline", bundle: .module)
        case .timeout: String(localized: "settings.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server), .validation(let server, _),
            .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "settings.error.generic", bundle: .module)
        case .decoding: String(localized: "settings.error.generic", bundle: .module)
        }
    }
}
