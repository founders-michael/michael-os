export function setFieldById<T extends { id: string }, K extends keyof T>(items: readonly T[], id: string, field: K, value: T[K]): T[] {
  return items.map((item) => item.id === id ? { ...item, [field]: value } : item);
}

/** Roll back only if the field still has this mutation's optimistic value. */
export function rollbackFieldById<T extends { id: string }, K extends keyof T>(items: readonly T[], id: string, field: K, optimisticValue: T[K], previousValue: T[K]): T[] {
  return items.map((item) => item.id === id && item[field] === optimisticValue ? { ...item, [field]: previousValue } : item);
}
