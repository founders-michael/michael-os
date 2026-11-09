"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveController, type AutosaveStatus } from "@/lib/autosave-controller";

export function useAutosave<T>(value: T, options: { initialValue: T; enabled: boolean; delay?: number; save: (value: T) => Promise<void> }) {
  const saveRef = useRef(options.save);
  const initialRef = useRef(options.initialValue);
  const initialObservedRef = useRef(options.initialValue);
  const controllerRef = useRef<AutosaveController<T> | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  useEffect(() => { saveRef.current = options.save; }, [options.save]);

  useEffect(() => {
    const controller = new AutosaveController<T>((next) => saveRef.current(next), options.delay);
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setStatus);
    return () => { unsubscribe(); controller.dispose(); controllerRef.current = null; };
  }, [options.delay]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setSave((next) => saveRef.current(next));
    if (!Object.is(initialObservedRef.current, options.initialValue)) {
      initialObservedRef.current = options.initialValue;
      initialRef.current = options.initialValue;
      controller.markSaved();
    }
    if (!options.enabled || Object.is(value, initialRef.current)) return;
    controller.schedule(value);
  }, [value, options.initialValue, options.enabled, options.delay]);

  return { status, retry: () => controllerRef.current?.retry(), flush: () => controllerRef.current?.flush() };
}
