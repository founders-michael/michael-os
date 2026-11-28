import XCTest

/// Walks Calendar against a running local server with the planner: an event created, an overlap refused, a plan asked
/// for, held on the day view, then applied, and the event deleted. `calendar-walk.mjs seed` prepares the account
/// (availability and one estimated task); `check` and `restore` read and undo what the walk left.
final class CalendarUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testEventsConflictAndPlan() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let app = XCUIApplication()
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let tab = app.tabBars.firstMatch.buttons["Calendar"]
        XCTAssertTrue(tab.waitForExistence(timeout: 30))
        tapUntil(tab, shows: app.buttons["Plan"])
        attach(app, "day")

        addEvent(app, "Walk commitment")
        let saved = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Walk commitment")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 20), "The saved event is on the day")

        addEvent(app, "Walk overlap")
        XCTAssertTrue(app.staticTexts["This time overlaps another event"].waitForExistence(timeout: 20))
        attach(app, "conflict")
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Discard"].firstMatch.tap()

        tapUntil(app.buttons["Plan"], shows: app.buttons["Make a plan"])
        attach(app, "plan-dates")
        app.buttons["Make a plan"].tap()
        let apply = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Apply")).firstMatch
        XCTAssertTrue(apply.waitForExistence(timeout: 30), "The planner proposed sessions")
        attach(app, "plan")
        app.navigationBars.buttons["Close"].tap()
        let bar = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Plan ready")).firstMatch
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "The plan stays on the day view")
        attach(app, "held")
        bar.tap()
        XCTAssertTrue(apply.waitForExistence(timeout: 10))
        apply.tap()
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "added to your calendar")).firstMatch
                .waitForExistence(timeout: 30))
        attach(app, "applied")
        app.buttons["Done"].tap()

        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        saved.tap()
        XCTAssertTrue(app.buttons["Delete event"].waitForExistence(timeout: 10))
        app.buttons["Delete event"].tap()
        app.buttons["Delete"].firstMatch.tap()
        XCTAssertTrue(saved.waitForNonExistence(timeout: 20), "The deleted event is gone")
        attach(app, "after")
    }

    /// A tap made while a tab or a sheet is still moving can be dropped.
    @MainActor private func tapUntil(_ button: XCUIElement, shows target: XCUIElement) {
        for _ in 0..<3 where !target.exists {
            button.tap()
            _ = target.waitForExistence(timeout: 8)
        }
        XCTAssertTrue(target.exists)
    }

    @MainActor private func addEvent(_ app: XCUIApplication, _ name: String) {
        app.buttons["New event"].tap()
        let title = app.textFields["Title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        title.tap()
        title.typeText(name)
        attach(app, "editor")
        app.navigationBars.buttons["Save"].tap()
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
