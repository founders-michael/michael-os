import XCTest

/// Drives the debug API screen against a running local server, so it is not part of the `MichaelOS` scheme
/// that CI runs. Run it with the `APICheck` scheme and the account in the environment:
/// `TEST_RUNNER_MICHAEL_EMAIL=… TEST_RUNNER_MICHAEL_PASSWORD=… TEST_RUNNER_MICHAEL_TASK=… xcodebuild test -scheme APICheck …`
///
/// XCTestCase is not main-actor isolated, so this target keeps the nonisolated default and marks UI work.
final class APICheckUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testSignInListsTasksAndSurvivesRelaunch() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let taskTitle = try XCTUnwrap(environment["MICHAEL_TASK"], "Set TEST_RUNNER_MICHAEL_TASK")

        let app = XCUIApplication()
        app.launchArguments = ["-debugTab", "api"]
        app.launch()
        signOutIfNeeded(app)

        signIn(app, email: email, password: "\(password)-wrong")
        XCTAssertTrue(app.staticTexts["Invalid email or password"].waitForExistence(timeout: 20))
        attach(app, "wrong-password")

        signIn(app, email: email, password: password)
        XCTAssertTrue(app.staticTexts[taskTitle].waitForExistence(timeout: 20))
        attach(app, "signed-in")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts[taskTitle].waitForExistence(timeout: 20), "The Keychain token did not survive a relaunch")

        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 20))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 20), "Sign-out did not remove the Keychain token")
        attach(app, "signed-out")
    }

    @MainActor private func signOutIfNeeded(_ app: XCUIApplication) {
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 5) { signOut.tap() }
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 20))
    }

    @MainActor private func signIn(_ app: XCUIApplication, email: String, password: String) {
        let emailField = app.textFields["Email"]
        if emailField.value as? String != email {
            emailField.tap()
            emailField.typeText(email)
        }
        let passwordField = app.secureTextFields["Password"]
        // A secure field clears itself when editing starts again.
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["Sign in"].tap()
        app.dismissPasswordPrompt()
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
