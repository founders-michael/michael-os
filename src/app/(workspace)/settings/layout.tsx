import Link from "next/link";
import SettingsNav from "@/components/settings/settings-nav";

/**
 * Settings: the account and what the user tells Michael about themselves.
 * Each page runs `requireSettingsUser` itself; this layout holds no data.
 */
export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="m-page m-settings">
    <div className="m-settings-content">
      <header className="m-page-head"><div className="m-page-head-copy"><div className="m-eyebrow">Your account</div><h1 className="m-display">Settings</h1><p className="m-muted">Your account details and what Michael knows about you. Your routine lives in <Link className="m-settings-inline-link" href="/insights">Insights &amp; Context</Link>.</p></div></header>
      <div className="m-settings-grid">
        <SettingsNav />
        <div className="m-settings-panel">{children}</div>
      </div>
    </div>
  </main>;
}
