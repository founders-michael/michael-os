"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, LoaderCircle, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import UserAvatar from "@/components/user-avatar";
import { useUserIdentity } from "@/components/user-identity-provider";
import { useConfirmation } from "@/components/ux/confirmation-provider";
import { useUnsavedChangesGuard } from "@/components/settings/use-unsaved-changes-guard";
import { accountUpdateSchema } from "@/lib/account-validation";
import { checkProfileImage, PROFILE_IMAGE_ACCEPT, PROFILE_IMAGE_RULES_TEXT } from "@/lib/profile-image";
import { authProviderLabel } from "@/lib/user-identity";
import { firstFieldErrors } from "@/lib/form-validation";
import { notify } from "@/lib/notifications";
import type { AccountDto } from "@/lib/account-service";

type ApiResult = { account?: AccountDto; error?: string; fields?: Record<string, string[]> };

/**
 * Account details and the profile photo.
 *
 * Nothing here is optimistic: the server decides the saved name and assigns
 * the photo's URL, so each action shows a pending state and the screen changes
 * only from the server's answer. That answer also updates the shared identity,
 * so the sidebar shows the new name and photo at once, and `router.refresh()`
 * re-renders server greetings — no sign-out needed.
 */
export default function AccountSettings({ initialAccount }: { initialAccount: AccountDto }) {
  const router = useRouter();
  const confirm = useConfirmation();
  const { setIdentity } = useUserIdentity();
  const fileInput = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState(initialAccount);
  const [fullName, setFullName] = useState(initialAccount.fullName);
  const [preferredName, setPreferredName] = useState(initialAccount.preferredName);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState<"uploading" | "removing" | null>(null);
  const [imageError, setImageError] = useState("");

  const dirty = fullName !== account.fullName || preferredName !== account.preferredName;
  useUnsavedChangesGuard(dirty);

  function applySaved(saved: AccountDto) {
    setAccount(saved);
    setIdentity(saved.identity);
    router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    const parsed = accountUpdateSchema.safeParse({ fullName, preferredName });
    if (!parsed.success) {
      setFieldErrors(firstFieldErrors(parsed.error));
      setError("Check the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.account) {
        setError(result.error || "We couldn't save your details. Please try again.");
        setFieldErrors(Object.fromEntries(Object.entries(result.fields ?? {}).map(([key, messages]) => [key, messages?.[0] ?? ""])));
        return;
      }
      setFullName(result.account.fullName);
      setPreferredName(result.account.preferredName);
      applySaved(result.account);
      notify.success("Account details saved");
    } catch {
      setError("We couldn't reach MichaelOS. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Same rules the server applies, checked first so a bad file fails instantly.
    const check = checkProfileImage(bytes);
    if (!check.ok) { setImageError(check.message); return; }
    setImageBusy("uploading");
    try {
      const response = await fetch("/api/account/image", { method: "PUT", headers: { "Content-Type": check.contentType }, body: bytes });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.account) { setImageError(result.error || "We couldn't upload that photo. Please try again."); return; }
      applySaved(result.account);
      notify.success("Profile photo updated");
    } catch {
      setImageError("We couldn't reach MichaelOS. Check your connection and try again.");
    } finally {
      setImageBusy(null);
    }
  }

  function removePhoto() {
    void confirm({
      title: "Remove your photo?",
      description: account.hasProviderImage ? "Your photo from your sign-in provider will show instead." : "Your initials will show instead.",
      confirmLabel: "Remove photo",
      destructive: true,
    }, async () => {
      setImageError("");
      setImageBusy("removing");
      try {
        const response = await fetch("/api/account/image", { method: "DELETE" });
        const result = await response.json() as ApiResult;
        if (!response.ok || !result.account) { setImageError(result.error || "We couldn't remove that photo. Please try again."); return; }
        applySaved(result.account);
        notify.success("Profile photo removed");
      } catch {
        setImageError("We couldn't reach MichaelOS. Check your connection and try again.");
      } finally {
        setImageBusy(null);
      }
    });
  }

  const photoSource = account.identity.avatarSource === "custom" ? "Your uploaded photo"
    : account.identity.avatarSource === "provider" ? `From ${account.providers.filter((id) => id !== "credential").map(authProviderLabel)[0] ?? "your sign-in provider"}`
      : "No photo yet — showing your initials";

  return <div className="m-settings-stack">
    <section className="settings-section" aria-labelledby="account-photo-heading">
      <div className="settings-section-heading"><span className="settings-section-icon"><ImageUp size={17} aria-hidden="true" /></span><div><h2 id="account-photo-heading">Profile photo</h2><p>Shown in the sidebar and wherever MichaelOS shows you.</p></div></div>
      <div className="m-settings-photo">
        <UserAvatar identity={account.identity} size={72} className="m-settings-photo-avatar" />
        <div className="m-settings-photo-copy">
          <p className="m-settings-photo-source">{photoSource}</p>
          <p className="m-settings-hint">{PROFILE_IMAGE_RULES_TEXT}</p>
          <div className="m-settings-photo-actions">
            <input ref={fileInput} type="file" accept={PROFILE_IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void upload(event)} />
            <button type="button" className="m-btn m-btn-sm" disabled={imageBusy !== null} onClick={() => fileInput.current?.click()}>
              {imageBusy === "uploading" ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <ImageUp size={14} aria-hidden="true" />}
              {imageBusy === "uploading" ? "Uploading…" : account.hasCustomImage ? "Replace photo" : "Upload photo"}
            </button>
            {account.hasCustomImage && <button type="button" className="m-btn m-btn-g m-btn-sm" disabled={imageBusy !== null} onClick={removePhoto}>
              {imageBusy === "removing" ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
              {imageBusy === "removing" ? "Removing…" : "Remove"}
            </button>}
          </div>
          {imageError && <p className="settings-field-error" role="alert">{imageError}</p>}
        </div>
      </div>
    </section>

    <form className="settings-section" aria-labelledby="account-details-heading" onSubmit={(event) => void save(event)} noValidate>
      <div className="settings-section-heading"><span className="settings-section-icon"><UserRound size={17} aria-hidden="true" /></span><div><h2 id="account-details-heading">Account details</h2><p>Your name, and the name Michael uses for you.</p></div></div>

      <label className="settings-field m-settings-callme" htmlFor="account-preferred-name">
        <span className="m-settings-callme-label">What should Michael call you?</span>
        <input id="account-preferred-name" value={preferredName} maxLength={80} required autoComplete="nickname" aria-invalid={Boolean(fieldErrors.preferredName)} aria-describedby="account-preferred-name-hint" onChange={(event) => { setPreferredName(event.target.value); setFieldErrors((current) => ({ ...current, preferredName: "" })); }} />
        <small id="account-preferred-name-hint">Used in greetings, in conversations with Michael and across MichaelOS, exactly as you write it.</small>
        {fieldErrors.preferredName && <small className="settings-field-error">{fieldErrors.preferredName}</small>}
      </label>

      <div className="settings-field-grid">
        <label className="settings-field" htmlFor="account-full-name">Full name
          <input id="account-full-name" value={fullName} maxLength={80} required autoComplete="name" aria-invalid={Boolean(fieldErrors.fullName)} onChange={(event) => { setFullName(event.target.value); setFieldErrors((current) => ({ ...current, fullName: "" })); }} />
          {fieldErrors.fullName && <small className="settings-field-error">{fieldErrors.fullName}</small>}
        </label>
        <label className="settings-field" htmlFor="account-email">Email address
          <input id="account-email" value={account.email} readOnly aria-describedby="account-email-hint" />
          <small id="account-email-hint">Your sign-in email can&apos;t be changed here yet.</small>
        </label>
      </div>

      <div className="m-settings-providers">
        <span className="m-settings-providers-label"><ShieldCheck size={15} aria-hidden="true" />{account.providers.length > 1 ? "You can sign in with" : "Signed in with"}</span>
        <ul>{account.providers.length ? account.providers.map((id) => <li key={id} className="m-chip">{id === "credential" ? <Mail size={13} aria-hidden="true" /> : null}{authProviderLabel(id)}</li>) : <li className="m-chip">Unknown</li>}</ul>
        {account.providers.length > 1 && <p className="m-settings-hint m-settings-providers-hint">These share your email address, so they open the same account.</p>}
      </div>

      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-save-row">
        {dirty && !saving && <button type="button" className="m-btn m-btn-g" onClick={() => { setFullName(account.fullName); setPreferredName(account.preferredName); setFieldErrors({}); setError(""); }}>Cancel</button>}
        <button className="settings-save-button" type="submit" disabled={saving || !dirty}>{saving ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Save changes"}</button>
      </div>
    </form>
  </div>;
}
