import DesignSystem
import Models
import Repositories
import SwiftUI

public struct OnboardingScreen: View {
    @State private var model: OnboardingModel
    private let onFinished: () -> Void

    public init(
        profiles: any ProfileRepository,
        suggestedName: String,
        deviceTimeZone: String,
        onFinished: @escaping () -> Void
    ) {
        _model = State(
            initialValue: OnboardingModel(profiles: profiles, suggestedName: suggestedName, deviceTimeZone: deviceTimeZone)
        )
        self.onFinished = onFinished
    }

    public var body: some View {
        content
            .task { await model.load() }
            .onChange(of: model.state.stage) { _, stage in
                if stage == .finished { onFinished() }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state.stage {
        case .loading, .finished:
            ProgressView()
                .tint(Color.michael.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(MichaelBackground())
        case .failed(let error):
            FailureStateView(message: error.onboardingMessage) {
                _Concurrency.Task { await model.load() }
            }
            .background(MichaelBackground())
        case .step(let step):
            StepPage(model: model, step: step)
        }
    }
}

private struct StepPage: View {
    let model: OnboardingModel
    let step: OnboardingStep

    var body: some View {
        MichaelPage {
            ProgressHeader(step: step, onBack: step.previous == nil ? nil : { model.back() })
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(step.title)
                    .michaelText(.display)
                    .foregroundStyle(Color.michael.text)
                    .accessibilityAddTraits(.isHeader)
                if let message = step.message {
                    Text(message)
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                }
            }
            if let problem = model.state.problem {
                ErrorBanner(message: problem.onboardingMessage)
            }
            switch step {
            case .name: NameStep(model: model)
            case .sleep: SleepStep(model: model)
            case .work: WorkStep(model: model)
            case .priorities: PrioritiesStep(model: model)
            case .focus: FocusStep(model: model)
            }
        } footer: {
            VStack(spacing: MichaelSpace.sm) {
                MichaelButton(continueTitle) {
                    _Concurrency.Task { await model.advance() }
                }
                .disabled(model.state.isSaving)
                if step == .work {
                    MichaelButton(String(localized: "onboarding.work.skip", bundle: .module), style: .ghost) {
                        _Concurrency.Task { await model.skipWorkHours() }
                    }
                    .disabled(model.state.isSaving)
                }
                if step == .priorities {
                    MichaelButton(String(localized: "onboarding.priorities.skip", bundle: .module), style: .ghost) {
                        _Concurrency.Task { await model.skipPriorities() }
                    }
                    .disabled(model.state.isSaving)
                }
            }
        }
    }

    private var continueTitle: String {
        if model.state.isSaving { return String(localized: "onboarding.saving", bundle: .module) }
        return String(localized: step == .focus ? "onboarding.finish" : "onboarding.continue", bundle: .module)
    }
}

private struct ProgressHeader: View {
    let step: OnboardingStep
    let onBack: (() -> Void)?

    var body: some View {
        HStack(spacing: MichaelSpace.md) {
            if let onBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(Color.michael.muted)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "onboarding.back", bundle: .module))
            }
            MichaelProgressBar(value: Double(step.rawValue) / Double(OnboardingStep.allCases.count))
                .accessibilityLabel(String(localized: "onboarding.progress", bundle: .module))
                .accessibilityValue(
                    String(localized: "onboarding.stepOf \(step.rawValue) \(OnboardingStep.allCases.count)", bundle: .module))
            Text(String(localized: "onboarding.stepShort \(step.rawValue) \(OnboardingStep.allCases.count)", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
                .accessibilityHidden(true)
        }
        .frame(minHeight: MichaelSize.checkTouch)
    }
}

extension OnboardingStep {
    var title: String {
        switch self {
        case .name: String(localized: "onboarding.name.title", bundle: .module)
        case .sleep: String(localized: "onboarding.sleep.title", bundle: .module)
        case .work: String(localized: "onboarding.work.title", bundle: .module)
        case .priorities: String(localized: "onboarding.priorities.title", bundle: .module)
        case .focus: String(localized: "onboarding.focus.title", bundle: .module)
        }
    }

    var message: String? {
        switch self {
        case .name: String(localized: "onboarding.name.message", bundle: .module)
        case .sleep: String(localized: "onboarding.sleep.message", bundle: .module)
        case .work: String(localized: "onboarding.work.message", bundle: .module)
        case .priorities: String(localized: "onboarding.priorities.message", bundle: .module)
        case .focus: nil
        }
    }
}

extension AppError {
    var onboardingMessage: String {
        switch self {
        case .offline: String(localized: "onboarding.error.offline", bundle: .module)
        case .timeout: String(localized: "onboarding.error.timeout", bundle: .module)
        case .decoding, .unauthorized, .rateLimited: String(localized: "onboarding.error.generic", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server),
            .validation(let server, _):
            server.text ?? String(localized: "onboarding.error.generic", bundle: .module)
        }
    }
}
