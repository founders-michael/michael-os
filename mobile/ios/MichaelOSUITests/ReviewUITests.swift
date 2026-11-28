import XCTest

/// Walks the Daily Review against a running local server: today's review, a reflection autosaved, and a missed task
/// moved to the next day. It needs an onboarded account with an open task `TEST_RUNNER_MICHAEL_TASK` due today; the
/// task ends up due tomorrow.
final class ReviewUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testReflectionAutosaveAndCarryForward() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let task = try XCTUnwrap(environment["MICHAEL_TASK"], "Set TEST_RUNNER_MICHAEL_TASK")
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let more = app.tabBars.firstMatch.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 30))
        more.tap()
        app.buttons["Daily Review"].tap()
        XCTAssertTrue(app.staticTexts[task].firstMatch.waitForExistence(timeout: 20))
        attach(app, "overview")

        app.buttons["Move to next day"].firstMatch.tap()
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Moved to")).firstMatch.waitForExistence(timeout: 20))
        attach(app, "moved")

        let prompt = "What went well today?"
        let field = app.textViews[prompt].exists ? app.textViews[prompt] : app.textFields[prompt]
        field.tap()
        field.typeText("Walked the review. ")
        XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 20), "The reflection autosaves")
        attach(app, "reflection")
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
