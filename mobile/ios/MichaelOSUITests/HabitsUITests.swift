import XCTest

/// Walks Habits against a running local server: the list, a habit's detail, checking in and undoing, and the editor.
/// It needs an onboarded account with an active habit `TEST_RUNNER_MICHAEL_HABIT` scheduled today, unchecked, and
/// leaves it unchecked.
final class HabitsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testListDetailCheckInAndEditor() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let habit = try XCTUnwrap(environment["MICHAEL_HABIT"], "Set TEST_RUNNER_MICHAEL_HABIT")
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let more = app.tabBars.firstMatch.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 30))
        more.tap()
        app.buttons["Habits"].tap()
        let check = app.switches["Check in \(habit)"]
        XCTAssertTrue(check.waitForExistence(timeout: 20))
        attach(app, "list")
        check.tap()
        XCTAssertTrue(app.switches["Undo check-in \(habit)"].waitForExistence(timeout: 20))
        app.switches["Undo check-in \(habit)"].tap()
        XCTAssertTrue(check.waitForExistence(timeout: 20), "Undo puts it back")

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", habit)).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Last 30 days"].waitForExistence(timeout: 20))
        attach(app, "detail")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        app.buttons["New habit"].tap()
        XCTAssertTrue(app.staticTexts["How often"].waitForExistence(timeout: 10))
        app.buttons["Selected days"].tap()
        attach(app, "editor")
        app.buttons["Cancel"].tap()
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
