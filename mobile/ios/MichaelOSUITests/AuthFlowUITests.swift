import XCTest

/// Walks sign-in, all five onboarding steps, the placeholder home and sign-out against a running local server.
/// It needs an account that is verified and has no profile yet:
/// `TEST_RUNNER_MICHAEL_NEW_EMAIL=… TEST_RUNNER_MICHAEL_NEW_PASSWORD=… xcodebuild test -scheme APICheck …`
/// Set `TEST_RUNNER_MICHAEL_TEXT_SIZE` to a content size category to run it at that text size.
final class AuthFlowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testSignInOnboardAndSignOut() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_NEW_EMAIL"], "Set TEST_RUNNER_MICHAEL_NEW_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_NEW_PASSWORD"], "Set TEST_RUNNER_MICHAEL_NEW_PASSWORD")

        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()

        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
        attach(app, "welcome")
        app.buttons["Create an account"].tap()
        XCTAssertTrue(app.staticTexts["Create your account"].waitForExistence(timeout: 5))
        attach(app, "register")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        app.buttons["Sign in with email"].tap()
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)
        attach(app, "sign-in")
        app.buttons["Sign in"].tap()

        XCTAssertTrue(app.staticTexts["What should Michael call you?"].waitForExistence(timeout: 20))
        dismissPasswordPrompt(app)
        attach(app, "onboarding-1")
        let headings = [
            "When does your day start and end?", "When do you work?", "What matters most right now?", "How do you like to work?",
        ]
        for (index, heading) in headings.enumerated() {
            if index == 3 { app.buttons["Health"].tap() }
            continueStep(app)
            XCTAssertTrue(app.staticTexts[heading].waitForExistence(timeout: 20), heading)
            attach(app, "onboarding-\(index + 2)")
        }
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Structured")).firstMatch.tap()
        continueStep(app, title: "Finish setup")

        let signOut = app.buttons["Sign out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 20))
        attach(app, "home")
        app.terminate()
        app.launch()
        XCTAssertTrue(signOut.waitForExistence(timeout: 20), "A finished onboarding should open at home after relaunch")
        signOut.tap()
        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
    }

    @MainActor private func continueStep(_ app: XCUIApplication, title: String = "Continue") {
        let button = app.buttons[title]
        if !button.isHittable { app.swipeUp() }
        button.tap()
    }

    @MainActor private func dismissPasswordPrompt(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for notNow in [app.buttons["Not Now"], springboard.buttons["Not Now"]] where notNow.waitForExistence(timeout: 3) {
            notNow.tap()
            break
        }
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
