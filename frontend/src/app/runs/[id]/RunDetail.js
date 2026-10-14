"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, StatTile, SummaryCharts, VerdictBadge, VerdictBar } from "@/components/charts";
import { api, formatScore, sourceLabel } from "@/lib/api";

const POLL_MS = 1500;

const SEVERITY_LABEL = { critical: "Critical", major: "Major", minor: "Minor" };

function ResultRow({ result, testCase, manual, defaultOpen }) {
  const failed = result.checks.filter((c) => !c.passed);
  return (
    <details open={defaultOpen} className="group border-b border-grid py-3 last:border-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{testCase?.title ?? result.caseId}</span>
        <VerdictBadge verdict={result.verdict} />
        <span className="w-12 text-right text-sm font-semibold tabular-nums text-ink">{formatScore(result.score)}</span>
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="mt-4 space-y-4 text-sm">
        {result.explanation && (
          <p
            className={`rounded-lg border-l-4 bg-plane p-3 text-ink ${
              result.verdict === "unsafe" ? "border-critical" : result.verdict === "needs_review" ? "border-warning" : "border-good"
            }`}
          >
            {result.explanation}
          </p>
        )}
        {testCase && (
          <div>
            <div className="text-xs font-medium text-muted">Question</div>
            <p className="mt-1 text-ink-2">“{testCase.prompt}”</p>
            <p className="mt-2 text-xs text-ink-2">
              <span className="font-medium text-ink">Why this matters: </span>
              {testCase.whyItMatters}
            </p>
          </div>
        )}
        <div>
          <div className="text-xs font-medium text-muted">
            Chatbot&apos;s answer{result.refused && " (refused)"}
            {!manual && result.latencyMs != null && ` · ${(result.latencyMs / 1000).toFixed(1)}s`}
          </div>
          {result.error ? (
            <p className="mt-1 text-critical">Error: {result.error}</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-plane p-3 text-ink">{result.response || "(empty)"}</p>
          )}
        </div>
        {result.checks.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted">
              Why it scored {formatScore(result.score)} · {result.checks.length - failed.length} of{" "}
              {result.checks.length} checks met
            </div>
            <ul className="mt-2 space-y-2">
              {result.checks.map((check) => (
                <li key={check.id} className="flex gap-2">
                  <span className={`mt-0.5 ${check.passed ? "text-good-ink" : "text-critical"}`} aria-hidden>
                    {check.passed ? "✓" : "✕"}
                  </span>
                  <span className="text-ink-2">
                    {check.reason ?? check.description}{" "}
                    <span className="text-xs text-muted">({SEVERITY_LABEL[check.severity]})</span>
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
        <Link href="/results" className="text-xs text-accent hover:underline">
          ← All results
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{run.modelName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {sourceLabel(run.source)} · {new Date(run.createdAt).toLocaleString()}
          {run.status !== "completed" && ` · ${run.status}`}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatTile label="Average score" value={formatScore(summary.averageScore)} />
        <StatTile label="Unsafe answers" value={summary.unsafeRate == null ? "–" : `${summary.unsafeRate}%`} />
        <StatTile label="Questions scored" value={`${run.completedCases}/${run.caseCount}`} />
        <StatTile label="Refusals" value={summary.refused} hint={`${summary.errored} errors`} />
      </div>

      <Card title="Verdicts">
        <VerdictBar verdicts={summary.verdicts} />
      </Card>

      <SummaryCharts summary={summary} />

      <Card title="Answers" subtitle="Lowest scores first. Open one to see the answer and the reason for its score.">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted">Waiting for the first answer…</p>
        ) : (
          sorted.map((result, i) => (
            <ResultRow
              key={result.caseId}
              result={result}
              testCase={testCases[result.caseId]}
              manual={run.source === "manual"}
              defaultOpen={i === 0 && result.verdict !== "pass"}
            />
          ))
        )}
      </Card>
    </div>
  );
}
