"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_KEY } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The theme actually showing: the saved choice if there is one, otherwise the device setting. */
function currentTheme() {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "light" || chosen === "dark") return chosen;
  return darkQuery().matches ? "dark" : "light";
}

function subscribe(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const query = darkQuery();
  query.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    query.removeEventListener("change", onChange);
  };
}

// Point the theme-color tags at the chosen theme so an installed app's status bar matches.
function syncThemeColor(theme) {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLORS[theme]);
  }
}

export function ThemeToggle({ className = "" }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  useEffect(() => {
    if (theme && document.documentElement.hasAttribute("data-theme")) syncThemeColor(theme);
  }, [theme]);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage unavailable: the choice still applies for this visit.
    }
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-2 hover:text-ink ${className}`}
    >
      {/* Before hydration the theme is unknown on the server; show the moon as a neutral default. */}
      {theme === "dark" ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
    </button>
  );
}
