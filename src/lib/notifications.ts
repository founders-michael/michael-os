import { toast } from "sonner";

export type NotificationId = string | number;
export type NotificationKind = "success" | "error" | "warning" | "info";

type NotificationOptions = { description?: string; id?: NotificationId };
type ToastAdapter = {
  success: (message: string, options?: NotificationOptions) => NotificationId;
  error: (message: string, options?: NotificationOptions) => NotificationId;
  warning: (message: string, options?: NotificationOptions) => NotificationId;
  info: (message: string, options?: NotificationOptions) => NotificationId;
  loading: (message: string, options?: NotificationOptions) => NotificationId;
  dismiss: (id?: NotificationId) => unknown;
};

export function createNotifications(adapter: ToastAdapter) {
  const notifyWith = (kind: NotificationKind) => (message: string, description?: string, id?: NotificationId) =>
    adapter[kind](message, { ...(description ? { description } : {}), ...(id !== undefined ? { id } : {}) });

  return {
    success: notifyWith("success"),
    error: notifyWith("error"),
    warning: notifyWith("warning"),
    info: notifyWith("info"),
    loading: (message: string, description?: string) => adapter.loading(message, description ? { description } : undefined),
    update: (id: NotificationId, kind: NotificationKind, message: string, description?: string) => notifyWith(kind)(message, description, id),
    dismiss: (id?: NotificationId) => adapter.dismiss(id),
  };
}

export const notify = createNotifications(toast);
