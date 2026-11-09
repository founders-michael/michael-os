"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Compass } from "lucide-react";

export default function ProductNotFound() {
  const pathname = usePathname();
  const isWork = pathname === "/work" || pathname.startsWith("/work/");
  const destination = isWork ? "/work" : "/";
  return <main className={`ux-not-found ${isWork ? "ux-not-found-work" : "ux-not-found-lifestyle"}`}>
    <div className="ux-not-found-card"><span className="ux-not-found-icon"><Compass size={25} /></span><p className="ux-not-found-code">404 · PAGE NOT FOUND</p><h1>This page isn’t here</h1><p>It may have moved, or you may not have access to it.</p><Link href={destination} className="ux-action-primary"><ArrowLeft size={16} />{isWork ? "Back to WorkOS" : "Back to LifestyleOS"}</Link></div>
  </main>;
}
