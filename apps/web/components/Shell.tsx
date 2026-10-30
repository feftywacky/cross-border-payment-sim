"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "./ui";

/** Two overlapping coins: the sender's currency in ink, the stablecoin leg in the data hue. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("h-6 w-6 flex-none", className)}>
      <circle cx="9" cy="12" r="7" fill="none" stroke="var(--text)" strokeWidth="1.75" />
      <circle cx="15" cy="12" r="7" fill="var(--accent)" />
    </svg>
  );
}

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "Compare routes",
    icon: <path d="M3 5.5h10M10 2.5l3 3-3 3M13 10.5H3M6 7.5l-3 3 3 3" />,
  },
  {
    href: "/sources",
    label: "Sources",
    icon: <path d="M8 2.5c3 0 5.5.9 5.5 2s-2.5 2-5.5 2-5.5-.9-5.5-2 2.5-2 5.5-2zM2.5 4.5v7c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-7M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />,
  },
  {
    href: "/methodology",
    label: "Methodology",
    icon: <path d="M3.5 2.5h7l2 2v9h-9zM5.5 7h5M5.5 9.5h5M5.5 12h3" />,
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition",
                active ? "bg-active text-text" : "text-muted hover:bg-active/60 hover:text-text",
              )}
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                {n.icon}
              </svg>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-2.5">
      <Mark />
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Cross-border simulator</span>
        <span className="block text-xs text-muted">USDC vs conventional routes</span>
      </span>
    </Link>
  );
}

const DISCLAIMER = "Simulation only. No money is moved and no orders are placed. Not financial advice.";

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const current = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label ?? "Saved scenario";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Desktop sidebar, on the page ground with one hairline */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border px-3 pb-5 pt-6 lg:flex">
        <Brand />
        <nav aria-label="Main" className="mt-8">
          <NavList />
        </nav>
        <div className="mt-auto space-y-2 px-2.5 text-xs leading-4 text-muted">
          <p>{DISCLAIMER}</p>
          <p>Reference FX: ECB euro reference rates, Bank of Canada Valet cross-check.</p>
        </div>
      </aside>

      {/* Phone and tablet: a 48px top bar with the screen's name and a menu sheet */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-bg px-4 lg:hidden">
        <Link href="/" onClick={() => setOpen(false)} aria-label="Cross-border simulator home">
          <Mark />
        </Link>
        <span className="mr-auto truncate text-sm font-semibold">{current}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="nav-sheet"
          className="grid h-11 w-11 place-items-center rounded-md text-muted transition hover:bg-active hover:text-text"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            {open ? <path d="M4 4l8 8M12 4l-8 8" /> : <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />}
          </svg>
        </button>
      </header>
      {open && (
        <div id="nav-sheet" className="fixed inset-x-0 bottom-0 top-12 z-20 flex flex-col bg-bg px-4 pb-6 pt-4 lg:hidden">
          <Brand onNavigate={() => setOpen(false)} />
          <nav aria-label="Main" className="mt-6">
            <NavList onNavigate={() => setOpen(false)} />
          </nav>
          <p className="mt-auto px-2.5 text-xs leading-4 text-muted">{DISCLAIMER}</p>
        </div>
      )}

      <main className="min-w-0">{children}</main>
    </div>
  );
}

/** Title row: a noun h1 at 24px, one grey sentence about the data, actions on the right. */
export function PageHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <div className="mt-1 max-w-3xl text-[15px] leading-6 text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** The canvas: one fluid column with a single gutter value (24px on desktop, 16px on a phone). */
export function Canvas({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-4 pb-12 pt-6 sm:px-6 lg:pt-8", className)}>{children}</div>;
}
