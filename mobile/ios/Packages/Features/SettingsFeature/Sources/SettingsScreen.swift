import DesignSystem
import Models
import Repositories
import SwiftUI

/// What Settings needs from the app.
public struct SettingsActions {
    /// Ends the session on this device; the app returns to Welcome.
    let signOut: () -> Void
    /// The routine or availability was saved; screens that plan with them reload.
    let changed: () -> Void
    let termsURL: URL
    let privacyURL: URL

    public init(signOut: @escaping () -> Void, changed: @escaping () -> Void, termsURL: URL, privacyURL: URL) {
        self.signOut = signOut
        self.changed = changed
        self.termsURL = termsURL
        self.privacyURL = privacyURL
    }
}

/// Settings, pushed from More.
public struct SettingsScreen: View {
    private let repositories: SettingsRepositories
    private let actions: SettingsActions

    public init(
        accounts: any AccountRepository, profiles: any ProfileRepository, calendar: any CalendarRepository, actions: SettingsActions
    ) {
        repositories = SettingsRepositories(accounts: accounts, profiles: profiles, calendar: calendar)
        self.actions = actions
    }

    public var body: some View {
        SettingsHost(model: SettingsModel(accounts: repositories.accounts), repositories: repositories, actions: actions)
    }
}

struct SettingsRepositories {
    let accounts: any AccountRepository
    let profiles: any ProfileRepository
    let calendar: any CalendarRepository
}

private enum SettingsRoute: Hashable {
    case account, context, routine, availability, licences, delete
}

private struct SettingsHost: View {
    @State private var model: SettingsModel
    let repositories: SettingsRepositories
    let actions: SettingsActions
    @AppStorage(Appearance.storageKey) private var appearance = Appearance.system
    @State private var confirmingSignOut = false

    init(model: @autoclosure () -> SettingsModel, repositories: SettingsRepositories, actions: SettingsActions) {
        _model = State(initialValue: model())
        self.repositories = repositories
        self.actions = actions
    }

    private var accounts: any AccountRepository { repositories.accounts }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "settings.title", bundle: .module))
            .task { await model.load() }
    }

    @ViewBuilder private func destination(_ route: SettingsRoute) -> some View {
        switch route {
        case .account:
            if let account = model.account {
                AccountScreen(model: accountEditor(account)) { model.replace($0) }
            }
        case .context: ContextScreen(model: ContextEditorModel(accounts: accounts))
        case .routine: RoutineScreen(model: RoutineEditorModel(profiles: repositories.profiles), onSaved: actions.changed)
        case .availability:
            AvailabilityScreen(model: AvailabilityEditorModel(calendar: repositories.calendar), onSaved: actions.changed)
        case .licences: LicencesScreen()
        case .delete: DeleteAccountScreen(model: DeleteAccountModel(accounts: accounts), onDeleted: actions.signOut)
        }
    }

    private func accountEditor(_ account: Account) -> AccountEditorModel {
        let editor = AccountEditorModel(account: account, accounts: accounts)
        editor.pictureChanged = { [model] in model.replace($0) }
        return editor
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().accessibilityLabel(String(localized: "settings.loading", bundle: .module))
        case .failed(let error):
            FailureStateView(message: SettingsFormat.message(error)) { _Concurrency.Task { await model.load() } }
        case .content(let account):
            list(account)
        }
    }

    private func list(_ account: Account) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                NavigationLink {
                    destination(.account)
                } label: {
                    AccountSummary(account: account, accounts: accounts)
                }
                .buttonStyle(.plain)
                section(String(localized: "settings.section.michael", bundle: .module)) {
                    row(String(localized: "settings.context", bundle: .module), route: .context)
                    row(String(localized: "settings.routine", bundle: .module), route: .routine)
                    row(String(localized: "settings.availability", bundle: .module), route: .availability)
                }
                section(String(localized: "settings.appearance", bundle: .module)) {
                    MichaelSegmentedControl(selection: $appearance, options: Appearance.allCases, title: SettingsFormat.appearance)
                }
                section(String(localized: "settings.section.about", bundle: .module)) {
                    link(String(localized: "settings.privacy", bundle: .module), actions.privacyURL)
                    link(String(localized: "settings.terms", bundle: .module), actions.termsURL)
                    row(String(localized: "settings.licences", bundle: .module), route: .licences)
                    HStack {
                        Text(String(localized: "settings.version", bundle: .module)).michaelText(.body).foregroundStyle(Color.michael.text)
                        Spacer()
                        Text(SettingsFormat.version).michaelText(.label).foregroundStyle(Color.michael.muted)
                    }
                    .padding(.vertical, MichaelSpace.sm)
                    .accessibilityElement(children: .combine)
                }
                MichaelButton(String(localized: "settings.signOut", bundle: .module), style: .secondary) { confirmingSignOut = true }
                NavigationLink {
                    destination(.delete)
                } label: {
                    Text(String(localized: "settings.delete", bundle: .module))
                        .michaelText(.button)
                        .foregroundStyle(Color.michael.danger)
                        .frame(maxWidth: .infinity, minHeight: MichaelSize.checkTouch)
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .refreshable { await model.load() }
        .confirmationDialog(
            String(localized: "settings.signOut.title", bundle: .module), isPresented: $confirmingSignOut, titleVisibility: .visible
        ) {
            Button(String(localized: "settings.signOut", bundle: .module), role: .destructive, action: actions.signOut)
        }
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(title).michaelText(.eyebrow).foregroundStyle(Color.michael.muted).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func row(_ title: String, route: SettingsRoute) -> some View {
        NavigationLink {
            destination(route)
        } label: {
            HStack {
                Text(title).michaelText(.body).foregroundStyle(Color.michael.text)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.michael.faint).accessibilityHidden(true)
            }
            .padding(.vertical, MichaelSpace.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func link(_ title: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Text(title).michaelText(.body).foregroundStyle(Color.michael.text)
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(Color.michael.faint).accessibilityHidden(true)
            }
            .padding(.vertical, MichaelSpace.sm)
            .contentShape(Rectangle())
        }
    }
}

