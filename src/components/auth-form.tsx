"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Leaf, LockKeyhole, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type AuthFormProps = { mode: "login" | "register" };

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = isRegister
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/onboarding" })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/" });

      if (result.error) {
        setError(result.error.message || "We couldn’t complete that request. Please try again.");
        return;
      }

      router.replace(isRegister ? "/onboarding" : "/");
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
        <Link className="brand auth-brand" href="/" aria-label="MichaelOS home"><span className="brand-mark"><span /><span /><span /><span /></span><span>michael<span className="brand-light">os</span></span></Link>
        <div className="story-content">
          <div className="story-pill"><Sparkles size={13} /> A CALMER WAY TO MOVE FORWARD</div>
          <h1>Make room for<br />what <em>matters.</em></h1>
          <p>Your days are full. MichaelOS helps you find a little clarity, make a realistic plan, and focus on what matters most.</p>
          <div className="story-points"><div><span><Check size={13} /></span>Plans that fit real life</div><div><span><Check size={13} /></span>Progress without the pressure</div><div><span><Check size={13} /></span>A little more room to breathe</div></div>
        </div>
        <div className="auth-story-foot"><span><Leaf size={13} /> A life in progress</span><span>Thoughtfully yours</span></div>
        <div className="story-orbit story-orbit-a" /><div className="story-orbit story-orbit-b" /><div className="story-sun"><span>✳</span></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-form-heading"><div className="auth-form-icon"><LockKeyhole size={18} /></div><div className="section-kicker">YOUR PERSONAL SPACE</div><h2>{isRegister ? "Start with a fresh page." : "Welcome back."}</h2><p>{isRegister ? "A few details and we’ll make this space yours." : "Come on in. Your day is waiting."}</p></div>
          <form className="auth-form" onSubmit={submit}>
            {isRegister && <label className="auth-field"><span>Your name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" required maxLength={80} /></label>}
            <label className="auth-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></label>
            <label className="auth-field"><span>Password</span><span className="password-input"><input type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "At least 12 characters" : "Your password"} required minLength={isRegister ? 12 : undefined} maxLength={128} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? (isRegister ? "Creating your space…" : "Signing you in…") : (isRegister ? "Create your account" : "Sign in to MichaelOS")}<ArrowRight size={16} /></button>
          </form>
          <div className="auth-switch">{isRegister ? "Already have an account?" : "New to MichaelOS?"} <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></div>
          <div className="auth-privacy"><span><LockKeyhole size={12} /> Private by design</span><i />Your account is only for you</div>
        </div>
        <div className="auth-bottom-note">Small steps still move you forward <span>✳</span></div>
      </section>
    </main>
  );
}
