"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, formatDate } from "@/lib/api";

const POLL_MS = 2000;

const FEATURES = [
  ["All question packs and the full benchmark", true, true],
  ["Score + explanation for every answer", true, true],
  ["Adjust question details", true, true],
  ["Your own questions per test", "2", "20"],
  ["Test history in your account", "With a free account", true],
  ["Keep results private (off the leaderboard)", false, true],
  ["Download results as a spreadsheet (CSV)", false, true],
  ["SMS when a test finishes", false, true],
];

function Cell({ value }) {
  if (value === true) return <span className="text-good-ink" aria-label="Included">✓</span>;
  if (value === false) return <span className="text-muted" aria-label="Not included">–</span>;
  return <span className="text-ink-2">{value}</span>;
}

function MpesaCheckout({ user, plans, onPaid }) {
  const [phone, setPhone] = useState(user.phone ? `0${user.phone.slice(3)}` : "");
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function poll(id) {
    try {
      const next = await api(`/payments/${id}`);
      setPayment(next);
      if (next.status === "pending") timer.current = setTimeout(() => poll(id), POLL_MS);
      else if (next.status === "paid") onPaid();
    } catch (err) {
      setError(err.message);
    }
  }

  async function pay(event) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const started = await api("/payments/premium", { method: "POST", body: JSON.stringify({ phone }) });
      setPayment(started);
      timer.current = setTimeout(() => poll(started.id), POLL_MS);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (payment?.status === "pending") {
    return (
      <div className="space-y-3 text-center" role="status">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-accent" aria-hidden />
        <p className="font-semibold text-ink">Check your phone</p>
        <p className="text-sm text-ink-2">
          Enter your M-Pesa PIN on <strong className="text-ink">+{payment.phone}</strong> to pay KES {payment.amount}. This page
          updates by itself.
        </p>
        {payment.mode === "mock" && (
          <p className="text-xs text-muted">Demo mode: no real money moves. The payment completes in a few seconds.</p>
        )}
      </div>
    );
  }

  if (payment?.status === "paid") {
    return (
      <div className="space-y-2 text-center" role="status">
        <p className="text-3xl" aria-hidden>
          🌸
        </p>
        <p className="font-semibold text-ink">Payment received. Welcome to Premium!</p>
        <p className="text-sm text-ink-2">M-Pesa receipt {payment.receipt}. A confirmation SMS is on its way.</p>
      </div>
    );
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      {payment && (
        <p className="rounded-lg bg-plane p-3 text-sm text-critical" role="alert">
          {payment.status === "cancelled" ? "The payment was cancelled on the phone." : "The payment didn't go through."}{" "}
          {payment.message && <span className="text-ink-2">({payment.message})</span>} You can try again.
        </p>
      )}
      <label className="block text-sm text-ink-2">
        Safaricom number to pay from
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          required
          placeholder="0712 345 678"
          className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
      </label>
      {error && (
        <p className="text-sm text-critical" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-[#1f7a2c] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {sending ? "Sending prompt…" : `Pay KES ${plans.premium.priceKes} with M-Pesa`}
      </button>
      <p className="text-xs text-muted">
        You&apos;ll get a prompt on your phone to enter your M-Pesa PIN. Premium lasts {plans.premium.days} days and doesn&apos;t
        renew automatically. We&apos;ll text you before it ends.
        {plans.paymentsMode === "mock" && " Demo mode is on: no real money moves."}
      </p>
    </form>
  );
}

export default function Premium() {
  const { user, loading, refresh } = useAuth();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/plans")
      .then(setPlans)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-critical">{error}</p>;
  if (!plans || loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <p className="text-sm font-medium text-accent">Al-Rahm Premium</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">For teams who test their chatbot often</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-2">
          Every safety finding stays free for everyone. Premium adds privacy, exports and alerts for the people building
          and buying health chatbots. No ads, ever.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface md:col-span-3">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-grid">
                <th className="p-3 font-normal text-muted">Feature</th>
                <th className="p-3 text-center font-semibold text-ink">Free</th>
                <th className="p-3 text-center font-semibold text-accent">Premium</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(([label, free, premium]) => (
                <tr key={label} className="border-b border-grid last:border-0">
                  <td className="p-3 text-ink">{label}</td>
                  <td className="p-3 text-center">
                    <Cell value={free} />
                  </td>
                  <td className="p-3 text-center">
                    <Cell value={premium} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="order-first rounded-xl border-2 border-accent bg-surface p-5 md:order-none md:col-span-2">
          <div className="text-sm font-medium text-accent">Premium pass</div>
          <div className="mt-1 text-3xl font-semibold text-ink">
            KES {plans.premium.priceKes}
            <span className="text-base font-normal text-ink-2"> / {plans.premium.days} days</span>
          </div>
          <div className="mt-5">
            {!user ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">Create a free account first, then pay with M-Pesa.</p>
                <Link
                  href="/login?mode=signup&next=/premium"
                  className="block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-medium text-accent-ink"
                >
                  Create account
                </Link>
                <Link href="/login?next=/premium" className="block text-center text-sm text-accent hover:underline">
                  I already have an account
                </Link>
              </div>
            ) : (
              // One checkout in one place, so its "payment received" message survives the
              // switch to Premium when the account refreshes.
              <div className="space-y-3">
                {user.isPremium && (
                  <>
                    <p className="text-sm text-ink">
                      ★ You&apos;re Premium until <strong>{formatDate(user.premiumUntil)}</strong>.
                    </p>
                    <p className="text-xs text-muted">Paying again adds {plans.premium.days} more days.</p>
                  </>
                )}
                <MpesaCheckout user={user} plans={plans} onPaid={refresh} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
