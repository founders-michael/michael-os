# MichaelOS --- Product Vision, System Blueprint & Engineering Context

**Document purpose:** Give Claude Code a clear, durable understanding of
what MichaelOS is, what it is intended to become, how its products fit
together, what has already been built, and the architectural principles
that must be preserved.

**Document status:** Product vision and engineering context. This is not
a claim that every described capability is already implemented. The
implementation inventory below reflects the project context available
when this document was prepared and must be verified against the current
repository.

------------------------------------------------------------------------

# 1. Executive Summary

MichaelOS is an **AI-powered Personal and Organizational Operating
System**.

It is intended to help individuals and organizations understand their
responsibilities, make better decisions, plan realistically, execute
work, and continuously learn from outcomes.

MichaelOS is not simply: - a to-do list; - a calendar; - a project
management tool; - a habit tracker; - an AI chatbot; or - a dashboard
that aggregates metrics.

It is a connected system that brings personal productivity,
organizational execution, scheduling, capacity, historical activity, and
AI assistance into one coherent operating model.

Its central philosophy is:

> **UNDERSTAND → DECIDE → PLAN → EXECUTE → LEARN**

The system should connect intention to execution and execution to
learning. It should help answer: - What matters right now? - What should
I or my team focus on? - What can realistically be done with the time
and capacity available? - What did we actually complete? - What changed,
slipped, or blocked progress? - What should happen next? - What can we
learn from previous outcomes?

MichaelOS has three major product capabilities:

1.  **LifestyleOS** --- the personal operating system for an
    individual's life and productivity.
2.  **WorkOS** --- the organizational operating system for companies,
    teams, projects, capacity, and execution.
3.  **Michael AI** --- the intelligence and assistant layer that
    understands authorized context and helps users make decisions and
    plan work.

LifestyleOS and WorkOS are separate product experiences with separate
access entitlements and data boundaries. Michael AI is a shared
intelligence capability whose behavior and available tools depend on the
active product context and the user's authorization.

# 2. Product Vision

The long-term goal is to create one system where a person can manage
personal responsibilities and, where authorized, participate in
organizational work without fragmented experiences.

For an individual, MichaelOS should help translate goals into daily
actions, organize time, build habits, complete tasks, review progress,
and improve future plans.

For an organization, MichaelOS should help translate organizational
objectives into projects, team responsibilities, realistic capacity
plans, schedules, execution, and measurable outcomes.

For both, Michael AI should provide contextual intelligence without
becoming an uncontrolled agent that can bypass application rules or
mutate data without authorization.

The product should feel like an operating system for getting meaningful
work done---not a collection of unrelated modules.

## Product principles

1.  **One coherent operating model:** Goals, tasks, schedules,
    execution, and review should connect.
2.  **Realistic planning:** Plans must respect availability, capacity,
    dependencies, and existing commitments.
3.  **Execution over vanity metrics:** Measure meaningful outcomes, not
    just activity or task counts.
4.  **Historical truth:** Preserve what was planned, what happened, and
    when it happened.
5.  **User control:** AI recommendations are suggestions unless the user
    explicitly confirms an action.
6.  **Privacy by design:** Personal data is private; organization data
    is tenant-scoped and permission-controlled.
7.  **Clear authorization:** Product access, organization membership,
    and role permissions are different concepts.
8.  **Reliable foundations:** Data integrity, predictable domain
    services, and tested business rules matter more than adding features
    quickly.
9.  **Progressive intelligence:** Start with reliable deterministic
    behavior; use AI to explain, recommend, and assist.
10. **Consistent experience:** Shared design language and reusable
    components across products without forcing unrelated workflows into
    one interface.

# 3. Product Structure

## 3.1 LifestyleOS --- Personal Operating System

LifestyleOS is the private workspace for an individual.

Its purpose is to help a person manage their life, priorities, time,
goals, routines, and progress.

### Core areas

#### A. Personal Dashboard

