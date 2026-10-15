"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BlossomLogo, HomeIcon, MethodIcon, QuestionsIcon, ResultsIcon, TestIcon, UserIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "./AuthProvider";

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

/** "Log in", or the user's initial (with a Premium badge) linking to their account. */
const noSubscription = () => () => {};

function AccountButton() {
  const { user, loading } = useAuth() ?? {};
  // The nav hydrates inside its own Suspense boundary, often after the login check has
  // finished. Render the same placeholder as the server until hydration is done, so the
  // HTML matches; React then re-renders with the real state.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!hydrated || loading) return <span className="h-9 w-9" aria-hidden />;
  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-ink"
      >
        <UserIcon className="h-4 w-4" />
        Log in
      </Link>
    );
  }
  return (
    <Link
      href="/account"
      aria-label={`Your account${user.isPremium ? " (Premium)" : ""}`}
      title="Your account"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink"
    >
      {user.name.trim().charAt(0).toUpperCase()}
      {user.isPremium && (
        <span className="absolute -right-1 -bottom-1 rounded-full border-2 border-surface bg-warning px-1 text-[9px] font-bold leading-3 text-black">
          ★
        </span>
      )}
    </Link>
  );
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
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <AccountButton />
          </div>
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
