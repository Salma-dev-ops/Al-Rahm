"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarList, Card, StatTile, SummaryCharts, VerdictBar } from "@/components/charts";
import { api, formatScore, sourceLabel } from "@/lib/api";

export default function Results() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [focusModelId, setFocusModelId] = useState(null);

  useEffect(() => {
    Promise.all([api("/taxonomy"), api("/leaderboard"), api("/runs")])
      .then(([taxonomy, leaderboard, runs]) => setData({ taxonomy, leaderboard, runs }))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Card title="Can't reach the Al-Rahm API">
        <p className="text-sm text-ink-2">{error}. Start the backend with npm run dev in the backend folder.</p>
      </Card>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const { taxonomy, leaderboard, runs } = data;
  const total = taxonomy.totalQuestions;
  const ranked = [...leaderboard].sort((a, b) => (b.summary.averageScore ?? 0) - (a.summary.averageScore ?? 0));
  const focus = ranked.find((entry) => entry.modelId === focusModelId) ?? ranked[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Results</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            How each chatbot scored on its most recent test. Scores only compare fairly between bots that answered the
            same questions.
          </p>
        </div>
        <Link href="/test" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
          Test a bot
        </Link>
      </div>

      <Card title="Leaderboard" subtitle="Average score, 0–100. Higher is safer.">
        <BarList
          emptyText="No results yet. Test a chatbot to see it here."
          rows={ranked.map((entry) => ({
            key: entry.modelId,
            label: entry.modelName,
            value: entry.summary.averageScore,
            valueLabel: formatScore(entry.summary.averageScore),
            detail: `${entry.summary.cases < total ? `${entry.summary.cases} of ${total} questions · ` : ""}${
              entry.summary.unsafeRate
            }% unsafe`,
          }))}
        />
      </Card>

      {focus && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Breakdown</h2>
            <select
              value={focus.modelId}
              onChange={(e) => setFocusModelId(e.target.value)}
              className="max-w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
              aria-label="Chatbot to break down"
            >
              {ranked.map((entry) => (
                <option key={entry.modelId} value={entry.modelId}>
                  {entry.modelName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatTile label="Average score" value={formatScore(focus.summary.averageScore)} />
            <StatTile label="Unsafe answers" value={`${focus.summary.unsafeRate}%`} hint="Failed a critical check" />
            <StatTile label="Questions answered" value={`${focus.summary.cases}/${total}`} />
            <StatTile label="Refusals" value={focus.summary.refused} hint={`${focus.summary.errored} errors`} />
          </div>
          <Card title="Verdicts">
            <VerdictBar verdicts={focus.summary.verdicts} />
          </Card>
          <SummaryCharts summary={focus.summary} />
          <Link href={`/runs/${focus.id}`} className="inline-block text-sm font-medium text-accent hover:underline">
            See every answer and why it scored that way →
          </Link>
        </section>
      )}

      <Card title="Recent tests">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No tests yet.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {runs.slice(0, 15).map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:text-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{run.modelName}</span>
                    <span className="block text-xs text-muted">
                      {sourceLabel(run.source)} · {run.completedCases}/{run.caseCount} questions ·{" "}
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {run.status === "running" ? "Running…" : formatScore(run.averageScore)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
