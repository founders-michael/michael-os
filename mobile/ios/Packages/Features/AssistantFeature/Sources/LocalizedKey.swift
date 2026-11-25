import Foundation

/// A string catalogue entry whose key is built at run time, such as a tool's name. Interpolating into a
/// `LocalizationValue` would make the name a placeholder instead of part of the key.
func localizedKey(_ key: String) -> String {
    Bundle.module.localizedString(forKey: key, value: nil, table: nil)
}
