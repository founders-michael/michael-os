/// Screens after Welcome. The app owns the navigation stack and maps each route to its screen.
public enum AuthRoute: Hashable, Sendable {
    case signIn
    case register
    case checkEmail(email: String)
}
