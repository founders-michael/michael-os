import DesignSystem
import Models
import PhotosUI
import Repositories
import SwiftUI
import UIKit

/// The user's picture: an upload read with the session, a sign-in provider's public picture, or the initials.
struct AvatarView: View {
    let identity: AccountIdentity
    let accounts: any AccountRepository
    let size: CGFloat
    @State private var uploaded: UIImage?

    var body: some View {
        picture
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay { Circle().strokeBorder(Color.michael.border2) }
            .accessibilityHidden(true)
            .task(id: identity.avatarUrl) {
                uploaded = nil
                guard identity.avatarSource == .custom, let data = try? await accounts.picture() else { return }
                uploaded = UIImage(data: data)
            }
    }

    @ViewBuilder private var picture: some View {
        if let uploaded {
            Image(uiImage: uploaded).resizable().scaledToFill()
        } else if identity.avatarSource == .provider, let url = identity.avatarUrl.flatMap(URL.init(string:)) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                initials
            }
        } else {
            initials
        }
    }

    private var initials: some View {
        Text(identity.initials)
            .michaelText(.heading)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.michael.raise)
    }
}

/// The picture on the Account screen, with change and remove.
struct AccountPictureRow: View {
    let model: AccountEditorModel
    @State private var choice: PhotosPickerItem?
    @State private var choosing = false

    var body: some View {
        HStack(spacing: MichaelSpace.lg) {
            AvatarView(identity: model.shown.identity, accounts: model.accounts, size: MichaelSize.avatar)
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                Button {
                    choosing = true
                } label: {
                    Text(String(localized: "settings.account.changePicture", bundle: .module))
                        .michaelText(.button)
                        .foregroundStyle(Color.michael.atext)
                        .frame(minHeight: MichaelSize.checkTouch)
                }
                .buttonStyle(.plain)
                .disabled(model.saving)
                if model.shown.hasCustomImage {
                    Button(String(localized: "settings.account.removePicture", bundle: .module)) {
                        _Concurrency.Task { await model.removePicture() }
                    }
                    .michaelText(.button)
                    .foregroundStyle(Color.michael.danger)
                    .frame(minHeight: MichaelSize.checkTouch)
                    .disabled(model.saving)
                }
                Text(
                    model.pictureRefused
                        ? String(localized: "settings.account.picture.refused", bundle: .module)
                        : String(localized: "settings.account.picture.rules", bundle: .module)
                )
                .michaelText(.caption)
                .foregroundStyle(model.pictureRefused ? Color.michael.danger : Color.michael.faint)
            }
        }
        .photosPicker(isPresented: $choosing, selection: $choice, matching: .images, photoLibrary: .shared())
        .onChange(of: choice) { _, item in
            guard let item else { return }
            choice = nil
            _Concurrency.Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let jpeg = PictureEncoder.jpeg(data) else {
                    model.refusePicture()
                    return
                }
                await model.upload(jpeg)
            }
        }
    }
}

/// Library photos may be HEIC or large; the server takes PNG, JPEG or WebP up to 2 MB.
enum PictureEncoder {
    static func jpeg(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, PictureRules.longestSide / max(longest, 1))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        for quality in [0.85, 0.7, 0.5] {
            if let jpeg = resized.jpegData(compressionQuality: quality), jpeg.count <= PictureRules.maxBytes { return jpeg }
        }
        return nil
    }
}