The dashboard should provide a useful overview of the user's current day
and priorities.

Potential information: - Today's priorities. - Tasks due today. -
In-progress and overdue tasks. - Upcoming calendar commitments. - Goal
and habit progress. - Available time or planning capacity where
supported. - Recent activity. - Daily progress and relevant insights. -
Entry points into Timeline and Daily Review.

The dashboard should prioritize actionable information rather than
overwhelm users with charts.

#### B. Tasks

Tasks are the basic units of execution.

A task should support relevant properties such as: - Title and
description. - Status and priority. - Due date. - Planned schedule, if
scheduled. - Actual execution information, when tracked. - Category,
project, or goal relationship where applicable. - Notes and other
supported details. - Creation and update history. - Completion and
reopening history.

Task status and task scheduling are related but distinct. Completing a
task must not erase the original plan or historical information.

Users should be able to create, edit, complete, reopen, reschedule, and
review tasks according to existing business rules.

#### C. Goals

Goals represent outcomes the user wants to achieve over a longer period.

The intended relationship is:

**Goal → milestones or measurable progress → tasks and routines →
execution → review**

Goals should help users understand progress and connect daily actions to
longer-term outcomes.

Potential capabilities: - Goal creation and editing. - Target dates. -
Progress measurement. - Milestones. - Related tasks. - Historical
progress. - Goal review and insights.

Do not assume all of these are implemented; verify the repository.

#### D. Habits

Habits represent recurring behaviors rather than one-off tasks.

The intended experience includes: - Habit creation. - Frequency and
schedule. - Completion tracking. - Streaks where appropriate. -
Consistency history. - Progress insights. - Relationship to goals.

Habit completion should be modeled distinctly from task completion where
domain semantics differ.

#### E. Calendar and Scheduling

The calendar provides a time-based view of commitments and planned work.

It should connect with tasks and availability while preserving the
distinction between: - a task's due date; - its planned time interval; -
its actual execution interval; and - calendar events or other
commitments.

The calendar should support appropriate daily and weekly views, date
navigation, and existing scheduling interactions.

Timezone correctness is essential. A user's local date must be
calculated using the user's configured timezone and correct day
boundaries.

#### F. Timeline

Timeline is the chronological view of a user's planned and actual
activity.

It should show the relationship between what was planned and what
happened.

Important behavior: - Completed tasks remain visible on their relevant
historical date. - Pending and in-progress tasks remain visible. -
Completed tasks show completion information. - Original planned
intervals are preserved. - Unscheduled completed activity can be
displayed separately without inventing times. - Reopened tasks retain
their previous completion history. - Multiple completion cycles must be
represented accurately. - Date navigation should preserve historical
accuracy. - Progress counts should count distinct tasks, not
status-history rows.

Timeline should be a reliable record of daily execution, not merely a
list of currently active tasks.

#### G. Daily Review and Reflection --- Product Direction / Planned Enhancement

Daily Review is a proposed next experience that closes the productivity
loop. It must not be described as implemented unless the current
repository confirms it.

Its purpose is to help a user review a selected day and prepare for the
next one.

It should answer:

1.  What did I plan to do?
2.  What did I actually complete?
3.  What remains unfinished?
4.  Where did my time go, based only on available evidence?
5.  What went well?
6.  What was challenging?
7.  What should I prioritize tomorrow?

Potential sections:

**Daily overview** - Total distinct tasks associated with the day. -
Completed, pending, in-progress, overdue, and cancelled counts. -
Completion percentage with a clearly documented denominator.

**What I planned** - Original planned tasks and intervals. - Priority,
category, project, and relevant task details.

**What I completed** - Completed tasks. - Completion timestamps. -
Original planned interval. - Actual execution information only when
genuinely recorded. - Completion/reopening history.

**What I missed** - Incomplete planned tasks. - Clear distinction
between pending, in-progress, overdue, and cancelled. - Cancelled work
must not automatically be classified as a missed commitment.

