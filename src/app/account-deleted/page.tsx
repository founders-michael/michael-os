import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false, follow: false } };

/** Where the web app lands after deleting an account. Public: the session no longer exists. */
export default function AccountDeletedPage() {
  return <main className="m-page m-account-deleted">
    <section className="m-card m-account-deleted-card" aria-labelledby="account-deleted-heading">
      <h1 id="account-deleted-heading">Your account has been deleted</h1>
      <p>Your MichaelOS account and all of its data have been permanently removed, and you&apos;ve been signed out everywhere.</p>
      <p className="m-muted">If you change your mind, you can create a new account at any time. It will start empty.</p>
      <p className="m-muted">Questions? Email <a href="mailto:support@michaelos.com">support@michaelos.com</a>.</p>
      <Link className="m-btn m-btn-p" href="/">Back to MichaelOS</Link>
    </section>
  </main>;
}
