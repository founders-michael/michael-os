import XCTest

/// The data-use notice against a local server configured for Gemini's unpaid tier (`AI_PROVIDER=gemini`,
/// `GEMINI_DATA_TIER=unpaid`, a dummy `GEMINI_API_KEY`), so the chat answers 400 `DATA_USE_ACKNOWLEDGEMENT_REQUIRED`.
/// It needs an onboarded account (`TEST_RUNNER_MICHAEL_EMAIL`, `_PASSWORD`). What happens after the user accepts is
/// whatever the server then answers; with a dummy key that is a failure, so the test checks only that the message was
/// resent.
final class DataUseNoticeUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testNoticeDeclineAndAccept() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let michael = app.tabBars.firstMatch.buttons["Michael"]
        XCTAssertTrue(michael.waitForExistence(timeout: 30))
        michael.tap()
        let newChat = app.buttons["New chat"]
        if newChat.waitForExistence(timeout: 5), newChat.isEnabled { newChat.tap() }

        let question = "What should I focus on today?"
        app.buttons[question].tap()
        let notice = app.staticTexts["Before you send this"]
        XCTAssertTrue(notice.waitForExistence(timeout: 20), "The server asked for the acknowledgement")
        XCTAssertTrue(app.buttons["I understand, send"].exists)
        attach(app, "notice")

        app.buttons["Not now"].tap()
        XCTAssertFalse(notice.exists)
        let composer = app.descendants(matching: .any)["Message Michael"]
        XCTAssertEqual(composer.value as? String, question, "Declining puts the message back unsent")
        attach(app, "declined")

        app.buttons["Send"].tap()
        XCTAssertTrue(notice.waitForExistence(timeout: 20), "Declining does not remember an answer")
        app.buttons["I understand, send"].tap()
        let resent = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: notice)
        wait(for: [resent], timeout: 20)
        let settled = expectation(for: NSPredicate(format: "placeholderValue != 'Michael is working'"), evaluatedWith: composer)
        wait(for: [settled], timeout: 60)
        attach(app, "accepted")

        app.tabBars.firstMatch.buttons["More"].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
