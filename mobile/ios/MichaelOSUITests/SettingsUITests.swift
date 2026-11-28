import XCTest

/// Walks Settings against a running local server: appearance, an account edit, My Context saved, and a delete refused
/// for a wrong password, so nothing is removed. The names and context it changes are put back by the caller.
final class SettingsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testAccountContextAppearanceAndDeleteRefusal() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let app = XCUIApplication()
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let more = app.tabBars.firstMatch.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 30))
        more.tap()
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["My Context"].waitForExistence(timeout: 20))
        app.buttons["Light"].tap()
        attach(app, "light")
        app.buttons["System"].tap()

        app.staticTexts[email].tap()
        let fullName = app.textFields["Full name"]
        XCTAssertTrue(fullName.waitForExistence(timeout: 10))
        fullName.tap()
        fullName.typeText(" Walk")
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["My Context"].waitForExistence(timeout: 20), "Saving returns to Settings")

        app.staticTexts["My Context"].tap()
        let context = app.textViews["My Context"].exists ? app.textViews["My Context"] : app.textFields["My Context"]
        XCTAssertTrue(context.waitForExistence(timeout: 20))
        context.tap()
        context.typeText("Walked Settings.")
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars.buttons["Save"].waitForNonEnabled(timeout: 20), "Saved, so nothing is left to save")
        attach(app, "context")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        app.swipeUp()
        app.buttons["Delete account"].tap()
        app.secureTextFields["Password"].tap()
        app.secureTextFields["Password"].typeText("not-the-password")
        app.textFields["Type DELETE to confirm"].tap()
        app.textFields["Type DELETE to confirm"].typeText("DELETE")
        app.buttons["Delete my account"].tap()
        XCTAssertTrue(app.staticTexts["That password isn't right. Try again."].waitForExistence(timeout: 20))
        attach(app, "delete")
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

extension XCUIElement {
    @MainActor func waitForNonEnabled(timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == false"), object: self)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}
