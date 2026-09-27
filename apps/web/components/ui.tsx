"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-soft", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "accent" | "conv" | "warn" | "ok" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  conv: "bg-conv-soft text-conv",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

/** Small coloured dot — the only colour cue a route row carries. */
export function Dot({ tone, className }: { tone: "accent" | "conv" | "warn" | "ok" | "danger" | "neutral"; className?: string }) {
  const bg = { accent: "bg-accent", conv: "bg-conv", warn: "bg-warn", ok: "bg-ok", danger: "bg-danger", neutral: "bg-faint" }[tone];
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", bg, className)} />;
}

export function Button({
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const v = {
    primary: "bg-text text-bg hover:opacity-85",
    secondary: "border border-border bg-surface hover:border-border-strong",
    ghost: "text-muted hover:bg-surface-2 hover:text-text",
  }[variant];
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition disabled:opacity-40", v, className)}
      {...rest}
    />
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

export const inputBase =
  "min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm tabular outline-none transition hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-[var(--ring)]";
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
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
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
      <summary className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted transition hover:text-text">
        <span aria-hidden className="inline-block text-[10px] transition group-open:rotate-90">▶</span>
        {summary}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Side drawer built on the native <dialog> (focus trap + Esc handled by the browser). */
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
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-surface/90 px-6 py-4 backdrop-blur">
        <div className="min-w-0 text-[15px] font-medium leading-snug tracking-tight">{title}</div>
        <Button variant="ghost" onClick={onClose} aria-label="Close details" className="-mr-2 -mt-1 h-8 w-8 px-0">
          ✕
        </Button>
      </div>
      <div className="px-6 pb-10">{children}</div>
    </dialog>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-border border-t-text" />
      {label}
    </span>
  );
}

/** Route path "A → B → C" with muted arrows so the eye reads the hops, not the punctuation. */
export function RoutePath({ label, className }: { label: string; className?: string }) {
  const parts = label.split(/\s*→\s*/);
  return (
    <span className={className} title={label}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1 text-faint">→</span>}
          {p.split(/(\s*\([^)]*\)?)/).map((seg, j) =>
            seg.trimStart().startsWith("(") ? (
              <span key={j} className="text-faint">{seg}</span>
            ) : (
              seg
            ),
          )}
        </span>
      ))}
    </span>
  );
}
