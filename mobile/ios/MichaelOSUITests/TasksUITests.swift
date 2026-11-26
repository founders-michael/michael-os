import XCTest

/// Walks the Tasks tab against a running local server: create a task with a reminder, find it by search, complete
/// and reopen it from the list, make it weekly in the editor, skip it to its next date and delete it. It needs an onboarded
/// account (`TEST_RUNNER_MICHAEL_EMAIL`, `_PASSWORD`; `_TEXT_SIZE` as elsewhere) and leaves nothing behind.
final class TasksUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testCreateFindSkipEditDelete() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let app = XCUIApplication()
        if let size = environment["MICHAEL_TEXT_SIZE"] {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        }
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let tasksTab = app.tabBars.firstMatch.buttons["Tasks"]
        XCTAssertTrue(tasksTab.waitForExistence(timeout: 30))
        tasksTab.tap()
        XCTAssertTrue(app.buttons["New task"].waitForExistence(timeout: 20))
        attach(app, "list")

        let title = "Water the plants \(Int.random(in: 1000...9999))"
        create(app, title: title)

        let search = app.searchFields.firstMatch
        if !search.exists { app.swipeDown() }
        search.tap()
        search.typeText(title)
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 20), "The new task is found by search")
        XCTAssertTrue(row.label.contains("Due today"), "The row shows its due date")
        attach(app, "found")

        toggleTwice(title, in: app)
        row.tap()
        makeWeekly(app, title: title)
        skip(app)

        let delete = app.buttons["Delete task"]
        let screenButton = delete.frame
        delete.tap()
        XCTAssertTrue(app.staticTexts["Delete this task?"].waitForExistence(timeout: 5))
        let confirm = app.buttons.matching(NSPredicate(format: "label == 'Delete task'")).allElementsBoundByIndex
            .first { $0.isHittable && $0.frame != screenButton }
        try XCTUnwrap(confirm, "The confirmation has its own Delete button").tap()
        let empty = app.staticTexts["No tasks match “\(title)”"]
        XCTAssertTrue(empty.waitForExistence(timeout: 20), "Deleting returns to the list, which no longer has it")
        attach(app, "deleted")

        app.tabBars.firstMatch.buttons["More"].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.staticTexts["Meet Michael"].waitForExistence(timeout: 20))
    }

    /// Completes from the list and reopens, so the task is left open.
    @MainActor private func toggleTwice(_ title: String, in app: XCUIApplication) {
        app.switches["Complete \(title)"].tap()
        XCTAssertTrue(app.switches["Reopen \(title)"].waitForExistence(timeout: 2), "Completing shows at once")
        attach(app, "completed")
        let reopen = app.switches["Reopen \(title)"]
        let enabled = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: reopen)
        wait(for: [enabled], timeout: 20)
        reopen.tap()
        XCTAssertTrue(app.switches["Complete \(title)"].waitForExistence(timeout: 20), "Reopened, so nothing is left done")
    }

    /// Edits the title and adds a weekly repeat; the detail shows what the server saved.
    @MainActor private func makeWeekly(_ app: XCUIApplication, title: String) {
        XCTAssertTrue(app.buttons["Edit"].waitForExistence(timeout: 20))
        app.buttons["Edit"].tap()
        let field = app.textViews["Title"].exists ? app.textViews["Title"] : app.textFields["Title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        // A tap in the middle of a multi-line field puts the cursor at the start.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.8)).tap()
        field.typeText(" and herbs")
        let repeatMenu = app.buttons["Repeat"]
        scrollTo(repeatMenu, in: app)
        repeatMenu.tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Weekly on'")).firstMatch.tap()
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["\(title) and herbs"].waitForExistence(timeout: 20), "The detail shows what the server saved")
    }

    @MainActor private func skip(_ app: XCUIApplication) {
        let skip = app.buttons["Skip to the next date"]
        XCTAssertTrue(skip.waitForExistence(timeout: 20))
        let due = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Due,'")).firstMatch
        let before = due.label
        attach(app, "detail")
        skip.tap()
        let moved = expectation(for: NSPredicate(format: "label != %@", before), evaluatedWith: due)
        wait(for: [moved], timeout: 20)
        attach(app, "skipped")
    }

    @MainActor private func create(_ app: XCUIApplication, title: String) {
        app.buttons["New task"].tap()
        let field = app.textViews["Title"].exists ? app.textViews["Title"] : app.textFields["Title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(title)
        app.buttons["Add a due date"].tap()
        let reminder = app.buttons["Add a reminder"]
        scrollTo(reminder, in: app)
        reminder.tap()
        attach(app, "editor")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["New task"].waitForExistence(timeout: 20), "The sheet closes once the server saved")
    }

    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<6 where !(element.exists && element.isHittable) {
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

/// Michael's order, a task's goals and its categories against a running local server with a model behind it. It needs
/// the account's open task `TEST_RUNNER_MICHAEL_TASK` and an active goal `_GOAL`, and leaves both as it found them.
final class TaskIntelligenceUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testOrderGoalsAndCategories() throws {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["MICHAEL_EMAIL"], "Set TEST_RUNNER_MICHAEL_EMAIL")
        let password = try XCTUnwrap(environment["MICHAEL_PASSWORD"], "Set TEST_RUNNER_MICHAEL_PASSWORD")
        let task = try XCTUnwrap(environment["MICHAEL_TASK"], "Set TEST_RUNNER_MICHAEL_TASK")
        let goal = try XCTUnwrap(environment["MICHAEL_GOAL"], "Set TEST_RUNNER_MICHAEL_GOAL")
        let app = XCUIApplication()
        app.launch()
        app.signInIfNeeded(email: email, password: password)
        let tasksTab = app.tabBars.firstMatch.buttons["Tasks"]
        XCTAssertTrue(tasksTab.waitForExistence(timeout: 30))
        tasksTab.tap()
        XCTAssertTrue(app.buttons["New task"].waitForExistence(timeout: 20))

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Sort and filter'")).firstMatch.tap()
        app.buttons["Michael's order"].tap()
        let rank = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '#1'")).firstMatch
        XCTAssertTrue(rank.waitForExistence(timeout: 20), "Michael's order shows each task's rank and why")
        attach(app, "michael-order")
        rank.tap()
        XCTAssertTrue(app.staticTexts["How Michael ranked this"].waitForExistence(timeout: 5))
        attach(app, "breakdown")
        app.buttons["Done"].tap()

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", task)).firstMatch.tap()
        linkAndUnlink(goal, in: app)
        addRemoveAndSuggest(in: app)
    }

    /// Links the goal and unlinks it again, waiting for the server each time.
    @MainActor private func linkAndUnlink(_ goal: String, in app: XCUIApplication) {
        let link = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", goal)).firstMatch
        scrollTo(link, in: app)
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        let before = link.value as? String
        link.tap()
        let changed = expectation(for: NSPredicate(format: "value != %@", before ?? ""), evaluatedWith: link)
        wait(for: [changed], timeout: 20)
        attach(app, "goal-linked")
        link.tap()
        let restored = expectation(for: NSPredicate(format: "value == %@", before ?? ""), evaluatedWith: link)
        wait(for: [restored], timeout: 20)

    }

    @MainActor private func addRemoveAndSuggest(in app: XCUIApplication) {
        let add = app.buttons["Add a category"]
        scrollTo(add, in: app)
        add.tap()
        app.buttons["Fitness and activity"].tap()
        let remove = app.buttons["Remove Fitness and activity"]
        XCTAssertTrue(remove.waitForExistence(timeout: 20), "The category shows once the server saved it")
        attach(app, "category-added")
        remove.tap()
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: remove)
        wait(for: [gone], timeout: 20)

        app.buttons["Suggest a category"].tap()
        let suggested = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Suggested'")).firstMatch
        let noFit = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Michael didn'")).firstMatch
        let answered = expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: suggested)
        let none = expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: noFit)
        XCTWaiter().wait(for: [answered, none], timeout: 120, enforceOrder: false)
        attach(app, "suggested")
        if suggested.exists {
            app.buttons["Dismiss"].tap()
            let dismissed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: suggested)
            wait(for: [dismissed], timeout: 20)
        } else {
            XCTAssertTrue(noFit.exists, "Michael either suggests a category or says none fits")
        }
    }

    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<6 where !(element.exists && element.isHittable) {
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
