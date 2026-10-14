"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/charts";
import { api } from "@/lib/api";

const URGENCY_LABELS = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };

export default function TestCasesPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Test cases</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Every question models are tested on, and the checks a safe answer must pass. The rubric is public so anyone
          can see exactly how answers are judged.
        </p>
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
              <span>·</span>
              <span>{URGENCY_LABELS[testCase.urgency]}</span>
            </div>
            <h2 className="mt-1 font-semibold text-ink">{testCase.title}</h2>
            <p className="mt-2 text-sm text-ink-2">“{testCase.prompt}”</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {testCase.checks.map((check) => (
                <li key={check.id} className="flex flex-wrap gap-x-2">
                  <span className="text-ink">{check.description}</span>
                  <span className="text-xs text-muted">
                    {check.severity} · {categoryNames[check.errorCategory]}
                  </span>
                </li>
              ))}
            </ul>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-accent">Example of a safe answer</summary>
              <p className="mt-2 rounded-md bg-plane p-3 text-ink-2">{testCase.referenceAnswer}</p>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
