import Models
import TestSupport
import Testing

@testable import AuthFeature

struct AuthModelTests {
    @Test func wrongPasswordShowsOneMessageForBothFields() async {
        let auth = FakeAuthRepository()
        auth.fail(with: .unauthorized(ServerMessage(text: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD")))
        let model = SignInModel(auth: auth)
        await model.signIn(email: " sam@example.test ", password: "wrong")
        guard case .failed(let error) = model.state else {
            Issue.record("expected a failure, got \(model.state)")
            return
        }
        #expect(error.authMessage == "That email and password don't match. Check both and try again.")
        #expect(auth.calls == [.signIn(email: "sam@example.test", password: "wrong")])
    }

    @Test func unverifiedEmailGoesToCheckYourEmail() async {
        let auth = FakeAuthRepository()
        auth.fail(with: .forbidden(ServerMessage(text: "Email not verified", code: "EMAIL_NOT_VERIFIED")))
        let model = SignInModel(auth: auth)
        await model.signIn(email: "sam@example.test", password: "LocalOnly-Sample-2026")
        #expect(model.state == .needsVerification(email: "sam@example.test"))
        model.verificationShown()
        #expect(model.state == .idle)
    }

    @Test func offlineSignInKeepsTheScreenAndSaysSo() async {
        let auth = FakeAuthRepository()
        auth.fail(with: .offline)
        let model = SignInModel(auth: auth)
        await model.signIn(email: "sam@example.test", password: "x")
        #expect(model.state == .failed(.offline))
    }

    @Test func doubleTapSignsInOnce() async {
        let auth = FakeAuthRepository()
        let release = AsyncStream<Void>.makeStream()
        auth.hold { for await _ in release.stream { return } }
        let model = SignInModel(auth: auth)
        async let first: Void = model.signIn(email: "sam@example.test", password: "p")
        while model.state != .submitting { await _Concurrency.Task.yield() }
        await model.signIn(email: "sam@example.test", password: "p")
        release.continuation.yield()
        await first
        #expect(auth.calls.count == 1)
        #expect(model.state == .idle)
    }

    @Test func signInNeedsAnEmailAndAPassword() {
        #expect(!SignInModel.canSubmit(email: "", password: "p"))
        #expect(!SignInModel.canSubmit(email: "sam", password: "p"))
        #expect(!SignInModel.canSubmit(email: "sam@example.test", password: ""))
        #expect(SignInModel.canSubmit(email: "sam@example.test", password: "p"))
    }

    @Test(arguments: [
        ("", false, false, false),
        ("short", false, false, true),
        ("alllowercase12", true, false, true),
        ("ALLUPPERCASE12", true, true, false),
        ("LocalOnly-Sample-2026", true, true, true),
        ("ÄÖÜÉÈÊËÎÏÔ-äöüé", true, false, false),
        (String(repeating: "Aa", count: 65), false, true, true),
    ])
    func passwordRulesMatchTheServer(password: String, length: Bool, upper: Bool, lower: Bool) {
        let rules = PasswordRules(password)
        #expect(rules.hasLength == length)
        #expect(rules.hasUppercase == upper)
        #expect(rules.hasLowercase == lower)
        #expect(rules.isMet == (length && upper && lower))
    }

    @Test func registerGoesToCheckYourEmailEvenForAnExistingAddress() async {
        let auth = FakeAuthRepository()
        let model = RegisterModel(auth: auth)
        await model.register(name: " Sam Rivera ", email: "sam@example.test ", password: "LocalOnly-Sample-2026")
        #expect(model.state == .registered(email: "sam@example.test"))
        #expect(auth.calls == [.register(name: "Sam Rivera", email: "sam@example.test", password: "LocalOnly-Sample-2026")])
    }

    @Test func registerRefusesAPasswordThatBreaksTheRule() async {
        let auth = FakeAuthRepository()
        let model = RegisterModel(auth: auth)
        await model.register(name: "Sam", email: "sam@example.test", password: "short")
        #expect(auth.calls.isEmpty)
        #expect(model.state == .idle)
    }

    @Test func registerShowsTheServersMessage() async {
        let auth = FakeAuthRepository()
        let message = "Password must be 12–128 characters and include an uppercase and a lowercase letter."
        auth.fail(with: .validation(ServerMessage(text: message), fields: [:]))
        let model = RegisterModel(auth: auth)
        await model.register(name: "Sam", email: "sam@example.test", password: "LocalOnly-Sample-2026")
        guard case .failed(let error) = model.state else {
            Issue.record("expected a failure")
            return
        }
        #expect(error.authMessage == message)
    }

    @Test func resendWaitsForTheCooldownThenSends() async {
        let auth = FakeAuthRepository()
        let model = CheckEmailModel(email: "sam@example.test", auth: auth, sleep: { _ in })
        await model.resend()
        #expect(auth.calls.isEmpty)
        await model.countDown()
        #expect(model.state == .ready)
        await model.resend()
        #expect(auth.calls == [.resendVerification(email: "sam@example.test")])
        #expect(model.state == .coolingDown(seconds: CheckEmailModel.cooldownSeconds))
    }

    @Test func failedResendCanBeTriedAgain() async {
        let auth = FakeAuthRepository()
        let model = CheckEmailModel(email: "sam@example.test", auth: auth, sleep: { _ in })
        await model.countDown()
        auth.fail(with: .offline)
        await model.resend()
        #expect(model.state == .failed(.offline))
        await model.resend()
        #expect(auth.calls.count == 2)
        #expect(model.isCoolingDown)
    }

    @Test func countdownStopsWhenTheScreenGoes() async {
        let model = CheckEmailModel(email: "sam@example.test", auth: FakeAuthRepository(), sleep: { _ in throw CancellationError() })
        await model.countDown()
        #expect(model.state == .coolingDown(seconds: CheckEmailModel.cooldownSeconds))
    }
}
