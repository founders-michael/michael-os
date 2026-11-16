"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Leaf, LockKeyhole, MailCheck, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import { productAuthDestination, productAuthHref, type ProductExperience } from "@/lib/product-entry";
import { safeInvitationReturnTo } from "@/lib/auth-return-to";
import { getPasswordRequirementState, meetsPasswordPolicy } from "@/lib/password-policy";
import { isEmailNotVerifiedError, authRedirectMessage } from "@/lib/auth-messages";
import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "@/lib/social-providers";
import SocialProviderIcon from "@/components/social-provider-icon";

/** Client-side pause between resends; the server also rate-limits. */
const RESEND_COOLDOWN_MS = 30_000;

type PendingVerification = { email: string; reason: "registered" | "signin" };

type AuthFormProps = { mode: "login" | "register"; product?: ProductExperience; returnTo?: string; defaultDestination?: string; authError?: string; socialProviders?: SocialProvider[] };

export default function AuthForm({ mode, product = "lifestyle", returnTo, defaultDestination, authError, socialProviders = [] }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => authRedirectMessage(authError) ?? "");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const isRegister = mode === "register";
  const destination = defaultDestination ?? productAuthDestination(product, mode);
  const workProduct = product === "work";
  const safeReturnTo = safeInvitationReturnTo(returnTo);
  // The verification link returns here: a signed-in visitor is sent on to the
  // right destination by the page, and a failed link shows its error here.
  const verificationCallback = productAuthHref(product, "login", safeReturnTo);

  useEffect(() => {
    if (resendState !== "sent") return;
    const id = setTimeout(() => setResendState("idle"), RESEND_COOLDOWN_MS);
    return () => clearTimeout(id);
  }, [resendState]);

  /**
   * Hands off to the provider. Every outcome returns to this auth page: a
   * signed-in visitor is forwarded to the right place by the page (onboarding
   * for a new LifestyleOS user), and a failure arrives as ?error=<code>.
   */
  async function continueWith(provider: SocialProvider) {
    setSocialBusy(provider);
    setError("");
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: verificationCallback, newUserCallbackURL: verificationCallback, errorCallbackURL: verificationCallback });
      if (result?.error) {
        setError(result.error.message || `We couldn’t start sign-in with ${SOCIAL_PROVIDER_LABELS[provider]}.`);
        setSocialBusy(null);
      }
      // On success the browser is already navigating to the provider.
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setSocialBusy(null);
    }
  }

  async function resend() {
    if (!pending) return;
    setResendState("sending");
    try {
      const result = await authClient.sendVerificationEmail({ email: pending.email, callbackURL: verificationCallback });
      setResendState(result.error ? "failed" : "sent");
    } catch { setResendState("failed"); }
  }
  const passwordRequirements = getPasswordRequirementState(password);
  const extraPasswordTips = [
    { id: "length16", label: "Aim for 16 or more characters", met: password.length >= 16 },
    { id: "character-mix", label: "Add a number and a symbol", met: /\d/.test(password) && /[^A-Za-z0-9]/.test(password) },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRegister && !meetsPasswordPolicy(password)) {
      setError("Complete all password requirements before continuing.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const result = isRegister
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: verificationCallback })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: verificationCallback });

      if (isEmailNotVerifiedError(result.error)) {
        setPending({ email: email.trim(), reason: "signin" });
        setPassword("");
        return;
      }
      if (result.error) {
        setError(result.error.message || "We couldn’t complete that request. Please try again.");
        return;
      }

      if (isRegister) {
        // No session until the address is verified; the link signs them in.
        setPending({ email: email.trim(), reason: "registered" });
        setPassword("");
        return;
      }
      router.replace(safeReturnTo ?? destination);
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand auth-brand" href="/" aria-label="MichaelOS home"><BrandLogo /></Link>
        <div className="story-content">
          <div className="story-pill"><Sparkles size={13} /> {workProduct ? "A CLEARER WAY TO WORK TOGETHER" : "A CALMER WAY TO MOVE FORWARD"}</div>
          <h1>{workProduct ? <>Make room for<br />better <em>work.</em></> : <>Make room for<br />what <em>matters.</em></>}</h1>
          <p>{workProduct ? "Start an organization space or join one by invitation. Personal plans stay in their own private LifestyleOS space." : "Your days are full. MichaelOS helps you find a little clarity, make a realistic plan, and focus on what matters most."}</p>
          <div className="story-points">{(workProduct ? ["Organization membership", "Your personal data stays separate", "More work tools are coming"] : ["Plans that fit real life", "Progress without the pressure", "A little more room to breathe"]).map((point) => <div key={point}><span><Check size={13} /></span>{point}</div>)}</div>
        </div>
        <div className="auth-story-foot"><span><Leaf size={13} /> A life in progress</span><span>Thoughtfully yours</span></div>
        <div className="story-orbit story-orbit-a" /><div className="story-orbit story-orbit-b" /><div className="story-sun"><span>✳</span></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-form-heading"><div className="auth-form-icon"><LockKeyhole size={18} /></div><div className="section-kicker">{workProduct ? "YOUR ORGANIZATION SPACE" : "YOUR PERSONAL SPACE"}</div><h2>{isRegister ? (workProduct ? "Start your WorkOS account." : "Start with a fresh page.") : "Welcome back."}</h2><p>{isRegister ? (workProduct ? "Create your identity, then create an organization or accept an invitation." : "A few details and we’ll make this space yours.") : (workProduct ? "Sign in to create or open your organization space." : "Come on in. Your day is waiting.")}</p></div>
          {pending ? <div className="auth-verify" role="status">
            <div className="auth-verify-icon" aria-hidden="true"><MailCheck size={20} /></div>
            <h3>Check your inbox</h3>
            <p>{pending.reason === "registered" ? "We sent a verification link to " : "Your email isn’t verified yet, so we sent a new link to "}<strong>{pending.email}</strong>. Open it to finish signing in. It works once and expires in 1 hour.</p>
            <p className="auth-verify-hint">Can’t find it? Check spam or promotions.</p>
            <button type="button" className="auth-submit" onClick={() => void resend()} disabled={resendState === "sending" || resendState === "sent"}>
              {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Sent — check your inbox" : "Resend the email"}
            </button>
            {resendState === "failed" && <p className="auth-error" role="alert">We couldn’t send the email. Wait a moment and try again.</p>}
            <button type="button" className="auth-verify-back" onClick={() => { setPending(null); setResendState("idle"); setError(""); }}>Use a different email</button>
          </div> : <>
          {socialProviders.length > 0 && <div className="auth-social">
            {socialProviders.map((provider) => <button key={provider} type="button" className="auth-social-button" disabled={socialBusy !== null || busy} onClick={() => void continueWith(provider)}>
              <SocialProviderIcon provider={provider} />
              {socialBusy === provider ? `Opening ${SOCIAL_PROVIDER_LABELS[provider]}…` : `Continue with ${SOCIAL_PROVIDER_LABELS[provider]}`}
            </button>)}
            <div className="auth-social-divider" role="separator"><span>or {isRegister ? "sign up" : "sign in"} with email</span></div>
          </div>}
          <form className="auth-form" onSubmit={submit}>
            {isRegister && <label className="auth-field"><span>Your name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" required maxLength={80} /></label>}
            <label className="auth-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></label>
            <div className="auth-field"><label htmlFor="auth-password">Password</label><span className="password-input"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder={isRegister ? "Create a password" : "Your password"} required minLength={isRegister ? 12 : undefined} maxLength={128} aria-describedby={isRegister ? "auth-password-guidance" : undefined} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>{isRegister && <div className="auth-password-guidance" id="auth-password-guidance"><p className="password-guidance-heading">Required</p><ul aria-label="Required password rules">{passwordRequirements.map((requirement) => <li className={requirement.met ? "password-requirement-met" : ""} key={requirement.id}><span className="password-requirement-icon" aria-hidden="true">{requirement.met ? <Check size={14} strokeWidth={2.5} /> : <span />}</span><span>{requirement.label}</span><span className="sr-only">{requirement.met ? " — met" : " — remaining"}</span></li>)}</ul><p className="password-guidance-heading password-guidance-optional-heading">Optional ways to make it stronger</p><ul aria-label="Optional password strength suggestions">{extraPasswordTips.map((tip) => <li className={tip.met ? "password-requirement-met" : ""} key={tip.id}><span className="password-requirement-icon" aria-hidden="true">{tip.met ? <Check size={14} strokeWidth={2.5} /> : <span />}</span><span>{tip.label}</span><span className="sr-only">{tip.met ? " — met" : " — suggested"}</span></li>)}</ul><p className="password-guidance-note">A memorable alternative: 4–5 random, unrelated words, such as <strong>ClockCarpetBlueTomato</strong>. Avoid personal details and predictable sequences like <strong>12345</strong> or <strong>qwerty</strong>.</p></div>}</div>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy || socialBusy !== null}>{busy ? (isRegister ? "Creating your space…" : "Signing you in…") : (isRegister ? "Create your account" : "Sign in to MichaelOS")}<ArrowRight size={16} /></button>
          </form>
          </>}
          <div className="auth-switch">{isRegister ? "Already have an account?" : "New to MichaelOS?"} <Link href={productAuthHref(product, isRegister ? "login" : "register", safeReturnTo)}>{isRegister ? "Sign in" : "Create an account"}</Link></div>
          <div className="auth-privacy"><span><LockKeyhole size={12} /> Private by design</span><i />Your account is only for you</div>
        </div>
        <div className="auth-bottom-note">Small steps still move you forward <span>✳</span></div>
      </section>
    </main>
  );
}
