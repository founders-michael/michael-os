# Michael — AI-first UI redesign (handoff for Claude Code)

This folder is a design reference. Use it to restyle the existing LifestyleOS / Michael app.
Keep all current data, API calls, routes and behaviour. Only the UI changes.

## What's here

| File | What it is |
|---|---|
| `theme.css` | Every design token and component class. Copy it into the app, or translate it into Tailwind/CSS-in-JS. It is the source of truth for colours, glows and animations. |
| `screens/*.html` | One design per screen. Read them for layout, markup structure and copy. They use a design-tool template syntax (`<x-dc>`, `<sc-if>`, `{{hole}}`, `<helmet>`). Ignore that syntax and port only the HTML structure, the inline styles and the classes. |

Screen → current route:

| Design | Route |
|---|---|
| `my-day.html` | `/` (My Day) |
| `assistant.html` | `/assistant` |
| `tasks.html` | `/tasks` |
| `goals.html` | `/goals` |
| `habits.html` | `/habits` |
| `calendar.html` | `/calendar` |
| `daily-review.html` | `/review` |
| `insights.html` | `/insights` |
| `integrations.html` | `/plugins` |

## Theming

- Put `m-root` plus `m-dark` or `m-light` on the app root (`<html>` or the top layout `<div>`). Every colour is a CSS variable (`--bg`, `--paint`, `--surface`, `--text`, `--muted`, `--accent`, `--atext`, `--fill`, `--onfill`, …), so components never hard-code a theme.
- **Dark:** near-black with a dot-grid and soft mint/cyan glow (`--paint`), glowing text (`.glow`, `.neon`), animated gradient borders on AI surfaces (`.ai`), and a breathing orb (`.orb`, with `.ring` pulses).
- **Light:** clean SaaS look. White cards, soft shadows, a dark primary button and emerald accents. The same classes cover it.
- Add a theme toggle in the top bar. Save the choice (e.g. localStorage or next-themes) and default to the system setting.
- `prefers-reduced-motion` already switches off all animation. Keep that.
- Fonts: Geist and Geist Mono (Google Fonts, or the `geist` npm package).

## Shared layout (every screen)

1. **Sidebar (264px):** Michael wordmark with a small orb; the space switcher; a "Michael is with you" card (`.ai`) with an Ask Michael button (⌘J); grouped nav (Ask / Your life / Reflect / Connect) using `.nav`, with `.nav-on` on the active item; a mini "Due today / Habits done" card; the user row.
2. **Top bar:** breadcrumb; a centred command bar `.cmd` ("Ask Michael anything, or search… ⌘K") that opens the existing assistant / command palette; the theme toggle; the avatar.
3. **Content:** max-width 1240px, 32px padding, 24px gaps.
4. **Responsive:** the root is a `flex-wrap` row. The sidebar stacks above the content on narrow screens.

## Key components (classes in theme.css)

`.card`, `.ai` (AI-generated surface), `.lift` (hover), `.btn` / `.btn-p` / `.btn-g` / `.btn-sm` / `.ibtn`, `.chip` / `.chip-ai` / `.chip-warn` / `.chip-hi`, `.prompt` (suggested-prompt pill), `.stat` / `.stat-glow`, `.track` + `.fillbar`, `.sugg` (dashed "suggested by Michael" block), `.check` / `.check-on`, `.seg` (segmented control), `.toggle`, `.field`, `.bubble`, `.dots` (typing indicator), `.eyebrow`, `.display`, `.h2`, `.mono`.

The icons are inline stroke SVGs (24 grid, 1.75 stroke). If the app already uses lucide-react, swap in the closest lucide icon.

## AI-first patterns to wire up

- **Michael line** (`.ai` banner with orb + `Michael · …` text + actions) at the top of Habits, Calendar, Daily Review and Integrations, plus "Michael noticed" on My Day. Generate the text from the assistant backend, or from simple rules on real data if no AI call exists yet.
- **Proposed changes:** Michael never edits data directly. He shows a checklist of proposed changes with Apply and Review-each buttons, as on My Day (afternoon plan) and in the assistant chat.
- **Natural-language capture:** the inputs on Tasks and Habits send the text to the assistant, which fills in title, due date, priority and estimate. Show the parsed result before saving.
- **Suggested calendar sessions** appear as `.sugg` dashed blocks until accepted.
- **Assistant page:** recent chats on the left; the conversation in the middle, with "read N tasks…" context chips and a proposed-changes card; on the right, toggles for what Michael can see and a memory panel.

## Guardrails

- Don't hard-code the sample data in the designs (Vibhor, "Call the dentist", 55%, etc.). Bind everything to the real stores and APIs.
- Don't change backend logic or data models. Keep existing accessibility (labels, aria, focus states).
- Port one screen at a time, starting with the shared layout and theme, and check each in the browser.
