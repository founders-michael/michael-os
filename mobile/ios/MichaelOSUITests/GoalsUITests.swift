import XCTest

/// Walks Goals against a running local server: create a goal, add and check milestones, move one, complete and reopen
/// the goal, then delete it, so the account is left as it was.
final class GoalsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testCreateMilestonesCompleteAndDelete() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let title = "Walk goal \(Int.random(in: 1000...9999))"
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let more = app.tabBars.firstMatch.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 30))
        more.tap()
        app.buttons["Goals"].tap()
        XCTAssertTrue(app.buttons["New goal"].waitForExistence(timeout: 20))
        attach(app, "list")

        app.navigationBars.buttons["New goal"].tap()
        let field = app.textFields["Title"]
        if !field.waitForExistence(timeout: 10) {
            attach(app, "noeditor")
            XCTFail(app.debugDescription)
        }
        field.tap()
        field.typeText(title)
        attach(app, "editor")
        app.buttons["Save"].tap()

        let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20), "The new goal is listed")
        card.tap()
        try walkDetail(app)

        app.buttons["Delete goal"].tap()
        let confirm = app.sheets.buttons["Delete goal"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        confirm.tap()
        XCTAssertTrue(app.buttons["New goal"].waitForExistence(timeout: 20))
        XCTAssertFalse(card.exists, "The goal is gone")
    }

    /// Milestones added, checked and moved, then the goal completed and reopened.
    @MainActor private func walkDetail(_ app: XCUIApplication) throws {
        XCTAssertTrue(app.staticTexts["Michael’s read"].waitForExistence(timeout: 20))
        for milestone in ["First step", "Second step"] {
            let add = app.textFields["Add milestone"]
            add.tap()
            add.typeText(milestone + "\n")
            XCTAssertTrue(app.staticTexts[milestone].waitForExistence(timeout: 20))
        }
        app.switches["Mark done: First step"].tap()
        XCTAssertTrue(app.switches["Mark not done: First step"].waitForExistence(timeout: 20))
        app.buttons["Actions for Second step"].tap()
        app.buttons["Move up"].tap()
        XCTAssertTrue(app.staticTexts["1 of 2 done"].waitForExistence(timeout: 20))
        attach(app, "detail")

        app.buttons["Mark completed"].tap()
        XCTAssertTrue(app.buttons["Reopen"].waitForExistence(timeout: 20))
        app.buttons["Reopen"].tap()
        XCTAssertTrue(app.buttons["Mark completed"].waitForExistence(timeout: 20))
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
