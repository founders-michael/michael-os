"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock3, Compass, Leaf, LoaderCircle, Sparkles, Sun, UserRound } from "lucide-react";
import type { ProfileFormData } from "@/lib/profile-validation";

const steps = ["Welcome", "About you", "Your routine", "Priorities", "Preferences", "Review"];
const dayOptions = [
  ["MONDAY", "Mon"], ["TUESDAY", "Tue"], ["WEDNESDAY", "Wed"], ["THURSDAY", "Thu"],
  ["FRIDAY", "Fri"], ["SATURDAY", "Sat"], ["SUNDAY", "Sun"],
] as const;
const styles = [
  { id: "STRUCTURED", title: "Structured", note: "Clear blocks and a steady plan" },
  { id: "BALANCED", title: "Balanced", note: "A plan with room to breathe" },
  { id: "FLEXIBLE", title: "Flexible", note: "Gentle guidance that can shift" },
] as const;

export default function Onboarding({ initialData, initialStep }: { initialData: ProfileFormData; initialStep: number }) {
  const router = useRouter();
  const [data, setData] = useState<ProfileFormData>(initialData);
  const [step, setStep] = useState(Math.max(0, Math.min(5, initialStep)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [priorityDraft, setPriorityDraft] = useState("");
  const [complete, setComplete] = useState(false);

  function update<K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  }

  async function save(nextStep: number) {
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, onboardingStep: nextStep }),
      });
      const result: { error?: string; fields?: Record<string, string[]> } = await response.json();
      if (!response.ok) {
        setError(result.error || "We couldn't save that yet. Please try again.");
        setFieldErrors(Object.fromEntries(Object.entries(result.fields ?? {}).map(([key, messages]) => [key, messages?.[0] ?? ""])));
        return false;
      }
      setStep(nextStep);
      return true;
    } catch {
      setError("We couldn't reach MichaelOS. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 5) {
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/profile/complete", { method: "POST" });
        const result: { error?: string } = await response.json();
        if (!response.ok) {
          setError(result.error || "We couldn't finish setting up your profile.");
          return;
        }
        setComplete(true);
      } catch {
        setError("We couldn't reach MichaelOS. Your saved details are still here.");
      } finally {
        setBusy(false);
      }
      return;
    }
    await save(step + 1);
  }

  async function back() {
    if (step === 0 || busy) return;
    await save(step - 1);
  }

  function addPriority() {
    const value = priorityDraft.trim();
    if (!value || data.priorities.includes(value) || data.priorities.length >= 3) return;
    update("priorities", [...data.priorities, value]);
    setPriorityDraft("");
  }

  const currentTitle = ["A little more you, a little more clarity.", "Let’s make this yours.", "What does a usual day look like?", "What matters most right now?", "A rhythm that feels right.", "Take a look before we begin."][step];
  const currentCopy = [
    "A few thoughtful details help MichaelOS feel like it fits your life. You can change these any time.",
    "A couple of basics help make your space feel personal.",
    "These are just guideposts. Your days can still look different from one another.",
    "Add up to three things you want to keep in view. It’s completely fine to leave this blank.",
    "Set a starting point for focused work and the space between it.",
    "Everything here can be updated later in your profile.",
  ][step];

  return (
    <main className="onboarding-page">
      <header className="onboarding-header"><Link className="brand onboarding-brand" href="/" aria-label="MichaelOS"><BrandLogo /></Link><span className="onboarding-save"><span className="save-dot" /> Your progress saves as you go</span></header>
      <div className="onboarding-layout">
        <aside className="onboarding-aside"><span className="onboarding-aside-icon"><Leaf size={18} /></span><div className="section-kicker">A SPACE FOR YOUR DAY</div><h1>Make room for<br /><em>what matters.</em></h1><p>Start with a few small details about the way you live and work. We’ll keep your preferences safe as your space grows.</p><div className="onboarding-aside-note"><Sparkles size={15} /><span>Your answers are saved to your private profile.</span></div><span className="onboarding-orbit onboarding-orbit-a" /><span className="onboarding-orbit onboarding-orbit-b" /></aside>
        <section className="onboarding-main" aria-labelledby="onboarding-title">
          {!complete ? <>
            <nav className="onboarding-steps" aria-label="Onboarding steps">{steps.map((label, index) => <div className={`onboarding-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`} key={label}><span>{index < step ? <Check size={12} /> : index + 1}</span><small>{label}</small></div>)}</nav>
            <form className="onboarding-form" onSubmit={advance}>
              <div className="onboarding-intro"><div className="onboarding-kicker">STEP {String(step + 1).padStart(2, "0")} <span>·</span> {steps[step].toUpperCase()}</div><h2 id="onboarding-title">{currentTitle}</h2><p>{currentCopy}</p></div>
              <div className="onboarding-fields">
                {step === 0 && <div className="welcome-panel"><span className="welcome-icon"><Compass size={21} /></span><strong>A calmer place to plan your days.</strong><p>This short setup saves your routine and planning preferences so your MichaelOS space starts with the context you choose to share.</p><div><Check size={14} /> Your details stay connected to your account</div></div>}
                {step === 1 && <>
                  <label className="onboarding-label">What should we call you?<input autoFocus className="onboarding-input" value={data.preferredName} maxLength={80} onChange={(event) => update("preferredName", event.target.value)} placeholder="Your preferred name" required /><small>Use the name you’d like to see in your workspace.</small>{fieldErrors.preferredName && <span className="onboarding-field-error">{fieldErrors.preferredName}</span>}</label>
                  <label className="onboarding-label">Your time zone<input className="onboarding-input" value={data.timeZone} onChange={(event) => update("timeZone", event.target.value)} placeholder="Area/City · for example Asia/Kolkata" required /><small>Enter an IANA time zone such as America/Chicago or Europe/London.</small>{fieldErrors.timeZone && <span className="onboarding-field-error">{fieldErrors.timeZone}</span>}</label>
                </>}
                {step === 2 && <>
                  <div className="onboarding-input-grid"><label className="onboarding-label">Wake-up time<input className="onboarding-input" type="time" value={data.wakeUpTime} onChange={(event) => update("wakeUpTime", event.target.value)} required /></label><label className="onboarding-label">Bedtime<input className="onboarding-input" type="time" value={data.bedtime} onChange={(event) => update("bedtime", event.target.value)} required /></label></div>
                  <div className="onboarding-input-grid"><label className="onboarding-label">Work or study starts<input className="onboarding-input" type="time" value={data.workStartTime ?? ""} onChange={(event) => update("workStartTime", event.target.value || null)} /></label><label className="onboarding-label">Usually wraps up<input className="onboarding-input" type="time" value={data.workEndTime ?? ""} onChange={(event) => update("workEndTime", event.target.value || null)} /></label></div>
                  {(fieldErrors.workStartTime || fieldErrors.workEndTime) && <span className="onboarding-field-error">{fieldErrors.workStartTime || fieldErrors.workEndTime}</span>}
                  <fieldset className="onboarding-day-field"><legend>Typical work or study days</legend><div className="day-options">{dayOptions.map(([value, label]) => <button className={`day-option ${data.workDays.includes(value) ? "selected" : ""}`} type="button" key={value} aria-pressed={data.workDays.includes(value)} onClick={() => update("workDays", data.workDays.includes(value) ? data.workDays.filter((day) => day !== value) : [...data.workDays, value])}>{label}</button>)}</div></fieldset>
                </>}
                {step === 3 && <>
                  <label className="onboarding-label">A few priorities <span className="optional-tag">OPTIONAL · UP TO 3</span><div className="priority-entry"><input className="onboarding-input" value={priorityDraft} maxLength={100} onChange={(event) => setPriorityDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPriority(); } }} placeholder="For example, make time to learn" disabled={data.priorities.length >= 3} /><button type="button" className="priority-add" onClick={addPriority} disabled={!priorityDraft.trim() || data.priorities.length >= 3}>Add</button></div><small>These are onboarding notes only, not managed goals.</small>{fieldErrors.priorities && <span className="onboarding-field-error">{fieldErrors.priorities}</span>}</label>
                  <div className="priority-chips">{data.priorities.map((priority) => <span key={priority}>{priority}<button type="button" aria-label={`Remove ${priority}`} onClick={() => update("priorities", data.priorities.filter((item) => item !== priority))}>×</button></span>)}</div>
                  {!data.priorities.length && <div className="skip-note"><Sparkles size={15} /> No need to have it all figured out. You can skip this and return any time.</div>}
                </>}
                {step === 4 && <>
                  <div className="onboarding-input-grid"><label className="onboarding-label">Focus session<select className="onboarding-input" value={data.focusSessionMinutes} onChange={(event) => update("focusSessionMinutes", Number(event.target.value))}>{[25, 40, 50, 60, 75, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label className="onboarding-label">Break between sessions<select className="onboarding-input" value={data.breakDurationMinutes} onChange={(event) => update("breakDurationMinutes", Number(event.target.value))}>{[0, 5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} minutes` : "No preference"}</option>)}</select></label></div>
                  <fieldset className="planning-options"><legend>How do you like to plan?</legend><div>{styles.map((style) => <label className={`planning-option ${data.planningStyle === style.id ? "selected" : ""}`} key={style.id}><input type="radio" name="planningStyle" value={style.id} checked={data.planningStyle === style.id} onChange={() => update("planningStyle", style.id)} /><span><strong>{style.title}</strong><small>{style.note}</small></span><i /></label>)}</div></fieldset>
                </>}
                {step === 5 && <div className="review-list"><ReviewRow icon={<UserRound size={16} />} title="Your details"><strong>{data.preferredName || "Add a name"}</strong><span>{data.timeZone}</span></ReviewRow><ReviewRow icon={<Sun size={16} />} title="Daily rhythm"><strong>Up at {data.wakeUpTime} · winding down at {data.bedtime}</strong><span>{data.workStartTime && data.workEndTime ? `Work or study: ${data.workStartTime}–${data.workEndTime}` : "Work or study hours not set"}</span><span>{data.workDays.length ? data.workDays.map((day) => day.slice(0, 3).toLowerCase()).join(", ") : "No typical days selected"}</span></ReviewRow><ReviewRow icon={<Sparkles size={16} />} title="Priorities"><strong>{data.priorities.length ? data.priorities.join(" · ") : "Nothing added yet"}</strong></ReviewRow><ReviewRow icon={<Clock3 size={16} />} title="Planning style"><strong>{data.focusSessionMinutes} minute focus · {data.breakDurationMinutes || "No"} minute break</strong><span>{styles.find((item) => item.id === data.planningStyle)?.title} planning</span></ReviewRow><p className="review-hint">Demo schedule and dashboard cards remain sample content. These preferences are saved to your profile and don’t currently drive recommendations.</p></div>}
              </div>
              {error && <p className="onboarding-error" role="alert">{error}</p>}
              <div className="onboarding-controls"><button className="onboarding-back" type="button" onClick={back} disabled={step === 0 || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <ArrowLeft size={15} />}Back</button><button className="onboarding-continue" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={15} />Saving…</> : step === 5 ? <>Finish setup <Check size={15} /></> : <>Continue <ArrowRight size={15} /></>}</button></div>
              {step > 1 && step < 5 && <button type="button" className="onboarding-skip" onClick={() => void save(step + 1)} disabled={busy}>Skip this step</button>}
            </form>
          </> : <div className="onboarding-complete"><span className="complete-icon"><Check size={25} /></span><div className="section-kicker">ALL SET, {data.preferredName.toUpperCase()}</div><h2>Your space is ready.</h2><p>Your preferences have been saved. Come back to update them whenever your routine changes.</p><button className="onboarding-continue" onClick={() => { router.replace("/"); router.refresh(); }}>Go to your dashboard <ArrowRight size={15} /></button></div>}
        </section>
      </div>
      <footer className="onboarding-footer"><span>Thoughtful plans start with your own rhythm.</span><span>MichaelOS <span className="footer-heart">♥</span></span></footer>
    </main>
  );
}

function ReviewRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="review-row"><span className="review-icon">{icon}</span><div><small>{title}</small>{children}</div></div>;
}
