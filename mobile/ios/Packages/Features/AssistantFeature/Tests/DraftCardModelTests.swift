import Foundation
import Models
import TestSupport
import Testing

@testable import AssistantFeature

/// Saving, refusing and discarding drafts. Nothing says saved before the create call returns.
@MainActor
struct DraftCardModelTests {
    private let chat = ChatHarness()

    @Test func aSavedDraftSaysSavedOnlyAfterTheCreateCallAndIsReported() async {
        chat.assistant.script(
            .event(
                ChatHarness.draftReply(
                    RecordDraft(kind: .task, values: ["title": .text("Call the bank"), "priority": .text("HIGH")], timeZone: "UTC"))))
        let model = chat.model()
        await chat.sent(model, "Add a task")
        let id = chat.drafts(model).first?.id ?? ""
        #expect(model.presence != .awaitingApproval)
        model.finishReveal(model.content?.revealing ?? "")
        #expect(model.presence == .awaitingApproval)
        let gate = ChatHarness.gate()
        chat.tasks.hold(until: gate.wait)
        model.save(id)
        #expect(chat.drafts(model).first?.status == .saving)
        model.save(id)
        gate.release()
        await chat.until { chat.drafts(model).first?.status == .saved }
        #expect(
            chat.tasks.creates == [
                TaskCreate(title: "Call the bank", description: nil, priority: .high, dueDate: nil, estimatedDurationMinutes: nil)
            ])
        await chat.until { chat.assistant.calls.contains(.outcome(DraftOutcome(kind: .saved, subject: .task))) }
        #expect(chat.assistant.calls.contains(.outcome(DraftOutcome(kind: .saved, subject: .task))))
        #expect(model.presence == .idle)
        #expect(AssistantModel.destination(of: .task) == .tasks)
    }

    @Test func aRefusedSaveShowsTheServersReasonsOnTheFields() async {
        let event = RecordDraft(
            kind: .calendarEvent,
            values: ["title": .text("Call"), "date": .text("2026-11-25"), "startTime": .text("15:00"), "endTime": .text("15:30")],
            timeZone: "Pacific/Auckland"
        )
        chat.assistant.script(.event(ChatHarness.draftReply(event)))
        let model = chat.model()
        await chat.sent(model, "Add an event")
        let id = chat.drafts(model).first?.id ?? ""
        chat.records.fail(
            with: .validation(ServerMessage(text: "Check the event details."), fields: ["endAt": ["End time must be after start time."]]))
        model.save(id)
        await chat.until { chat.drafts(model).first?.status == .editing && chat.drafts(model).first?.error != nil }
        #expect(chat.drafts(model).first?.error == "Check the event details.")
        #expect(chat.drafts(model).first?.fieldErrors == ["endTime": "End time must be after start time."])
        model.edit(id, field: "endTime", to: .text("16:00"))
        #expect(chat.drafts(model).first?.fieldErrors.isEmpty == true)
        chat.records.fail(with: .conflict(ServerMessage(text: "This time overlaps another calendar event.")))
        model.save(id)
        await chat.until { chat.drafts(model).first?.error == "This time overlaps another calendar event." }
        #expect(chat.drafts(model).first?.status == .editing)
        guard case .event(let body) = chat.records.calls.last else {
            Issue.record("The edited event was posted")
            return
        }
        #expect(body.endAt.timeIntervalSince(body.startAt) == 3600)
    }

    @Test func eachKindSavesThroughItsOwnRepository() async {
        chat.assistant.script(
            .event(
                ChatHarness.draftReply(
                    RecordDraft(kind: .goal, values: ["title": .text("Run a 10k")], timeZone: "UTC"),
                    RecordDraft(kind: .habit, values: ["title": .text("Stretch")], timeZone: "UTC"),
                    RecordDraft(kind: .memory, values: ["content": .text("Mornings are for deep work.")], timeZone: "UTC")
                )
            )
        )
        let model = chat.model()
        await chat.sent(model, "Draft three")
        for card in chat.drafts(model) { model.save(card.id) }
        await chat.until { chat.drafts(model).allSatisfy { $0.status == .saved } }
        #expect(chat.records.calls.count == 2)
        #expect(
            chat.habits.calls == [
                .create(HabitCreate(title: "Stretch", description: nil, frequency: .daily, weekdays: [], startTime: nil, endTime: nil))
            ])
    }

    @Test func discardRemovesTheDraftAndIsReported() async {
        chat.assistant.script(
            .event(ChatHarness.draftReply(RecordDraft(kind: .habit, values: ["title": .text("Stretch")], timeZone: "UTC"))))
        let model = chat.model()
        await chat.sent(model, "Add a habit")
        let id = chat.drafts(model).first?.id ?? ""
        model.discard(id)
        #expect(chat.drafts(model).first?.status == .discarded)
        model.save(id)
        await chat.until { chat.assistant.calls.contains(.outcome(DraftOutcome(kind: .discarded, subject: .habit))) }
        #expect(chat.habits.calls.isEmpty)
    }

    @Test func anIncompleteDraftSaysWhatIsMissingAndPostsNothing() async {
        chat.assistant.script(
            .event(ChatHarness.draftReply(RecordDraft(kind: .calendarEvent, values: ["title": .text("Call")], timeZone: "UTC"))))
        let model = chat.model()
        await chat.sent(model, "Add an event")
        let id = chat.drafts(model).first?.id ?? ""
        model.save(id)
        #expect(chat.drafts(model).first?.error == "Fill in the required details before saving.")
        #expect(chat.records.calls.isEmpty)
    }

    @Test func aRepliesPlanTravelsWithTheReply() async {
        let proposal = PlanningProposal(
            timeZone: "Asia/Kolkata", proposedActivities: [], taskDetails: [], approvalToken: "token", approvalExpiresAt: .now)
        chat.assistant.script(
            .event(.message(ChatReply(content: "A plan.", toolActivity: [], usedSavedData: true, planningProposal: proposal))))
        let model = chat.model()
        await chat.sent(model, "Plan my week")
        guard case .michael(let reply) = model.content?.entries.last?.body else {
            Issue.record("A reply arrived")
            return
        }
        #expect(reply.planningProposal == proposal)
    }
}
