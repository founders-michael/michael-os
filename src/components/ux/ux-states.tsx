import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export type PageSkeletonVariant = "dashboard" | "list" | "detail" | "calendar" | "organization";

function Block({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`ux-skeleton-block ${className}`} />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return <section className="ux-skeleton-card" aria-hidden="true">
    <Block className="ux-skeleton-title" />
    {Array.from({ length: rows }, (_, index) => <Block key={index} className={`ux-skeleton-line ux-skeleton-line-${index % 3}`} />)}
  </section>;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="ux-table-skeleton" aria-hidden="true">
    <div className="ux-table-skeleton-head"><Block /><Block /><Block /><Block /></div>
    {Array.from({ length: rows }, (_, index) => <div className="ux-table-skeleton-row" key={index}><Block /><Block /><Block /><Block /></div>)}
  </div>;
}

export function FormSkeleton() {
  return <CardSkeleton rows={5} />;
}

export function PageSkeleton({ variant = "list", label = "Loading page" }: { variant?: PageSkeletonVariant; label?: string }) {
  return <main className={`ux-page-skeleton ux-page-skeleton-${variant}`} aria-label={label} aria-busy="true" role="status">
    <span className="sr-only">{label}</span>
    <div className="ux-skeleton-heading"><Block className="ux-skeleton-eyebrow" /><Block className="ux-skeleton-page-title" /><Block className="ux-skeleton-subtitle" /></div>
    {variant === "dashboard" && <>
      <div className="ux-skeleton-stat-grid">{Array.from({ length: 4 }, (_, index) => <CardSkeleton key={index} rows={1} />)}</div>
      <div className="ux-skeleton-hero"><Block className="ux-skeleton-title" /><Block className="ux-skeleton-line" /><Block className="ux-skeleton-line ux-skeleton-line-2" /></div>
      <div className="ux-skeleton-columns"><CardSkeleton rows={5} /><CardSkeleton rows={4} /></div>
    </>}
    {variant === "list" && <><div className="ux-skeleton-toolbar"><Block /><Block /><Block /></div><TableSkeleton /></>}
    {variant === "detail" && <div className="ux-skeleton-columns"><CardSkeleton rows={6} /><CardSkeleton rows={4} /></div>}
    {variant === "organization" && <div className="ux-skeleton-columns"><CardSkeleton rows={5} /><CardSkeleton rows={4} /></div>}
    {variant === "calendar" && <><div className="ux-skeleton-toolbar"><Block /><Block /><Block /></div><div className="ux-calendar-skeleton">{Array.from({ length: 35 }, (_, index) => <Block key={index} />)}</div></>}
  </main>;
}

export function EmptyState({ icon, title, description, action, secondaryAction, className = "" }: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return <section className={`ux-empty-state ${className}`}>
    {icon && <span className="ux-empty-icon" aria-hidden="true">{icon}</span>}
    <h2>{title}</h2>
    <p>{description}</p>
    {(action || secondaryAction) && <div className="ux-empty-actions">{action}{secondaryAction}</div>}
  </section>;
}

export function ErrorState({ title = "This page couldn’t load", description = "Try again. Your saved information is unchanged.", onRetry, action }: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return <section className="ux-error-state" role="alert">
    <span className="ux-error-mark" aria-hidden="true">!</span>
    <h2>{title}</h2><p>{description}</p>
    <div className="ux-empty-actions">{onRetry && <button className="ux-action-primary" type="button" onClick={onRetry}>Try again</button>}{action}</div>
  </section>;
}

export function InlineError({ children, onRetry, className = "" }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return <div className={`ux-inline-error ${className}`} role="alert"><span>{children}</span>{onRetry && <button type="button" onClick={onRetry}>Retry</button>}</div>;
}

export function LoadingButton({ loading = false, children, className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return <button {...props} className={`ux-loading-button ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading && <LoaderCircle size={15} className="ux-loading-icon" aria-hidden="true" />}{children}
  </button>;
}