**Where my time went** - Planned time. - Calendar commitments. - Actual
tracked time, if available. - Untracked time. - Never infer actual
working duration from a completion timestamp or scheduled interval.

**Reflection** - What went well? - What was challenging? - What blocked
progress? - What did I learn? - What would I change tomorrow?

Reflections must be private, editable, and persisted against the correct
user and local date.

**Tomorrow's priorities** - Allow the user to carry forward an
unfinished task. - Allow rescheduling to another date or leaving it
unscheduled. - Preserve original schedule and task history. - Respect
availability and capacity rules. - Never automatically move tasks
without user confirmation. - Avoid creating duplicate tasks.

**Weekly review** - Planned versus completed work. - Incomplete and
rescheduled work. - Trends and consistency. - Actual time only where
tracked. - Goal and habit progress where relevant. - Explanations of
metric definitions.

#### H. Personal Insights

Over time, LifestyleOS should help users understand patterns: - Which
priorities are consistently completed? - Which tasks are repeatedly
postponed? - Which goals are progressing? - Which habits are
consistent? - Are plans realistic relative to actual execution? - What
should be adjusted?

Insights must be evidence-based and avoid equating busyness or task
volume with productivity.

# 4. WorkOS --- Organizational Operating System

WorkOS is the organizational workspace for companies and teams.

Its purpose is to connect organizational structure, people, projects,
responsibilities, capacity, schedules, and execution.

WorkOS must remain organization-scoped and tenant-isolated.

## 4.1 Organizations and onboarding

An organization is the tenant boundary for organizational data.

The system should support: - Organization creation. - Organization
ownership. - Organization settings and working defaults. - Owner/admin
management. - Member invitations. - Membership lifecycle. - Secure
invitation acceptance. - Organization-level policies.

Organization creation and membership rules must remain consistent with
the existing implementation.

## 4.2 Roles and permissions

Existing organization roles include: - Owner. - Admin. - Manager. -
Member.

Roles define what a person can do within an organization and their
permitted scope.

Do not replace or conflate these roles with product entitlements.

A product entitlement determines whether a user can enter a product.
Organization membership and roles determine what the user can do inside
a particular organization.

## 4.3 Teams

Teams represent organizational groups.

Expected capabilities include: - Team creation and management. - Team
membership. - Team-level scope and access. - Team-level capacity and
availability policies where authorized. - Team-related projects and
work.

All operations must remain tenant-scoped and permission-checked.

## 4.4 Projects

Projects represent organized bodies of work.

Expected capabilities: - Project creation and management. - Project
ownership. - Team and member relationships. - Tasks and milestones where
supported. - Scheduling and resource requirements. - Project progress
and status. - Project-level visibility and authorization.

Do not assume every planned capability exists; inspect the
implementation.

## 4.5 Capacity and Resource Planning

Capacity planning is a foundational WorkOS capability.

The system should help organizations understand how much work can
realistically be assigned based on working policies, availability, and
existing commitments.

The established hybrid ownership model is:

-   **Organization level:** Owners/admins control organizational working
    defaults.
-   **Team level:** Managers can modify team policies and member
    availability only within their assigned scope and granted
    permissions.
-   **Individual level:** Members can configure personal availability
    and capacity within organization/team policy limits.

Authorization must be enforced server-side.

Capacity is not simply a static number of hours. It must account for
applicable working rules, availability, allocations, and scheduling
constraints.

Do not change established capacity inheritance or ownership semantics
without a deliberate architecture decision and regression coverage.

## 4.6 Scheduling and resource allocation

Scheduling should produce realistic plans using: - Availability. -
Capacity. - Existing commitments. - Task or session requirements. -
Applicable organization/team/member policies. - Timezone correctness. -
Existing scheduling lifecycle rules.

The Python planner and Next.js domain logic must remain consistent.

The system must preserve the difference between planned and actual
execution.

Do not fabricate actual work from scheduled time.

## 4.7 Organizational Timeline and execution

