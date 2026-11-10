"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn, Dot } from "../ui/kit";

const NAV = [
  { href: "/", label: "Simulate" },
  { href: "/sources", label: "Sources" },
  { href: "/methodology", label: "Methodology" },
];

type Theme = "system" | "light" | "dark";

function ThemeToggle() {
  // Read the theme the boot script applied; it lives on <html>, so there's no storage read during render.
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") queueMicrotask(() => setTheme(t));
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      /* storage unavailable */
    }
  };
  const next: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };
  const icon: Record<Theme, ReactNode> = {
    system: <path d="M3 4h14v9H3zM7 16h6" />,
    dark: <path d="M15 12.5A6 6 0 0 1 7.5 5a6 6 0 1 0 7.5 7.5Z" />,
    light: (
      <>
        <circle cx="10" cy="10" r="3.2" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
      </>
    ),
  };
  return (
    <button
      type="button"
      onClick={() => apply(next[theme])}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-text"
      aria-label={`Theme: ${theme}. Switch to ${next[theme]}`}
      title={`Theme: ${theme}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {icon[theme]}
      </svg>
    </button>
  );
}

function ApiHealth() {
  const [h, setH] = useState<{ ok: boolean; model?: string; catalog?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const ping = () =>
      fetch("/api/v1/health")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => alive && setH({ ok: true, model: j.model_version, catalog: j.catalog_version }))
        .catch(() => alive && setH({ ok: false }));
    ping();
    const t = setInterval(ping, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!h) return null;
  return (
    <span className="hidden items-center gap-2 font-mono text-[11px] text-faint md:inline-flex" title={h.ok ? `catalog ${h.catalog}` : "API unreachable"}>
      <Dot tone={h.ok ? "live" : "error"} pulse={h.ok} label={h.ok ? "API online" : "API offline"} />
      {h.ok ? h.model : "api offline"}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1480px] items-center gap-3 px-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Railsim home">
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
              <circle cx="12" cy="12" r="11" fill="var(--usdc)" />
              <path d="M6 15.5h12M6 8.5h12M9 6v12M15 6v12" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden font-mono text-[13px] font-semibold tracking-[0.14em] sm:inline">RAILSIM</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-0.5">
            {NAV.map((n) => {
              const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn("rounded-md px-2 py-1.5 text-[13px] transition sm:px-2.5", on ? "bg-hover text-text" : "text-muted hover:text-text")}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ApiHealth />
            <span className="hidden rounded border border-warn-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn sm:inline">
              Estimate, not a quote
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-16">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1480px] px-4 py-4 text-[11.5px] leading-5 text-faint">
          Read-only research simulator. No money is moved, no orders are placed, no accounts are created. Every figure is a simulation from public
          order books, reference FX, live chain conditions and versioned tariffs.
        </div>
      </footer>
    </div>
  );
}
