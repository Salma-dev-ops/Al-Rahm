"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/charts";
import { LockIcon } from "@/components/icons";
import { api, formatDate, formatScore, sourceLabel } from "@/lib/api";

const inputClass = "mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink";

function ProfileForm({ user, onSaved }) {
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone ? `0${user.phone.slice(3)}` : "",
    smsAlerts: user.smsAlerts,
  });
  const [status, setStatus] = useState(null);

  async function save(event) {
    event.preventDefault();
    setStatus(null);
    try {
      const updated = await api("/me", {
        method: "PATCH",
        body: JSON.stringify({ name: form.name, phone: form.phone || null, smsAlerts: form.smsAlerts }),
      });
      onSaved(updated);
      setStatus({ ok: true, text: "Saved." });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm text-ink-2">
        Name
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
      </label>
      <label className="block text-sm text-ink-2">
        Email
        <input value={user.email} disabled className={`${inputClass} opacity-60`} />
      </label>
      <label className="block text-sm text-ink-2">
        Phone number
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          type="tel"
          inputMode="tel"
          placeholder="0712 345 678"
          className={inputClass}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.smsAlerts}
          onChange={(e) => setForm({ ...form, smsAlerts: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          SMS alerts
          <span className="block text-xs text-ink-2">
            A text when a test finishes{user.isPremium ? "" : " (Premium)"}, and a reminder before Premium ends.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink">
          Save
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? "text-good-ink" : "text-critical"}`} role="status">
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

export default function Account() {
  const router = useRouter();
  const { user, loading, setUser, logout } = useAuth();
  const [runs, setRuns] = useState(null);
  const [sms, setSms] = useState([]);
  const [payments, setPayments] = useState([]);
  const [smsMode, setSmsMode] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api("/me/runs"), api("/me/sms"), api("/me/payments"), api("/plans")])
      .then(([myRuns, messages, myPayments, plans]) => {
        setRuns(myRuns);
        setSms(messages);
        setPayments(myPayments);
        setSmsMode(plans.smsMode);
      })
      .catch(() => setRuns([]));
  }, [user]);

  if (loading || !user) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Hi, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-2">{user.email}</p>
        </div>
        <button
          onClick={async () => {
            await logout();
            router.push("/");
          }}
          className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-ink-2 hover:text-ink"
        >
          Log out
        </button>
      </div>

      <div className={`rounded-xl p-5 ${user.isPremium ? "border-2 border-accent bg-surface" : "bg-accent-soft"}`}>
        {user.isPremium ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">★ Premium</p>
              <p className="text-sm text-ink-2">Active until {formatDate(user.premiumUntil)}.</p>
            </div>
            <Link href="/premium" className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent">
              Add more time
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Free plan</p>
              <p className="text-sm text-ink-2">Private results, CSV exports and SMS alerts come with Premium.</p>
            </div>
            <Link href="/premium" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
              Upgrade with M-Pesa
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Your tests">
            {runs === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-ink-2">
                No tests yet.{" "}
                <Link href="/test" className="text-accent hover:underline">
                  Test a chatbot
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-grid">
                {runs.map((run) => (
                  <li key={run.id}>
                    <Link href={`/runs/${run.id}`} className="flex items-center gap-4 py-3 hover:text-accent">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                          {run.private && <LockIcon className="h-3.5 w-3.5 shrink-0 text-muted" />}
                          {run.modelName}
                        </span>
                        <span className="block text-xs text-muted">
                          {sourceLabel(run.source)} · {run.completedCases} questions · {formatDate(run.createdAt)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-ink">{formatScore(run.averageScore)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Text messages" subtitle="The most recent SMS sent to you">
            {smsMode === "mock" && (
              <p className="mb-3 rounded-lg bg-plane p-2 text-xs text-muted">
                Demo mode: SMS are recorded here but not actually sent until Africa&apos;s Talking keys are added.
              </p>
            )}
            {sms.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-3">
                {sms.map((m, i) => (
                  <li key={i} className="rounded-lg bg-plane p-3 text-sm">
                    <p className="text-ink">{m.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      To +{m.phone} · {new Date(m.created_at).toLocaleString()} · {m.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <ProfileForm user={user} onSaved={setUser} />
          </Card>
          <Card title="Payments">
            {payments.length === 0 ? (
              <p className="text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-grid text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="block text-ink">KES {p.amount}</span>
                      <span className="block text-xs text-muted">
                        {formatDate(p.createdAt)}
                        {p.receipt && ` · ${p.receipt}`}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-medium ${p.status === "paid" ? "text-good-ink" : p.status === "pending" ? "text-ink-2" : "text-critical"}`}
                    >
                      {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
