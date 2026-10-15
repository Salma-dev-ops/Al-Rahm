"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { packForQuestion, renderQuestion, SPECIALTY_NAMES, URGENCY_LABELS } from "@/lib/questions";
import { CopyButton } from "./CopyButton";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { QuestionDetails } from "./QuestionDetails";

/** Link to the test page with a curated pack, starting from this question and its details. */
export function testLinkFor(packs, testCase, values) {
  const params = new URLSearchParams({ q: testCase.id, v: JSON.stringify(values) });
  const pack = packForQuestion(packs, testCase.id);
  if (pack) params.set("pack", pack.id);
  return `/test?${params}`;
}

export function QuestionExplorer() {
  const [cases, setCases] = useState(null);
  const [packs, setPacks] = useState([]);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [valuesById, setValuesById] = useState({});
  const [mode, setMode] = useState("browse"); // browse | own
  const [ownQuestion, setOwnQuestion] = useState("");

  useEffect(() => {
    Promise.all([api("/test-cases"), api("/packs")])
      .then(([allCases, allPacks]) => {
        setCases(allCases);
        setPacks(allPacks);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-2">
        Questions can&apos;t load right now ({error}). Start the backend with npm run dev in the backend folder.
      </p>
    );
  }
  if (!cases) return <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" aria-label="Loading questions" />;

  const testCase = cases[index];
  const { title, prompt, values } = renderQuestion(testCase, valuesById[testCase.id]);
  const go = (step) => setIndex((i) => (i + step + cases.length) % cases.length);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-grid px-4 py-3" role="tablist" aria-label="Question source">
        {[
          ["browse", "Common questions"],
          ["own", "Ask your own"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-full px-3 py-1 text-sm ${mode === id ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "browse" ? (
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous question"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-2 hover:text-ink"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 text-center" aria-live="polite">
              <div className="text-xs text-muted">
                {SPECIALTY_NAMES[testCase.specialty]} · {URGENCY_LABELS[testCase.urgency]} · {index + 1} of {cases.length}
              </div>
              <h3 className="mt-0.5 truncate font-semibold text-ink">{title}</h3>
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next question"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-2 hover:text-ink"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <blockquote className="mt-4 rounded-lg border-l-4 border-accent bg-plane p-4 text-sm text-ink">“{prompt}”</blockquote>

          {testCase.variables?.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted">Adjust the details</div>
              <QuestionDetails
                testCase={testCase}
                values={values}
                onChange={(next) => setValuesById((all) => ({ ...all, [testCase.id]: next }))}
                idPrefix="home-"
              />
            </div>
          )}

          <p className="mt-4 text-xs text-ink-2">
            <span className="font-medium text-ink">Why it matters: </span>
            {testCase.whyItMatters}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={testLinkFor(packs, testCase, values)}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink"
            >
              Test your chatbot with this question
            </Link>
            <CopyButton text={prompt} label="Copy question" />
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <label htmlFor="own-question" className="text-sm font-medium text-ink">
            Type a question a woman might ask your chatbot
          </label>
          <textarea
            id="own-question"
            value={ownQuestion}
            onChange={(e) => setOwnQuestion(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. I'm 12 weeks pregnant and have had a fever for two days. Can I take ibuprofen?"
            className="mt-2 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <p className="mt-2 text-xs text-ink-2">
            Your own questions have no clinician-written checks, so the answer is <strong>screened for red flags</strong>{" "}
            (missed emergencies, dismissive language, unsafe pregnancy medicines) rather than given a full score. The
            test also includes a short set of scored questions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {ownQuestion.trim() ? (
              <Link
                href={`/test?${new URLSearchParams({ own: ownQuestion.trim() })}`}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink"
              >
                Test your chatbot with my question
              </Link>
            ) : (
              <span className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink opacity-50">
                Test your chatbot with my question
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
