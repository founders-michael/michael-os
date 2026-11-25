import DesignSystem
import Models
import SwiftUI

struct HistoryActions {
    let open: (Conversation) -> Void
    let newChat: () -> Void
    let renamed: (Conversation) -> Void
    let removed: (Conversation.ID) -> Void
}

/// Saved conversations, newest first. Swipe or press and hold a row to rename, archive or delete it.
struct HistorySheet: View {
    let model: HistoryModel
    let current: Conversation.ID?
    let actions: HistoryActions
    @State private var renaming: Conversation?
    @State private var newTitle = ""
    @State private var deleting: Conversation?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(String(localized: "history.title", bundle: .module))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "history.done", bundle: .module)) { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button(
                            String(localized: "chat.newChat", bundle: .module),
                            systemImage: "square.and.pencil",
                            action: actions.newChat
                        )
                    }
                }
                .safeAreaInset(edge: .bottom) { filterBar }
                .background(MichaelBackground())
        }
        .task { await model.load() }
        .presentationDetents([.large])
        .alert(String(localized: "history.rename.title", bundle: .module), isPresented: isRenaming) {
            TextField(String(localized: "history.rename.field", bundle: .module), text: $newTitle)
            Button(String(localized: "history.rename.save", bundle: .module)) { rename() }
            Button(String(localized: "history.cancel", bundle: .module), role: .cancel) { renaming = nil }
        }
        .confirmationDialog(
            deleting.map { String(localized: "history.delete.title \($0.title)", bundle: .module) } ?? "",
            isPresented: isDeleting,
            titleVisibility: .visible
        ) {
            Button(String(localized: "history.delete.confirm", bundle: .module), role: .destructive) { delete() }
        } message: {
            Text(String(localized: "history.delete.message", bundle: .module))
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(Color.michael.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel(String(localized: "history.loading", bundle: .module))
        case .empty:
            EmptyStateView(
                title: String(localized: model.filter == .active ? "history.empty.title" : "history.emptyArchived.title", bundle: .module),
                message: String(localized: "history.empty.body", bundle: .module),
                actionTitle: String(localized: "chat.newChat", bundle: .module),
                action: actions.newChat
            )
        case .failed(let error):
            FailureStateView(
                message: error == .offline
                    ? String(localized: "history.error.offline", bundle: .module)
                    : String(localized: "history.error.load", bundle: .module)
            ) {
                _Concurrency.Task { await model.load() }
            }
        case .content(let content):
            list(content)
        }
    }

    private func list(_ content: HistoryModel.HistoryContent) -> some View {
        List {
            if let error = content.error {
                Text(error)
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.danger)
                    .listRowBackground(Color.clear)
            }
            ForEach(content.conversations) { conversation in
                row(conversation, pending: content.pending.contains(conversation.id))
            }
            if content.nextPage != nil {
                ProgressView()
                    .tint(Color.michael.accent)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                    .task { await model.loadMore() }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await model.load() }
    }

    private func row(_ conversation: Conversation, pending: Bool) -> some View {
        Button {
            actions.open(conversation)
        } label: {
            HStack(spacing: MichaelSpace.md) {
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    Text(conversation.title)
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.text)
                        .lineLimit(2)
                    Text(Self.detail(conversation))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if conversation.id == current {
                    Text(String(localized: "history.current", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.atext)
                }
            }
            .frame(minHeight: MichaelSize.button)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(pending)
        .listRowBackground(Color.clear)
        .swipeActions(edge: .trailing) { rowActions(conversation) }
        .contextMenu { rowActions(conversation) }
    }

    @ViewBuilder private func rowActions(_ conversation: Conversation) -> some View {
        Button(String(localized: "history.delete", bundle: .module), systemImage: "trash", role: .destructive) {
            deleting = conversation
        }
        Button(
            String(localized: model.filter == .active ? "history.archive" : "history.unarchive", bundle: .module),
            systemImage: model.filter == .active ? "archivebox" : "tray.and.arrow.up"
        ) {
            _Concurrency.Task { _ = await model.setArchived(conversation.id, model.filter == .active) }
        }
        Button(String(localized: "history.rename", bundle: .module), systemImage: "pencil") {
            newTitle = conversation.title
            renaming = conversation
        }
    }

    private var filterBar: some View {
        MichaelButton(
            String(localized: model.filter == .active ? "history.showArchived" : "history.showActive", bundle: .module),
            style: .ghost
        ) {
            _Concurrency.Task { await model.show(model.filter == .active ? .archived : .active) }
        }
        .padding(.horizontal, MichaelSpace.screenGutter)
        .background(.bar)
    }

    private var isRenaming: Binding<Bool> {
        Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })
    }

    private var isDeleting: Binding<Bool> {
        Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
    }

    private func rename() {
        guard let conversation = renaming else { return }
        renaming = nil
        let title = newTitle
        _Concurrency.Task {
            if let renamed = await model.rename(conversation.id, to: title) { actions.renamed(renamed) }
        }
    }

    private func delete() {
        guard let conversation = deleting else { return }
        deleting = nil
        _Concurrency.Task {
            if await model.delete(conversation.id) { actions.removed(conversation.id) }
        }
    }

    private static func detail(_ conversation: Conversation) -> String {
        let when = (conversation.lastMessageAt ?? conversation.createdAt).formatted(.relative(presentation: .named))
        let messages = String(localized: "history.messages \(conversation.messageCount)", bundle: .module)
        return String(localized: "history.detail \(when) \(messages)", bundle: .module)
    }
}
