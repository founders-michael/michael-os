"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { authClient } from "@/lib/auth-client";

const links = [
  { label: "Today", href: "/" },
  { label: "Tasks", href: "/tasks" },
  { label: "Goals", href: "/goals" },
  { label: "Habits", href: "/habits" },
  { label: "Calendar", href: "/calendar" },
  { label: "Plugins", href: "/plugins" },
  { label: "Insights", href: "/insights" },
];

export default function WorkspacePageHeader({ userName, active }: { userName: string; active: "Plugins" | "Insights" }) {
  const router = useRouter();
  return <header className="goals-topbar product-page-topbar">
    <Link href="/" className="goals-brand" aria-label="MichaelOS home"><BrandLogo /></Link>
    <nav aria-label="Workspace navigation">{links.map((link) => <Link key={link.href} href={link.href} className={link.label === active ? "current" : ""} aria-current={link.label === active ? "page" : undefined}>{link.label}</Link>)}</nav>
    <div className="goals-account"><span>{userName}</span><button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} aria-label="Sign out"><LogOut size={15} /></button></div>
  </header>;
}
