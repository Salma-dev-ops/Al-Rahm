"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, StatTile, SummaryCharts, VerdictBadge, VerdictBar } from "@/components/charts";
import { api, formatScore } from "@/lib/api";

const POLL_MS = 1500;

function ResultRow({ result, testCase }) {
  const failed = result.checks.filter((c) => !c.passed);
  return (
    <details className="group border-b border-grid py-3 last:border-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0 flex-1 text-sm text-ink">{testCase?.title ?? result.caseId}</span>
        <VerdictBadge verdict={result.verdict} />
        <span className="w-12 text-right text-sm font-medium tabular-nums text-ink">{formatScore(result.score)}</span>
        <span className="text-xs text-muted group-open:rotate-90">›</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {testCase && (
          <div>
            <div className="text-xs text-muted">Question</div>
            <p className="mt-1 text-ink-2">{testCase.prompt}</p>
          </div>
        )}
        <div>
          <div className="text-xs text-muted">
            Model answer{result.refused && " (refused)"}
            {result.latencyMs != null && ` · ${(result.latencyMs / 1000).toFixed(1)}s`}
          </div>
          {result.error ? (
            <p className="mt-1 text-critical">Error: {result.error}</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-plane p-3 text-ink">{result.response || "(empty)"}</p>
          )}
        </div>
        {result.checks.length > 0 && (
          <div>
            <div className="text-xs text-muted">
              Checks · {result.checks.length - failed.length} of {result.checks.length} passed
            </div>
            <ul className="mt-1 space-y-1.5">
              {result.checks.map((check) => (
                <li key={check.id} className="flex gap-2">
                  <span className={check.passed ? "text-good-ink" : "text-critical"} aria-hidden>
                    {check.passed ? "✓" : "✕"}
                  </span>
                  <span className="text-ink-2">
                    <span className="sr-only">{check.passed ? "Passed: " : "Failed: "}</span>
                    {check.description}{" "}
                    <span className="text-xs text-muted">({check.severity})</span>
                    {!check.passed && check.evidence && (
                      <span className="block text-xs text-muted">Found: “…{check.evidence}…”</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export default function RunDetail() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [testCases, setTestCases] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/test-cases")
      .then((cases) => setTestCases(Object.fromEntries(cases.map((c) => [c.id, c]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let timer;
    let cancelled = false;
    async function load() {
      try {
        const next = await api(`/runs/${id}`);
        if (cancelled) return;
        setRun(next);
        if (next.status === "running") timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <p className="text-sm text-critical">{error}</p>;
  if (!run) return <p className="text-sm text-muted">Loading…</p>;

  const { summary } = run;
  const progress = Math.round((run.completedCases / run.caseCount) * 100);
  const sorted = [...run.results].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted">Evaluation run</p>
        <h1 className="text-2xl font-semibold text-ink">{run.modelName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          Started {new Date(run.createdAt).toLocaleString()} · {run.status}
        </p>
      </div>

      {run.status === "running" && (
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Evaluating…</span>
            <span className="tabular-nums text-ink-2">
              {run.completedCases} of {run.caseCount} cases
            </span>
          </div>
          <div className="mt-2 h-2 rounded-[4px] bg-series-track">
            <div className="h-full rounded-[4px] bg-series transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}
      {run.status === "failed" && <p className="text-sm text-critical">This run failed: {run.error}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Average score" value={formatScore(summary.averageScore)} />
        <StatTile label="Unsafe answers" value={summary.unsafeRate == null ? "–" : `${summary.unsafeRate}%`} />
        <StatTile label="Cases scored" value={`${run.completedCases}/${run.caseCount}`} />
        <StatTile label="Refusals" value={summary.refused} hint={`${summary.errored} errors`} />
      </div>

      <Card title="Verdicts">
        <VerdictBar verdicts={summary.verdicts} />
      </Card>

      <SummaryCharts summary={summary} />

      <Card title="Answers" subtitle="Lowest scores first. Open a case to see the answer and which checks failed.">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted">Waiting for the first answer…</p>
        ) : (
          sorted.map((result) => <ResultRow key={result.caseId} result={result} testCase={testCases[result.caseId]} />)
        )}
      </Card>
    </div>
  );
}
