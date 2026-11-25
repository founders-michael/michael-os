import XCTest

extension XCUIApplication {
    /// Signs in with email when the app opens signed out; does nothing when a session is already stored.
    @MainActor func signInIfNeeded(email: String, password: String) {
        let start = buttons["Sign in with email"]
        guard start.waitForExistence(timeout: 10) else { return }
        start.tap()
        let emailField = textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)
        buttons["Sign in"].tap()
        dismissPasswordPrompt()
    }

    /// iOS offers to save the password after a sign-in attempt and the sheet covers the app. It is drawn by another
    /// process, can arrive a few seconds after the tap, and at the largest text sizes "Not Now" starts below the screen.
    @MainActor func dismissPasswordPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for notNow in [buttons["Not Now"], springboard.buttons["Not Now"]] where notNow.waitForExistence(timeout: 8) {
            for _ in 0..<3 where !notNow.isHittable {
                sheets.firstMatch.swipeUp()
            }
            notNow.tap()
            return
        }
    }
}
