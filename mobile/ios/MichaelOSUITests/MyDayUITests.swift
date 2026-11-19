import XCTest

/// Walks My Day and the tab shell against a running local server. It needs an onboarded account with an open task
/// and an unchecked habit today, and at least one notice:
/// `TEST_RUNNER_MICHAEL_EMAIL=… TEST_RUNNER_MICHAEL_PASSWORD=… TEST_RUNNER_MICHAEL_TASK=… TEST_RUNNER_MICHAEL_HABIT=…
/// xcodebuild test -scheme APICheck -only-testing:MichaelOSUITests/MyDayUITests …`
/// Every change it makes is undone before it finishes. `TEST_RUNNER_MICHAEL_TEXT_SIZE` runs it at a content size
/// category.
final class MyDayUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testMyDayAndTabs() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let task = try XCTUnwrap(environment["MICHAEL_TASK"], "Set TEST_RUNNER_MICHAEL_TASK")
        let habit = try XCTUnwrap(environment["MICHAEL_HABIT"], "Set TEST_RUNNER_MICHAEL_HABIT")

        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        signInIfNeeded(app, email: email, password: password)

        let complete = app.switches["Mark done: \(task)"]
        XCTAssertTrue(complete.waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Michael noticed"].exists)
        attach(app, "my-day")

        toggleTwice(app, open: "Mark done: \(task)", done: "Mark not done: \(task)", name: "task-completed")
        toggleTwice(app, open: "Check in: \(habit)", done: "Undo check-in: \(habit)", name: "habit-checked-in")
        checkPreviousDay(app, today: complete)
        checkNoticeOpensMichael(app)
        checkTabStacks(app)

        app.tabBars.firstMatch.buttons["My Day"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(complete.waitForExistence(timeout: 30), "A relaunch opens My Day signed in")
        app.tabBars.firstMatch.buttons["More"].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
    }

    /// Changes a row and changes it back, so the account is left as it was.
    @MainActor private func toggleTwice(_ app: XCUIApplication, open: String, done: String, name: String) {
        let openCheck = app.switches[open]
        scrollTo(openCheck, in: app)
        openCheck.tap()
        let doneCheck = app.switches[done]
        XCTAssertTrue(doneCheck.waitForExistence(timeout: 2), "\(open) should show at once")
        attach(app, name)
        waitUntilEnabled(doneCheck)
        doneCheck.tap()
        XCTAssertTrue(openCheck.waitForExistence(timeout: 2))
        waitUntilEnabled(openCheck)
    }

    @MainActor private func checkPreviousDay(_ app: XCUIApplication, today: XCUIElement) {
        app.swipeDown()
        app.swipeDown()
        app.buttons["Previous day"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Today"].waitForExistence(timeout: 20))
        attach(app, "previous-day")
        let pastChecks = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mark done:' AND isEnabled == true"))
        XCTAssertEqual(pastChecks.count, 0, "A past date is read-only")
        app.buttons["Today"].tap()
        XCTAssertTrue(today.waitForExistence(timeout: 20))
    }

    @MainActor private func checkNoticeOpensMichael(_ app: XCUIApplication) {
        let labels = ["Decide what to do", "Suggest a new date", "Find a time"]
        app.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Ready to ask"].waitForExistence(timeout: 5), "A notice opens Michael with its question")
        attach(app, "michael-prompt")
    }

    @MainActor private func checkTabStacks(_ app: XCUIApplication) {
        let tabs = app.tabBars.firstMatch
        tabs.buttons["More"].tap()
        app.buttons["Habits"].tap()
        XCTAssertFalse(app.buttons["Sign out"].waitForExistence(timeout: 2))
        tabs.buttons["My Day"].tap()
        tabs.buttons["More"].tap()
        XCTAssertFalse(app.buttons["Sign out"].exists, "Switching tabs keeps each tab's stack")
        tabs.buttons["More"].tap()
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 5), "Tapping the selected tab returns to its root")
        attach(app, "more")
    }

    @MainActor private func signInIfNeeded(_ app: XCUIApplication, email: String, password: String) {
        let start = app.buttons["Sign in with email"]
        guard start.waitForExistence(timeout: 10) else { return }
        start.tap()
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["Sign in"].tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for notNow in [app.buttons["Not Now"], springboard.buttons["Not Now"]] where notNow.waitForExistence(timeout: 3) {
            notNow.tap()
            break
        }
    }

    @MainActor private func waitUntilEnabled(_ element: XCUIElement) {
        let enabled = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: element)
        wait(for: [enabled], timeout: 20)
    }

    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 where !(element.exists && element.isHittable) {
            app.swipeUp()
        }
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