WorkOS should provide visibility into organizational work, schedules,
and execution.

Potential views include: - Team timelines. - Project timelines. - Member
schedules. - Resource allocations. - Progress and completion. - Changes
and historical activity.

All data must respect organization, team, project, and member
permissions.

# 5. Michael AI --- Intelligence Layer

Michael AI is the assistant and intelligence layer across MichaelOS.

It is not a separate database authority and must not bypass the
application's domain services.

Its purpose is to help users understand information, make decisions,
create plans, and take controlled actions.

## 5.1 Core responsibilities

**Understand** - Understand the user's request. - Identify the active
product context. - Retrieve only authorized information. - Understand
tasks, goals, habits, schedules, teams, projects, and capacity as
permitted.

**Decide** - Compare options. - Identify conflicts and constraints. -
Explain trade-offs. - Recommend priorities. - Highlight risks and
missing information.

**Plan** - Suggest daily and weekly plans. - Propose schedule drafts. -
Consider availability and capacity. - Suggest task ordering and
carry-forward options. - Explain why a plan is recommended.

**Execute** - Invoke approved tools through the application backend. -
Validate arguments. - Respect authorization. - Request user confirmation
for consequential changes. - Use existing domain services for mutations.

**Learn** - Summarize historical outcomes. - Compare plans with
execution. - Identify recurring patterns. - Provide evidence-based
suggestions.

## 5.2 AI architecture guardrails

The established architecture uses a provider-neutral interface with
Gemini behind it.

The Next.js backend: - Determines product context. - Authenticates the
user. - Authorizes access to data. - Validates tool arguments. - Invokes
domain services. - Returns controlled results.

The AI provider must not receive direct database access.

The tool registry and domain services are the controlled boundary
between AI and application functionality.

Michael AI must: - Never bypass product entitlements. - Never bypass
organization membership or role checks. - Never bypass tenant
isolation. - Never access another user's personal records. - Never
invent task completion, time tracking, or productivity metrics. - Never
silently mutate schedules or tasks. - Respect user confirmation
requirements. - Keep LifestyleOS and WorkOS context isolated.

# 6. Product Access, Authentication, and Authorization

MichaelOS has two product-level entitlements:

-   `LIFESTYLE_OS_ACCESS`
-   `WORK_OS_ACCESS`

These are separate from organization roles.

## 6.1 Product entitlements

Product entitlements determine which product experiences a user can
access.

Expected behavior: - New identities receive LifestyleOS access by
default. - New registrations do not automatically receive WorkOS
access. - `/products` displays only products for which the signed-in
user has access. - A user without WorkOS access must not see the WorkOS
product card. - WorkOS pages and APIs must check product access before
existing organization authorization checks. - LifestyleOS pages and
personal API helpers must enforce LifestyleOS access.

Anonymous product-selection behavior may remain available according to
the existing authentication flow. Verify the actual implementation.

## 6.2 Three independent authorization layers

**Layer 1 --- Authentication** Who is the user?

**Layer 2 --- Product entitlement** Can the user access LifestyleOS or
WorkOS?

**Layer 3 --- Domain authorization** What can the user do within their
personal workspace or an organization, based on membership, roles,
scope, and ownership?

These layers must remain separate.

A WorkOS entitlement does not automatically grant organization
membership.

Organization membership does not automatically grant access to unrelated
tenants.

An organization role does not replace product entitlement.

## 6.3 Invitation lifecycle

A valid organization invitation may grant WorkOS access as part of the
authorized acceptance flow, coordinated with membership activation.

Existing invitation protections must remain intact: - Email identity
verification. - Expiry. - Inviter authorization. - Token validation. -
Replay protection. - Correct membership activation.

Pending invitations must not grant WorkOS access prematurely.

Product permission grants and revocations must follow the existing
authorized administrative process.

# 7. Shared Engineering and Domain Principles

## 7.1 Planned versus actual

This distinction is fundamental.

