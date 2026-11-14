"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui";

/**
 * The single modal dialog for the app.
 *
 * The hand-rolled dialogs this replaces declared `role="dialog"` and
 * `aria-modal="true"` but implemented none of what those attributes promise:
 * no focus trap, no Escape handler, no focus restore, and nothing marking the
 * page behind as inert. `aria-modal="true"` tells assistive technology the
 * rest of the page is unreachable, so without a trap it is an incorrect
 * promise — a keyboard user tabs straight out of the dialog and into the page
 * underneath while the screen reader insists they cannot. Radix implements all
 * four, which is the reason for this component; the animation is secondary.
 *
 * It keeps the existing `task-dialog-scrim` / `task-dialog` class names, so
 * the visual design is unchanged and per-dialog styles (`habit-dialog`,
 * `goal-dialog`) still apply through `className`.
 *
 * Motion is Animate UI's spring default, paced by the `AnimateUIProvider`
 * tempo set in the root layout. Under `prefers-reduced-motion` Animate UI
 * drops the tilt, scale and slide and leaves only the fade and un-blur, which
 * conveys the state change without movement — so no guard is needed here.
 *
 * Note that Radix does not set `aria-modal="true"`. It marks the background
 * content `aria-hidden` and makes it non-interactive instead, which is the
 * stronger guarantee: `aria-modal` is advisory and unevenly supported, whereas
 * hiding the background is what actually keeps assistive technology inside the
 * dialog. The old markup claimed the attribute and did neither.
 */
export default function AppDialog({
  open,
  onOpenChange,
  title,
  kicker,
  className = "",
  closeDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  kicker?: string;
  className?: string;
  /** Blocks Escape, the scrim and the close button while a save is in flight. */
  closeDisabled?: boolean;
  children: ReactNode;
}) {
  const guard = (event: { preventDefault: () => void }) => {
    if (closeDisabled) event.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="task-dialog-scrim" />
        <Dialog.Content
          className={`task-dialog app-dialog-content ${className}`.trim()}
          // These dialogs label themselves with a title and have no separate
          // description; without this Radix warns about a missing one.
          aria-describedby={undefined}
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
          onInteractOutside={guard}
        >
          <header>
            <div>
              {kicker && <div className="section-kicker">{kicker}</div>}
              <Dialog.Title>{title}</Dialog.Title>
            </div>
            <Dialog.Close className="task-dialog-close" aria-label="Close dialog" disabled={closeDisabled}>
              <X size={17} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
