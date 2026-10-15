"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context; fall back for plain-http deployments.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", className = "" }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    await copyText(typeof text === "function" ? text() : text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-2 hover:text-ink ${className}`}
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-good-ink" /> : <CopyIcon className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
