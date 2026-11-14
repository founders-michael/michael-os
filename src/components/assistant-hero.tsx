import Link from "next/link";
import { ArrowRight, CalendarClock, Check, ListChecks, Sparkles, Target } from "lucide-react";

/**
 * The public hero for the landing page.
 *
 * The transcript below is a fixed, labelled example, not a live session: the
 * assistant reads a signed-in user's saved data, so there is nothing truthful
 * it could answer for an anonymous visitor. Showing a canned exchange as if it
 * were live would misrepresent the product, so it is marked as an example in
 * both the visible caption and the accessible name.
 *
 * Every capability named here maps to a real tool in `src/lib/ai/tools.ts` or
 * a real draft kind in `src/lib/ai/draft-model.ts`. Nothing is aspirational.
 */
const CAPABILITIES = [
  { icon: ListChecks, label: "Reads your tasks, goals and habits" },
  { icon: CalendarClock, label: "Checks your calendar and availability" },
  { icon: Target, label: "Drafts records for you to review and save" },
];

const EXAMPLE_EXCHANGE = [
  { role: "user" as const, text: "What should I focus on today?" },
  {
    role: "assistant" as const,
    text: "You have three tasks due today and a two-hour gap after 14:00. I'd start with the quarterly review draft while that block is free — the other two are short and can follow.",
    sources: ["Your tasks", "Your calendar and availability"],
  },
];

export default function AssistantHero() {
  return (
    <section className="assistant-hero" aria-labelledby="assistant-hero-title">
      <div className="assistant-hero-copy">
        <p className="assistant-hero-kicker">
          <Sparkles size={14} aria-hidden="true" /> MEET MICHAEL
        </p>
        <h1 id="assistant-hero-title">
          Your AI planning assistant, grounded in your own plans.
        </h1>
        <p className="assistant-hero-lede">
          Michael reads the tasks, goals, habits and calendar you have already saved, then helps you
          decide what the day should actually look like. It drafts the changes; you review and save
          them. Nothing is written without you.
        </p>
        <ul className="assistant-hero-capabilities">
          {CAPABILITIES.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
        <div className="assistant-hero-actions">
          <Link className="assistant-hero-primary" href="/lifestyle/register">
            Start planning with Michael <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="assistant-hero-secondary" href="/lifestyle/login">
            Sign in
          </Link>
        </div>
      </div>

      <figure className="assistant-hero-demo">
        <div className="assistant-hero-demo-frame" role="img" aria-label="Example conversation: asked what to focus on today, Michael answers using the user's saved tasks and calendar.">
          {EXAMPLE_EXCHANGE.map((turn) => (
            <div key={turn.role} className={`assistant-hero-turn assistant-hero-turn-${turn.role}`} aria-hidden="true">
              <span className="assistant-hero-turn-label">{turn.role === "user" ? "You" : "Michael"}</span>
              <p>{turn.text}</p>
              {turn.sources && (
                <div className="assistant-hero-sources">
                  {turn.sources.map((source) => (
                    <span key={source}>
                      <Check size={12} aria-hidden="true" />
                      {source}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <figcaption className="assistant-hero-caption">An example of how Michael answers. Sign in to ask about your own plans.</figcaption>
      </figure>
    </section>
  );
}
