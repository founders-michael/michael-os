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

    /// Routine and availability saved, and a library photo uploaded as the picture. The caller checks the server and
    /// puts the routine back with settings2-check.mjs.
    @MainActor func testRoutineAvailabilityAndPicture() throws {
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

        XCTAssertTrue(app.staticTexts["Routine"].waitForExistence(timeout: 20))
        app.staticTexts["Routine"].tap()
        XCTAssertTrue(app.buttons["Saturday"].waitForExistence(timeout: 20))
        app.buttons["Saturday"].tap()
        let field = app.textFields["Add a priority"]
        field.tap()
        field.typeText("Family\n")
        XCTAssertTrue(app.staticTexts["Family"].waitForExistence(timeout: 5))
        app.swipeUp()
        app.steppers.firstMatch.buttons.element(boundBy: 1).tap()
        attach(app, "routine")
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Availability"].waitForExistence(timeout: 20), "Saving returns to Settings")

        app.staticTexts["Availability"].tap()
        let addTuesday = app.buttons["Add a window on Tuesday"]
        XCTAssertTrue(addTuesday.waitForExistence(timeout: 20))
        addTuesday.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        addTuesday.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        app.switches.firstMatch.tap()
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["09:00 – 17:00"].waitForExistence(timeout: 5))
        attach(app, "availability")
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Routine"].waitForExistence(timeout: 20), "Saving returns to Settings")

        app.staticTexts[email].tap()
        app.buttons["Change photo"].tap()
        XCTAssertTrue(app.scrollViews.images.firstMatch.waitForExistence(timeout: 20), "The photo library opened")
        // The picker runs in another process; its first photo sits under the privacy banner.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.17, dy: 0.46)).tap()
        XCTAssertTrue(app.buttons["Remove picture"].waitForExistence(timeout: 30), "The upload is the picture")
        attach(app, "picture")
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
