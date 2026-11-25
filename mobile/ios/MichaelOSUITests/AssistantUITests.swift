import XCTest

/// Talks to Michael against a running local server with a model behind it (Ollama locally). It needs an onboarded
/// account (`TEST_RUNNER_MICHAEL_EMAIL`, `_PASSWORD`; `_TEXT_SIZE` runs it at a content size category). Replies come
/// from a model, so it checks what any reply must have, not its words. It leaves one task, "Call the bank", saved
/// from a draft, and deletes the conversation it started.
final class AssistantUITests: XCTestCase {
    private static let replyTimeout: TimeInterval = 240

    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testChatDraftAndHistory() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        signInIfNeeded(app, email: email, password: password)
        let michael = app.tabBars.firstMatch.buttons["Michael"]
        XCTAssertTrue(michael.waitForExistence(timeout: 30))
        michael.tap()
        startNewChatIfNeeded(app)
        attach(app, "opened")
        XCTAssertTrue(app.staticTexts["What would you like help with?"].waitForExistence(timeout: 10))
        attach(app, "empty")

        app.buttons["What should I focus on today?"].tap()
        let sent = app.staticTexts["You said: What should I focus on today?"]
        XCTAssertTrue(sent.waitForExistence(timeout: 5), "The message shows at once")
        attach(app, "working")
        waitForReply(app)
        attach(app, "reply")

        // A small local model sometimes writes the tool call as text instead of making it, so ask twice at most.
        let save = app.buttons["Save task"]
        for _ in 0..<2 where !save.exists {
            send(app, "Draft a task to call the bank tomorrow at high priority.")
            waitForReply(app)
            _ = save.waitForExistence(timeout: 5)
        }
        XCTAssertTrue(save.exists, "Michael drafts the task")
        XCTAssertTrue(app.staticTexts["Not saved"].exists)
        scrollTo(save, in: app)
        attach(app, "draft")
        save.tap()
        XCTAssertTrue(app.staticTexts["Saved."].waitForExistence(timeout: 20), "Saved only once the create call returns")
        attach(app, "draft-saved")

        let title = relaunchKeepsTheConversation(app)
        renameAndDelete(app, title: title)
        app.tabBars.firstMatch.buttons["More"].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
    }

    /// Returns the conversation's title, which the server set from its first message.
    @MainActor private func relaunchKeepsTheConversation(_ app: XCUIApplication) -> String {
        let title = app.staticTexts.matching(identifier: "chat.title").firstMatch.label
        // Scene state is saved when the app goes to the background, which a bare terminate skips.
        XCUIDevice.shared.press(.home)
        sleep(2)
        app.terminate()
        app.launch()
        app.tabBars.firstMatch.buttons["Michael"].tap()
        let header = app.staticTexts.matching(identifier: "chat.title").firstMatch
        let reopened = expectation(for: NSPredicate(format: "label == %@", title), evaluatedWith: header)
        wait(for: [reopened], timeout: 30)
        XCTAssertNotEqual(title, "New conversation", "The server named the conversation after its first message")
        attach(app, "reopened")
        XCTAssertFalse(app.buttons["Save task"].exists, "Drafts are not stored with the conversation")

        return title
    }

    @MainActor private func send(_ app: XCUIApplication, _ text: String) {
        let composer = app.descendants(matching: .any)["Message Michael"]
        composer.tap()
        composer.typeText(text)
        app.buttons["Send"].tap()
    }

    /// The note under the progress shows only while a reply is in flight.
    @MainActor private func waitForReply(_ app: XCUIApplication) {
        let working = app.staticTexts["The reply appears once it's complete and checked, so you never see a claim that gets taken back."]
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: working)
        wait(for: [gone], timeout: Self.replyTimeout)
        XCTAssertFalse(app.buttons["Try again"].exists, "The reply arrived without a failure")
        let revealing = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.staticTexts["Responding"])
        wait(for: [revealing], timeout: 10)
    }

    @MainActor private func renameAndDelete(_ app: XCUIApplication, title: String) {
        app.buttons["Conversation history"].tap()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 20))
        attach(app, "history")
        row.press(forDuration: 1)
        app.buttons["Rename"].tap()
        let field = app.alerts.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.clearAndType("Renamed on the phone")
        app.alerts.buttons["Save"].tap()
        let renamed = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Renamed on the phone'")).firstMatch
        XCTAssertTrue(renamed.waitForExistence(timeout: 20))
        renamed.press(forDuration: 1)
        app.buttons["Delete"].tap()
        app.buttons["Delete chat"].tap()
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: renamed)
        wait(for: [gone], timeout: 20)
        app.buttons["Done"].tap()
        let empty = app.staticTexts["What would you like help with?"].waitForExistence(timeout: 10)
        XCTAssertTrue(empty, "Deleting the open chat starts a new one")
    }

    @MainActor private func startNewChatIfNeeded(_ app: XCUIApplication) {
        let newChat = app.buttons["New chat"]
        if newChat.waitForExistence(timeout: 5), newChat.isEnabled, !app.staticTexts["What would you like help with?"].exists {
            newChat.tap()
        }
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

extension XCUIElement {
    @MainActor fileprivate func clearAndType(_ text: String) {
        tap()
        let existing = value as? String ?? ""
        typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
        typeText(text)
    }
}
