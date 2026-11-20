"use client";

/**
 * The bell in the top bar: the user's in-app notifications (task reminders)
 * and their unread count. Polls once a minute while the page is open; there is
 * no push channel on the web yet. Opening a notification marks it read and
 * goes to its in-app link. Marking read waits for the server (CLAUDE.md §9.5:
 * the claim is that something changed), so the badge only drops once it has.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { DropdownMenu } from "@animate-ui/react/primitives/radix-ui";
import { requestJson } from "@/components/michael/task-intelligence";
import type { NotificationDto } from "@/lib/notification-service";

type List = { notifications: NotificationDto[]; unreadCount: number };
const KEY = ["notifications", "bell"];

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const result = await requestJson<List>("/api/notifications?limit=15");
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const unread = query.data?.unreadCount ?? 0;
  const items = query.data?.notifications ?? [];

  async function markRead(body: { ids: string[] } | { all: true }) {
    setBusy(true);
    const result = await requestJson<{ marked: number }>("/api/notifications/read", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (result.ok) await queryClient.invalidateQueries({ queryKey: KEY });
  }

  return <DropdownMenu.Root onOpenChange={(open) => { if (open) void query.refetch(); }}>
    <DropdownMenu.Trigger asChild>
      <button type="button" className="m-btn m-btn-g m-ibtn m-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="m-bell-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="account-menu m-bell-menu" aria-label="Notifications" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
        <div className="m-bell-head">
          <strong>Notifications</strong>
          {unread > 0 && <button type="button" className="m-btn m-btn-g m-bell-all" disabled={busy} onClick={() => void markRead({ all: true })}><CheckCheck size={14} aria-hidden="true" />Mark all read</button>}
        </div>
        {query.isError ? <p className="m-bell-empty">Notifications couldn&apos;t load.</p>
          : items.length === 0 ? <p className="m-bell-empty">{query.isPending ? "Loading…" : "Nothing yet. Reminders you set on tasks appear here."}</p>
          : items.map((item) => <DropdownMenu.Item key={item.id} className={`m-bell-item${item.read ? "" : " m-bell-unread"}`} onSelect={() => {
              if (!item.read) void markRead({ ids: [item.id] });
              if (item.link) router.push(item.link);
            }}>
              <Bell size={15} aria-hidden="true" />
              <span><strong>{item.title}</strong><small>{item.body ?? "Reminder"} · {ago(item.createdAt)}</small></span>
            </DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
