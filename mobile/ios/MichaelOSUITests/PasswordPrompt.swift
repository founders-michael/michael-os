import XCTest

extension XCUIApplication {
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
