"use client";

import { useEffect, useState } from "react";
import { createDebouncedCallback } from "@/lib/debounce";

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const update = createDebouncedCallback(setDebouncedValue, delay);
    update(value);
    return update.cancel;
  }, [delay, value]);
  return debouncedValue;
}
