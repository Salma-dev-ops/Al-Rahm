"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlossomLogo, HomeIcon, MethodIcon, QuestionsIcon, ResultsIcon, TestIcon } from "./icons";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/test", label: "Test a bot", icon: TestIcon },
  { href: "/results", label: "Results", icon: ResultsIcon },
  { href: "/questions", label: "Questions", icon: QuestionsIcon },
  { href: "/method", label: "Method", icon: MethodIcon },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  // A run's page belongs to the Results section.
  if (href === "/results" && pathname?.startsWith("/runs/")) return true;
  return pathname?.startsWith(href);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-accent">
      <BlossomLogo className="h-7 w-7" />
      <span className="text-lg font-semibold tracking-tight text-ink">Al-Rahm</span>
    </Link>
  );
}

/**
 * Top bar on every screen; on phones the sections move to a bottom tab bar
 * (thumb-reachable, like a native app). Takes the pathname as a prop so it can also be
 * rendered, with nothing highlighted, as the Suspense fallback.
 */
export function NavBar({ pathname }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Brand />
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/test"
            className="ml-auto rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink md:hidden"
          >
            Test a bot
          </Link>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV_ITEMS.map(({ href, label, icon: NavIcon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                    active ? "font-medium text-accent" : "text-muted"
                  }`}
                >
                  <span className={`rounded-full px-3 py-0.5 ${active ? "bg-accent-soft" : ""}`}>
                    <NavIcon className="h-5 w-5" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function AppNav() {
  return <NavBar pathname={usePathname()} />;
}
