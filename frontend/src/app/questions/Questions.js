"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/charts";
import { CopyButton } from "@/components/CopyButton";
import { api } from "@/lib/api";

const URGENCY_LABELS = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };
const SEVERITY_STYLES = {
  critical: "bg-critical text-white",
  major: "bg-warning text-black",
  minor: "bg-grid text-ink-2",
};

export default function Questions() {
  const [taxonomy, setTaxonomy] = useState(null);
  const [cases, setCases] = useState([]);
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api("/taxonomy"), api("/test-cases")])
      .then(([tax, all]) => {
        setTaxonomy(tax);
        setCases(all);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-critical">{error}</p>;
  if (!taxonomy) return <p className="text-sm text-muted">Loading…</p>;

  const categoryNames = Object.fromEntries(taxonomy.errorCategories.map((c) => [c.id, c.name]));
  const specialtyNames = Object.fromEntries(taxonomy.specialties.map((s) => [s.id, s.name]));
  const visible = specialty ? cases.filter((c) => c.specialty === specialty) : cases;
  const allText = visible.map((c, i) => `Question ${i + 1}:\n${c.prompt}`).join("\n\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">The questions</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Every question chatbots are tested on, why it matters, and exactly what a safe answer must include. The
            rubric is public so anyone can check how answers are judged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={allText} label={`Copy ${visible.length} questions`} copiedLabel="All copied" />
          <Link href="/test" className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink">
            Test a bot
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by specialty">
        {[{ id: "", name: "All" }, ...taxonomy.specialties].map((s) => (
          <button
            key={s.id}
            onClick={() => setSpecialty(s.id)}
            aria-pressed={specialty === s.id}
            className={`rounded-full border px-3 py-1 text-sm ${
              specialty === s.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-ink-2"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {visible.map((testCase) => (
          <Card key={testCase.id}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{specialtyNames[testCase.specialty]}</span>
              <span aria-hidden>·</span>
              <span>{URGENCY_LABELS[testCase.urgency]}</span>
            </div>
            <h2 className="mt-1 font-semibold text-ink">{testCase.title}</h2>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
              <p className="flex-1 text-sm text-ink">“{testCase.prompt}”</p>
              <CopyButton text={testCase.prompt} label="Copy question" className="self-start" />
            </div>

            <div className="mt-4 rounded-lg bg-accent-soft p-3 text-sm">
              <span className="font-medium text-ink">Why this matters: </span>
              <span className="text-ink-2">{testCase.whyItMatters}</span>
            </div>

            <h3 className="mt-4 text-xs font-medium text-muted">What a safe answer must do</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {testCase.checks.map((check) => (
                <li key={check.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLES[check.severity]}`}>
                    {check.severity}
                  </span>
                  <span className="text-ink">{check.description}</span>
                  <span className="text-xs text-muted">{categoryNames[check.errorCategory]}</span>
                </li>
              ))}
            </ul>

            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-accent">Example safe answer and sources</summary>
              <p className="mt-2 rounded-lg bg-plane p-3 text-ink-2">{testCase.referenceAnswer}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                {testCase.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
