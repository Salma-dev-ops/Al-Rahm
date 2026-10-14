"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarList, Card, StatTile, SummaryCharts, VerdictBar } from "@/components/charts";
import { api, formatScore } from "@/lib/api";

function RunEvaluationForm({ models, specialties }) {
  const router = useRouter();
  const [modelId, setModelId] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedModel = models.find((m) => m.id === (modelId || models[0]?.id));

  async function start(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const run = await api("/runs", {
        method: "POST",
        body: JSON.stringify({ modelId: selectedModel.id, specialty: specialty || undefined }),
      });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Card title="Run an evaluation" subtitle="Send every test case to a model and score its answers">
      <form onSubmit={start} className="space-y-3">
        <label className="block text-xs text-ink-2">
          Model
          <select
            value={selectedModel?.id ?? ""}
            onChange={(e) => setModelId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-plane px-2 py-1.5 text-sm text-ink"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {selectedModel && <p className="text-xs text-muted">{selectedModel.description}</p>}
        <label className="block text-xs text-ink-2">
          Specialty
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-plane px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All specialties</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting || !selectedModel}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start evaluation"}
        </button>
        {error && <p className="text-sm text-critical">{error}</p>}
      </form>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [focusModelId, setFocusModelId] = useState(null);

  useEffect(() => {
    Promise.all([api("/models"), api("/taxonomy"), api("/leaderboard"), api("/runs")])
      .then(([models, taxonomy, leaderboard, runs]) => setData({ models, taxonomy, leaderboard, runs }))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Card title="Can't reach the Al-Rahm API">
        <p className="text-sm text-ink-2">
          {error}. Start the backend with <code className="font-mono">npm run dev</code> in the{" "}
          <code className="font-mono">backend</code> folder.
        </p>
      </Card>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const { models, taxonomy, leaderboard, runs } = data;
  const ranked = [...leaderboard].sort((a, b) => (b.summary.averageScore ?? 0) - (a.summary.averageScore ?? 0));
  const focus = ranked.find((entry) => entry.modelId === focusModelId) ?? ranked[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Women&apos;s health model safety</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          How safely do AI models answer women&apos;s health questions? Each model is tested on real-world scenarios
          and scored on whether it spots emergencies, gives safe medication advice and avoids dismissive answers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Leaderboard" subtitle="Average score from each model's latest completed run">
            <BarList
              emptyText="No completed runs yet. Start an evaluation to see results."
              rows={ranked.map((entry) => ({
                key: entry.modelId,
                label: entry.modelName,
                value: entry.summary.averageScore,
                valueLabel: formatScore(entry.summary.averageScore),
                detail: `${entry.summary.unsafeRate}% unsafe`,
              }))}
            />
          </Card>
        </div>
        <RunEvaluationForm models={models} specialties={taxonomy.specialties} />
      </div>

      {focus && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Breakdown</h2>
            <select
              value={focus.modelId}
              onChange={(e) => setFocusModelId(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
              aria-label="Model to break down"
            >
              {ranked.map((entry) => (
                <option key={entry.modelId} value={entry.modelId}>
                  {entry.modelName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Average score" value={formatScore(focus.summary.averageScore)} />
            <StatTile label="Unsafe answers" value={`${focus.summary.unsafeRate}%`} hint="Failed a critical check" />
            <StatTile label="Cases tested" value={focus.summary.cases} />
            <StatTile label="Refusals" value={focus.summary.refused} hint={`${focus.summary.errored} errors`} />
          </div>
          <Card title="Verdicts">
            <VerdictBar verdicts={focus.summary.verdicts} />
          </Card>
          <SummaryCharts summary={focus.summary} />
          <Link href={`/runs/${focus.id}`} className="inline-block text-sm text-accent hover:underline">
            See every answer from this run →
          </Link>
        </section>
      )}

      <Card title="Recent runs">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-grid">
                  <th className="py-2 pr-4 font-normal">Model</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 text-right font-normal">Cases</th>
                  <th className="py-2 pr-4 text-right font-normal">Score</th>
                  <th className="py-2 font-normal">Started</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {runs.slice(0, 10).map((run) => (
                  <tr key={run.id} className="border-b border-grid last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/runs/${run.id}`} className="text-ink hover:text-accent hover:underline">
                        {run.modelName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-ink-2">{run.status}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">
                      {run.completedCases}/{run.caseCount}
                    </td>
                    <td className="py-2 pr-4 text-right text-ink">{formatScore(run.averageScore)}</td>
                    <td className="py-2 text-ink-2">{new Date(run.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
