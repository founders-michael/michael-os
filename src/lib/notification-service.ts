import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

export const notificationPreferenceSchema = z.object({ inApp: z.boolean(), email: z.boolean() }).strict();

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

/** No row means both channels on: a reminder the user set is expected to arrive. */
export async function getNotificationPreferences(userId: string) {
  const row = await prisma.notificationPreference.findUnique({ where: { userId }, select: { inApp: true, email: true } });
  return row ?? { inApp: true, email: true };
}

export async function setNotificationPreferences(userId: string, input: z.infer<typeof notificationPreferenceSchema>) {
  return prisma.notificationPreference.upsert({
    where: { userId }, create: { userId, ...input }, update: input, select: { inApp: true, email: true },
  });
}
