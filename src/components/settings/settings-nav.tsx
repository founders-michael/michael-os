"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotebookPen, UserRound } from "lucide-react";

const SECTIONS = [
  { href: "/settings", label: "Account", icon: UserRound },
  { href: "/settings/context", label: "My Context", icon: NotebookPen },
] as const;

/** Settings sections. Routine and lifestyle details live under Insights & Context. */
export default function SettingsNav() {
  const pathname = usePathname();
  return <nav className="m-settings-nav" aria-label="Settings sections">
    {SECTIONS.map(({ href, label, icon: Icon }) => {
      const active = pathname === href;
      return <Link key={href} href={href} className={`m-settings-nav-link${active ? " m-on" : ""}`} aria-current={active ? "page" : undefined}>
        <Icon size={16} aria-hidden="true" />{label}
      </Link>;
    })}
  </nav>;
}
