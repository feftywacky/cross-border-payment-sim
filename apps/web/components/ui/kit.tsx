"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ surfaces */

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-line bg-panel", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHead({ id, title, sub, right, className }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[13px] font-semibold tracking-tight">
          {title}
        </h2>
        {sub && <p className="mt-0.5 max-w-[68ch] text-xs leading-[18px] text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ controls */

export const inputCls =
  "h-9 rounded-lg border border-line-2 bg-panel-2 px-3 text-sm text-text outline-none transition placeholder:text-faint hover:border-faint focus:border-usdc focus:ring-2 focus:ring-[var(--glow)]";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
        variant === "primary" && "bg-usdc text-white hover:brightness-110",
        variant === "outline" && "border border-line-2 text-text hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-text",
        className,
      )}
      {...rest}
    />
  );
}

/** Radio-group segmented control: real radios, so it is keyboard- and screen-reader-native. */
export function Seg<T extends string>({
  label,
  value,
  onChange,
  options,
  size = "md",
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          title={o.hint}
          className={cn(
            "relative cursor-pointer select-none rounded-md font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-usdc",
            size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-xs",
            value === o.value ? "bg-hover text-text shadow-[inset_0_0_0_1px_var(--line-2)]" : "text-muted hover:text-text",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs transition",
        active ? "border-usdc bg-usdc-soft text-usdc-ink" : "border-line text-muted hover:border-line-2 hover:text-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ labels */

type Tone = "neutral" | "usdc" | "up" | "down" | "warn";

export function Tag({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 font-mono text-[10.5px] font-medium uppercase tracking-wide",
        tone === "neutral" && "bg-hover text-muted",
        tone === "usdc" && "bg-usdc-soft text-usdc-ink",
        tone === "up" && "bg-up-soft text-up",
        tone === "down" && "bg-down-soft text-down",
        tone === "warn" && "bg-warn-soft text-warn",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone, pulse, label }: { tone: "live" | "tariff" | "assumed" | "off" | "error"; pulse?: boolean; label?: string }) {
  const color = { live: "text-up bg-up", tariff: "text-usdc bg-usdc", assumed: "text-warn bg-warn", off: "text-faint bg-faint", error: "text-down bg-down" }[tone];
  return <span role={label ? "img" : undefined} aria-label={label} aria-hidden={!label} className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", color, pulse && "pulse")} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-muted">
      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {label ?? "Loading"}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 truncate text-[15px] font-medium">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-down/30 bg-down-soft px-4 py-3 text-[13px]">
      <span className="font-medium text-down">{title}</span> <span className="text-muted">{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ identity marks */

export type Family = "usdc" | "wise" | "bank";

/** Route-family mark: colour AND shape (circle / diamond / square), so identity never rests on hue alone. */
export function FamilyMark({ family, size = 10 }: { family: Family; size?: number }) {
  const fill = `var(--${family})`;
  const s = size;
  return (
    <svg aria-hidden width={s} height={s} viewBox="0 0 10 10" className="shrink-0">
      {family === "usdc" && <circle cx="5" cy="5" r="4.5" fill={fill} />}
      {family === "wise" && <path d="M5 0.5 9.5 5 5 9.5 0.5 5Z" fill={fill} />}
      {family === "bank" && <rect x="1" y="1" width="8" height="8" rx="1.5" fill={fill} />}
    </svg>
  );
}

/** Two-letter monogram tile for a chain or venue. Neutral ink: 13 chains can't each own a hue. */
export function Glyph({ text, title, kind = "chain", size = "md" }: { text: string; title?: string; kind?: "chain" | "venue" | "bank"; size?: "sm" | "md" }) {
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-semibold uppercase",
        size === "sm" ? "h-4 min-w-4 px-0.5 text-[8.5px]" : "h-6 min-w-6 px-1 text-[10px]",
        kind === "chain" && "rounded-full border border-usdc/40 bg-usdc-soft text-usdc-ink",
        kind === "venue" && "rounded-md border border-line-2 bg-panel-2 text-text",
        kind === "bank" && "rounded-md border border-dashed border-line-2 text-muted",
      )}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ drawer */

export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
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
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[min(760px,100vw)] max-w-none overflow-hidden border-l border-line bg-panel p-0 text-text shadow-2xl"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="eyebrow">{label}</span>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close <kbd className="rounded border border-line px-1 font-mono text-[10px]">esc</kbd>
          </Button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">{open && children}</div>
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ chart tooltip */

/** Floating tooltip positioned in a relatively-positioned chart container. */
export function ChartTip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const flip = x > w * 0.6;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-line-2 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: flip ? undefined : x + 14, right: flip ? w - x + 14 : undefined, top: Math.max(4, y - 12) }}
    >
      {children}
    </div>
  );
}
