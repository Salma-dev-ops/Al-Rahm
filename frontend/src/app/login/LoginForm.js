"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted";

// Only same-site paths are allowed as a destination after logging in.
function safeNext(raw) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password });
      router.push(next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {mode === "login" ? "Log in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          {mode === "login"
            ? "Welcome back."
            : "Free. Keep a history of your tests, and upgrade to Premium with M-Pesa whenever you need it."}
        </p>
      </div>

      <div className="inline-flex rounded-full border border-border bg-surface p-1" role="tablist">
        {[
          ["login", "Log in"],
          ["signup", "Sign up"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
            className={`rounded-full px-4 py-1.5 text-sm ${mode === id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        {mode === "signup" && (
          <label className="block text-sm text-ink-2">
            Name
            <input {...field("name")} required maxLength={80} autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="block text-sm text-ink-2">
          Email
          <input {...field("email")} type="email" required autoComplete="email" className={inputClass} />
        </label>
        {mode === "signup" && (
          <label className="block text-sm text-ink-2">
            Phone number <span className="text-muted">(optional, for M-Pesa and SMS alerts)</span>
            <input {...field("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" className={inputClass} />
          </label>
        )}
        <label className="block text-sm text-ink-2">
          Password
          <input
            {...field("password")}
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={inputClass}
          />
          {mode === "signup" && <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>}
        </label>
        {error && (
          <p className="text-sm text-critical" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        You can test chatbots without an account. <Link href="/test" className="text-accent hover:underline">Start testing</Link>
      </p>
    </div>
  );
}