Planned data represents intention: - Planned start. - Planned end. -
Planned duration. - Original scheduled date.

Actual data represents observed execution: - Actual start. - Actual
end. - Actual tracked duration. - Completion timestamp.

Never overwrite planned values simply because actual execution differs.

If actual duration is not tracked, display it as unavailable. Do not
derive it from scheduled duration or completion time.

## 7.2 Historical integrity

Historical records should preserve meaningful state transitions.

Examples: - Task completed. - Task reopened. - Task completed again. -
Task rescheduled. - Session cancelled.

Current state alone is insufficient to reconstruct every historical
event.

Use the existing history models and event records where available.

Do not delete historical records simply because an entity's current
state changes.

## 7.3 Timezone correctness

All date-based features must respect the user's configured timezone.

Examples: - Today's tasks. - Daily timeline. - Daily review. -
Completion history. - Calendar boundaries. - Weekly summaries.

Avoid assuming that a server's timezone is the user's timezone.

## 7.4 Tenant and personal data isolation

LifestyleOS personal data belongs to its user.

WorkOS data belongs to an organization and must be scoped to authorized
membership and permissions.

Never expose personal reflections or personal productivity records to
organization members by default.

# 8. Technical Architecture Context

The current project context includes:

-   Next.js and React application.
-   TypeScript.
-   Better Auth.
-   Prisma ORM.
-   PostgreSQL hosted on Neon.
-   Redis-based caching/infrastructure.
-   Python scheduling planner.
-   Provider-neutral AI architecture with Gemini.
-   Existing UI system and component conventions.

These are known architectural elements, not permission to assume every
configuration is current. Claude must inspect package versions,
repository files, services, and deployment configuration.

## Architecture principles

-   Keep domain logic in reusable server-side services.
-   Keep authorization close to protected data and operations.
-   Avoid duplicating business logic across API handlers and UI
    components.
-   Use transactions for related data changes.
-   Validate all external inputs.
-   Enforce tenant and user ownership in database queries.
-   Keep AI behind a controlled tool and service boundary.
-   Preserve compatibility with existing migrations and data.
-   Test business rules, not merely UI rendering.

# 9. Product Experience and Design Philosophy

MichaelOS should have a premium, consistent, modern SaaS experience.

Design principles: - Clear information hierarchy. - Minimal visual
clutter. - High-quality typography. - Consistent spacing and component
behavior. - Responsive layouts. - Accessible interactions. - Meaningful
empty and loading states. - Subtle motion rather than excessive
animation. - Useful information density. - Fast and predictable
interactions.

The established UI direction is: - Use the current UI foundation and
existing components for most screens. - Use Aceternity/Vengeance-style
interactions selectively and minimally. - Do not turn the application
into a collection of unrelated UI libraries. - Avoid unnecessary
redesigns when existing components can support the requirement.

Visual polish must not come at the cost of usability, accessibility, or
performance.

# 10. End-to-End User Journeys

## 10.1 Individual user

1.  Registers or signs in.
2.  Receives LifestyleOS access.
3.  Opens the personal workspace.
4.  Creates goals, habits, and tasks.
5.  Organizes tasks in the calendar and timeline.
6.  Plans realistic daily work.
7.  Executes tasks.
8.  Sees completed tasks remain in historical timelines.
9.  Reviews the day.
10. Uses Michael AI for insights and future planning.

## 10.2 Organization user

1.  Receives authorized WorkOS access.
2.  Creates or joins an organization through the established flow.
3.  Receives the appropriate organization role.
4.  Works within teams and projects.
5.  Uses organizational capacity and scheduling.
6.  Executes assigned work.
7.  Tracks progress and outcomes.
8.  Uses Michael AI within authorized WorkOS context.

## 10.3 User with both products

A user may have both LifestyleOS and WorkOS access.

The experiences remain distinct: - Personal tasks and reflections remain
personal. - Organization tasks and project data remain
organization-scoped. - Michael AI uses the active product context and
the relevant authorization rules.