private struct AccountSummary: View {
    let account: Account
    let accounts: any AccountRepository

    var body: some View {
        MichaelCard {
            HStack(spacing: MichaelSpace.md) {
                AvatarView(identity: account.identity, accounts: accounts, size: MichaelSize.checkTouch)
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    Text(account.fullName).michaelText(.heading).foregroundStyle(Color.michael.text)
                    Text(account.email).michaelText(.caption).foregroundStyle(Color.michael.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.michael.faint).accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(String(localized: "settings.account.hint", bundle: .module))
    }
}

/// Picture, names, email and sign-in methods. A picture change applies at once; the names wait for Save.
struct AccountScreen: View {
    @State private var model: AccountEditorModel
    let onSaved: (Account) -> Void
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> AccountEditorModel, onSaved: @escaping (Account) -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                if let failure = model.failure { ErrorBanner(message: SettingsFormat.message(failure)) }
                AccountPictureRow(model: model)
                MichaelTextField(
                    String(localized: "settings.account.fullName", bundle: .module),
                    text: Binding(get: { model.form.fullName }, set: { value in model.edit { $0.fullName = value } }),
                    error: model.serverErrors["fullName"] ?? problem(model.form.fullName)
                )
                MichaelTextField(
                    String(localized: "settings.account.preferredName", bundle: .module),
                    text: Binding(get: { model.form.preferredName }, set: { value in model.edit { $0.preferredName = value } }),
                    error: model.serverErrors["preferredName"] ?? problem(model.form.preferredName)
                )
                readOnly(String(localized: "settings.account.email", bundle: .module), model.account.email)
                readOnly(
                    String(localized: "settings.account.methods", bundle: .module),
                    model.account.providers.map(SettingsFormat.provider).formatted(.list(type: .and)))
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .background(MichaelBackground())
        .navigationTitle(String(localized: "settings.account", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if model.saving {
                    ProgressView()
                } else {
                    Button(String(localized: "settings.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                        .disabled(!model.hasChanges)
                }
            }
        }
        .onChange(of: model.saved) { _, saved in
            if let saved {
                onSaved(saved)
                dismiss()
            }
        }
    }

    private func problem(_ name: String) -> String? {
        guard model.showsProblems, let problem = AccountForm.problem(name) else { return nil }
        return switch problem {
        case .missing: String(localized: "settings.account.problem.missing", bundle: .module)
        case .tooLong: String(localized: "settings.account.problem.long", bundle: .module)
        }
    }

    private func readOnly(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(label).michaelText(.label).foregroundStyle(Color.michael.muted)
            Text(value).michaelText(.body).foregroundStyle(Color.michael.text)
        }
        .accessibilityElement(children: .combine)
    }
}
