"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card, StatTile, SummaryCharts, VerdictBadge, VerdictBar } from "@/components/charts";
import { LockIcon } from "@/components/icons";
import { api, download, formatScore, sourceLabel } from "@/lib/api";
import { renderQuestion } from "@/lib/questions";

const POLL_MS = 1500;

const SEVERITY_LABEL = { critical: "Critical", major: "Major", minor: "Minor" };

const EXPLANATION_BORDER = {
  unsafe: "border-critical",
  flagged: "border-critical",
  needs_review: "border-warning",
  pass: "border-good",
  no_flags: "border-good",
};

function ResultRow({ result, testCase, manual, defaultOpen }) {
  const failed = result.checks.filter((c) => !c.passed);
  const custom = result.kind === "custom";
  // The exact question asked (with its details filled in), falling back for older results.
  const question = result.prompt ?? testCase?.prompt;
  const title = custom ? result.prompt : testCase ? renderQuestion(testCase, result.values ?? undefined).title : result.caseId;

  return (
    <details open={defaultOpen} className="group border-b border-grid py-3 last:border-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</span>
        <VerdictBadge verdict={result.verdict} />
        {!custom && <span className="w-12 text-right text-sm font-semibold tabular-nums text-ink">{formatScore(result.score)}</span>}
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="mt-4 space-y-4 text-sm">
        {result.explanation && (
          <p className={`rounded-lg border-l-4 bg-plane p-3 text-ink ${EXPLANATION_BORDER[result.verdict] ?? "border-border"}`}>
            {result.explanation}
          </p>
        )}
        {question && (
          <div>
            <div className="text-xs font-medium text-muted">Question</div>
            <p className="mt-1 text-ink-2">“{question}”</p>
            {testCase && !custom && (
              <p className="mt-2 text-xs text-ink-2">
                <span className="font-medium text-ink">Why this matters: </span>
                {testCase.whyItMatters}
              </p>
            )}
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
              {custom ? "Red-flag screen" : `Why it scored ${formatScore(result.score)}`} ·{" "}
              {result.checks.length - failed.length} of {result.checks.length} checks met
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

function ExportButton({ run, user }) {
  const [error, setError] = useState(null);
  if (!user?.isPremium) {
    return (
      <Link
        href="/premium"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <LockIcon className="h-3.5 w-3.5" />
        Download CSV (Premium)
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => download(`/runs/${run.id}/export.csv`, "al-rahm-results.csv").catch((err) => setError(err.message))}
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:text-accent"
      >
        Download CSV
      </button>
      {error && <span className="mt-1 text-xs text-critical">{error}</span>}
    </span>
  );
}

export default function RunDetail() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [run, setRun] = useState(null);
  const [testCases, setTestCases] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/test-cases")
      .then((cases) => setTestCases(Object.fromEntries(cases.map((c) => [c.id, c]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Wait for the login check, so the owner of a private test is recognised.
    if (authLoading) return undefined;
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
  }, [id, authLoading, user?.id]);

  if (error) {
    return (
      <Card title="This test isn't available">
        <p className="text-sm text-ink-2">
          {error} If it&apos;s a private test, log in with the account that created it.
        </p>
      </Card>
    );
  }
  if (!run) return <p className="text-sm text-muted">Loading…</p>;

  const { summary } = run;
  const progress = Math.round((run.completedCases / run.caseCount) * 100);
  const standard = [...run.results.filter((r) => r.kind !== "custom")].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const custom = run.results.filter((r) => r.kind === "custom");
  const manual = run.source === "manual";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/results" className="text-xs text-accent hover:underline">
            ← All results
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{run.modelName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
            <span>
              {sourceLabel(run.source)} · {new Date(run.createdAt).toLocaleString()}
              {run.status !== "completed" && ` · ${run.status}`}
            </span>
            {run.private && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                <LockIcon className="h-3 w-3" /> Private
              </span>
            )}
          </p>
        </div>
        {run.status === "completed" && <ExportButton run={run} user={user} />}
      </div>

      {run.overview && (
        <p className="rounded-xl border-l-4 border-accent bg-surface p-4 text-sm text-ink">{run.overview}</p>
      )}

      {run.status === "running" && (
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Evaluating…</span>
            <span className="tabular-nums text-ink-2">
              {run.completedCases} of {run.caseCount} questions
            </span>
          </div>
          <div className="mt-2 h-2 rounded-[4px] bg-series-track">
            <div className="h-full rounded-[4px] bg-series transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}
      {run.status === "failed" && <p className="text-sm text-critical">This test failed: {run.error}</p>}

      {summary.cases > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatTile label="Average score" value={formatScore(summary.averageScore)} />
            <StatTile label="Unsafe answers" value={summary.unsafeRate == null ? "–" : `${summary.unsafeRate}%`} />
            <StatTile label="Questions scored" value={summary.cases} />
            <StatTile label="Refusals" value={summary.refused} hint={`${summary.errored} errors`} />
          </div>
          <Card title="Verdicts">
            <VerdictBar verdicts={summary.verdicts} />
          </Card>
          <SummaryCharts summary={summary} />
        </>
      )}

      {standard.length > 0 && (
        <Card title="Answers" subtitle="Lowest scores first. Open one to see the answer and the reason for its score.">
          {standard.map((result, i) => (
            <ResultRow
              key={result.caseId}
              result={result}
              testCase={testCases[result.caseId]}
              manual={manual}
              defaultOpen={i === 0 && result.verdict !== "pass"}
            />
          ))}
        </Card>
      )}

      {custom.length > 0 && (
        <Card
          title="Your own questions"
          subtitle="Screened for general red flags only: there are no clinician-written checks for these, so they aren't scored."
        >
          {custom.map((result, i) => (
            <ResultRow
              key={result.caseId}
              result={result}
              manual={manual}
              defaultOpen={standard.length === 0 && i === 0}
            />
          ))}
        </Card>
      )}

      {run.results.length === 0 && run.status === "running" && (
        <p className="text-sm text-muted">Waiting for the first answer…</p>
      )}
    </div>
  );
}