# 11. Product Roadmap Direction

The following is strategic direction, not a claim that all features are
implemented.

## Foundation

-   Authentication.
-   Product selection.
-   Product entitlements.
-   Organization lifecycle.
-   Membership and roles.
-   Teams and projects.
-   Tenant isolation.

## Productivity execution

-   Tasks.
-   Goals.
-   Habits.
-   Calendar.
-   Timeline.
-   Capacity and resource planning.
-   Scheduling.

## Productivity intelligence

-   Complete historical task activity.
-   Planned versus actual analysis.
-   Daily Review and reflection.
-   Tomorrow's priorities.
-   Carry-forward workflows.
-   Weekly reviews.
-   Productivity trends.

## AI intelligence

-   Contextual daily summaries.
-   Schedule recommendations.
-   Priority recommendations.
-   Recurring blocker detection.
-   Historical pattern analysis.
-   Controlled execution through authorized domain tools.

## Scale and reliability

-   Performance optimization.
-   Observability.
-   Background processing.
-   Reliable caching.
-   Database scaling.
-   Automated regression coverage.
-   Backup and recovery.
-   Production security and operational readiness.

# 12. What MichaelOS Must Never Become

Avoid these architectural and product traps:

1.  A generic task manager with an AI chatbot attached.
2.  A collection of disconnected modules.
3.  A system that measures productivity only by task counts.
4.  An AI agent with unrestricted database access.
5.  An application where hiding a UI element is mistaken for
    authorization.
6.  A multi-tenant system with weak organization boundaries.
7.  A scheduler that ignores capacity and availability.
8.  A timeline that loses completed or historical information.
9.  A system that fabricates actual working time from planned schedules.
10. A product that introduces new libraries and abstractions for every
    screen.
11. A system that automatically changes user plans without consent.
12. A codebase where new features repeatedly break established
    functionality.

# 13. Instructions to Claude Code

Use this document as product context, not as a substitute for repository
inspection.

Before auditing or implementing anything:

1.  Inspect the current repository and Git working tree.
2.  Verify the actual implementation of each capability.
3.  Identify what is complete, partial, missing, and unverified.
4.  Read the relevant installed skills and apply them where appropriate.
5.  Inspect the actual database schema, migrations, and generated Prisma
    Client.
6.  Understand existing domain services and authorization boundaries.
7.  Identify regression risks before proposing changes.

Do not assume that a roadmap item is implemented merely because it
appears in this document.

Do not invent features, files, APIs, migrations, or test results.

For implementation work, follow the project's mandatory clean execution
protocol: - Preserve all existing user changes. - Inspect and safely
restart stale Next.js processes. - Restart relevant backend and planner
services when needed. - Validate the current Prisma schema. - Regenerate
Prisma Client from the current schema. - Verify migration status against
the explicitly confirmed target database. - Never reset or wipe a
database. - Never delete migration history. - Run relevant tests,
TypeScript, lint, and production build. - Verify a fresh runtime. -
Report anything that could not be verified.

**MAKE NO MISTAKE:** Preserve existing W1--W7 functionality and all
established business rules unless a change is explicitly requested and
its impact is understood.

# 14. The Ultimate Product Goal

MichaelOS should become a system that helps people and organizations
operate better every day.

For an individual:

-   Know what matters.
-   Set meaningful goals.
-   Plan realistically.
-   Build consistent habits.
-   Execute important work.
-   Understand what happened.
-   Learn from the day.
-   Make tomorrow better.

For an organization:

-   Align people around priorities.
-   Understand capacity.
-   Allocate resources realistically.
-   Coordinate teams and projects.
-   Execute with visibility.
-   Learn from delivery outcomes.
-   Improve organizational performance.

For both, Michael AI should turn authorized information into useful
understanding, sound recommendations, and controlled actions.

The ultimate promise of MichaelOS is:

> **Don't just manage tasks. Understand your work, make better
> decisions, execute with intention, and continuously improve.**
