import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fromColumns, toColumns, type NotificationPreferences } from "@/lib/notification-preferences";
export { notificationPreferenceSchema } from "@/lib/notification-preferences";

/**
 * In-app notifications and the user's reminder channels. Every query carries
 * the user id; nothing here is reachable for another user.
 *
 * Reads are not cached: the bell polls once a minute and the read is one
 * indexed query ([userId, createdAt] / [userId, readAt]) bounded by `limit`.
 */

export const notificationListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const markReadSchema = z.union([
  z.object({ ids: z.array(z.string().trim().min(1).max(128)).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);


export type NotificationDto = { id: string; kind: "TASK_REMINDER"; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };

export async function listNotifications(userId: string, query: z.infer<typeof notificationListSchema>) {
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
      select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    notifications: rows.map((row): NotificationDto => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, read: row.readAt !== null, createdAt: row.createdAt.toISOString() })),
    total, unreadCount, page: query.page, limit: query.limit,
  };
}

/** Marks the user's own notifications read: the listed ones, or all of them. Another user's ids match nothing. */
export async function markNotificationsRead(userId: string, input: z.infer<typeof markReadSchema>) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...("ids" in input ? { id: { in: input.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { marked: count };
}

const columns = { inAppTasks: true, inAppGoals: true, inAppHabits: true, emailTasks: true, emailGoals: true, emailHabits: true } as const;

/** Per channel and category; no row means all on (notification-preferences.ts). */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  return fromColumns(await prisma.notificationPreference.findUnique({ where: { userId }, select: columns }));
}

/** Saves the whole set: the screen always sends both channels with every category. */
export async function setNotificationPreferences(userId: string, input: NotificationPreferences): Promise<NotificationPreferences> {
  const data = toColumns(input);
  return fromColumns(await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: columns }));
}
