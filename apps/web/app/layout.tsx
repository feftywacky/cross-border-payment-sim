import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-display-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Stablecoin Cross-Border Simulator",
  description: "Research simulator comparing USDC routes across exchanges and blockchains with conventional cross-border payments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header>
          <nav className="mx-auto flex w-full max-w-[1080px] items-center gap-5 px-5 py-5 text-sm">
            <Link href="/" className="mr-auto flex items-center gap-2 whitespace-nowrap font-medium tracking-tight">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-text text-[11px] text-bg">⇄</span>
              Cross-border simulator
            </Link>
            <Link href="/sources" className="text-muted transition hover:text-text">Sources</Link>
            <Link href="/methodology" className="text-muted transition hover:text-text">Methodology</Link>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mx-auto w-full max-w-[1080px] px-5 py-8 text-[11px] leading-relaxed text-faint">
          Simulation only — no money is moved, no orders are placed. Not financial advice. Reference FX: ECB (attribution required) · Bank of Canada Valet.
        </footer>
      </body>
    </html>
  );
}
