"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** White panel on the ground: a 1px edge, 8px corners, no shadow. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, right, id }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "accent" | "warn" | "ok" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-active text-text",
  accent: "bg-accent-soft text-accent-ink",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok-ink",
  danger: "bg-danger-soft text-danger-ink",
};

/** Pale-tint pill with dark text of the same hue; sits beside a value, never above a heading. */
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex flex-none items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

/** Route-type mark: a filled dot in the data hue for USDC, a hollow ink ring for conventional routes. */
export function Dot({ tone, className }: { tone: "accent" | "conv" | "warn" | "ok" | "danger" | "neutral"; className?: string }) {
  if (tone === "conv") return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full border-[1.5px] border-conv", className)} />;
  const bg = { accent: "bg-accent", warn: "bg-warn", ok: "bg-ok", danger: "bg-danger", neutral: "bg-faint" }[tone];
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", bg, className)} />;
}

export function Button({
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const v = {
    primary: "bg-primary text-primary-ink hover:opacity-85",
    secondary: "bg-active text-text hover:bg-border-strong/60",
    ghost: "text-muted hover:bg-surface-2 hover:text-text",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        v,
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-4 text-faint">{hint}</p>}
    </div>
  );
}

export const inputBase =
  "h-9 min-w-0 rounded-md border border-border-strong bg-surface px-2.5 text-sm tabular outline-none transition hover:border-faint focus:border-accent focus:ring-2 focus:ring-accent/25";
export const inputCls = `w-full ${inputBase}`;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 flex-none items-center rounded-md bg-active p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 whitespace-nowrap rounded-[5px] px-3 text-[13px] font-medium transition",
            value === o.value ? "bg-surface text-text" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 flex-none", className)} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** Collapsible section: a quiet one-line summary that expands on demand. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group", className)}>
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-muted transition hover:text-text">
        <Chevron className="transition group-open:rotate-90" />
        {summary}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Side drawer built on the native <dialog> (focus trap + Esc handled by the browser). It floats, so it may cast a shadow. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl border-l border-border bg-surface p-0 text-text shadow-2xl"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="min-w-0 text-base font-semibold leading-6">{title}</div>
        <button onClick={onClose} aria-label="Close details" className="-mr-2 grid h-8 w-8 flex-none place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-text">
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="px-6 pb-10 pt-6">{children}</div>
    </dialog>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-border-strong border-t-text" />
      {label}
    </span>
  );
}

/** Flat grey bar at the size of the value it stands in for (loading state; no shimmer). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded bg-active", className)} />;
}

/** Route path "A → B → C" with muted arrows so the eye reads the hops, not the punctuation. */
export function RoutePath({ label, className }: { label: string; className?: string }) {
  const parts = label.split(/\s*→\s*/);
  return (
    <span className={className} title={label}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-faint"> → </span>}
          {p.split(/(\s*\([^)]*\)?)/).map((seg, j) =>
            seg.trimStart().startsWith("(") ? (
              <span key={j} className="text-muted">{seg}</span>
            ) : (
              seg
            ),
          )}
        </span>
      ))}
    </span>
  );
}
