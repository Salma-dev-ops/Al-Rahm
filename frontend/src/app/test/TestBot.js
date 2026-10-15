"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/charts";
import { CopyButton } from "@/components/CopyButton";
import { api } from "@/lib/api";

const DRAFT_KEY = "al-rahm:paste-draft";

// The draft is a per-browser convenience so pasted answers survive a refresh.
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode etc.): the form still works, just without a draft.
  }
}

function SpecialtyFilter({ specialties, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions by specialty">
      {[{ id: "", name: "All" }, ...specialties].map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          aria-pressed={value === s.id}
          className={`rounded-full border px-3 py-1 text-sm ${
            value === s.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-ink-2"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function PasteAnswers({ cases, specialties }) {
  const router = useRouter();
  const [botName, setBotName] = useState("");
  const [answers, setAnswers] = useState({});
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- restoring a saved draft once on mount */
    if (draft.botName) setBotName(draft.botName);
    if (draft.answers) setAnswers(draft.answers);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function update(next) {
    const draft = { botName, answers, ...next };
    if (next.botName !== undefined) setBotName(next.botName);
    if (next.answers !== undefined) setAnswers(next.answers);
    saveDraft(draft);
  }

  const specialtyNames = Object.fromEntries(specialties.map((s) => [s.id, s.name]));
  const visible = specialty ? cases.filter((c) => c.specialty === specialty) : cases;
  const answeredCount = cases.filter((c) => answers[c.id]?.trim()).length;

  const allQuestionsText = useMemo(
    () => visible.map((c, i) => `Question ${i + 1}:\n${c.prompt}`).join("\n\n"),
    [visible],
  );

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!botName.trim()) return setError("Give your chatbot a name first.");
    if (answeredCount === 0) return setError("Paste at least one answer.");
    setSubmitting(true);
    try {
      const run = await api("/runs/manual", {
        method: "POST",
        body: JSON.stringify({
          botName: botName.trim(),
          answers: cases.filter((c) => answers[c.id]?.trim()).map((c) => ({ caseId: c.id, response: answers[c.id] })),
        }),
      });
      saveDraft({});
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <label className="block text-sm font-medium text-ink" htmlFor="bot-name">
          1. Name the chatbot you are testing
        </label>
        <input
          id="bot-name"
          value={botName}
          onChange={(e) => update({ botName: e.target.value })}
          maxLength={80}
          placeholder="e.g. MamaCare WhatsApp bot v2"
          className="mt-2 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">2. Ask your chatbot each question, then paste its answer</h2>
          <CopyButton text={allQuestionsText} label={`Copy ${visible.length} questions`} copiedLabel="All copied" />
        </div>
        <p className="rounded-lg bg-accent-soft p-3 text-sm text-ink-2">
          <strong className="text-ink">For a fair test:</strong> ask each question in a <em>new</em> chat, word for
          word, and paste the bot&apos;s full first reply. Don&apos;t edit it, and don&apos;t ask follow-up questions.
          You can answer just some questions and score them now.
        </p>
        <SpecialtyFilter specialties={specialties} value={specialty} onChange={setSpecialty} />
      </div>

      <ol className="space-y-4">
        {visible.map((testCase) => {
          const number = cases.indexOf(testCase) + 1;
          const answered = Boolean(answers[testCase.id]?.trim());
          return (
            <li key={testCase.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    answered ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent"
                  }`}
                >
                  {number}
                </span>
                <span>{specialtyNames[testCase.specialty]}</span>
                <span aria-hidden>·</span>
                <span>{testCase.title}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                <p className="flex-1 text-sm text-ink">“{testCase.prompt}”</p>
                <CopyButton text={testCase.prompt} label="Copy question" className="self-start" />
              </div>
              <label className="mt-3 block text-xs text-ink-2" htmlFor={`answer-${testCase.id}`}>
                Your chatbot&apos;s answer
              </label>
              <textarea
                id={`answer-${testCase.id}`}
                value={answers[testCase.id] ?? ""}
                onChange={(e) => update({ answers: { ...answers, [testCase.id]: e.target.value } })}
                rows={4}
                placeholder="Paste the full reply here"
                className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
              />
            </li>
          );
        })}
      </ol>

      {/* Sits above the mobile tab bar, at the bottom of the screen on desktop. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm text-ink-2">
            <strong className="text-ink">{answeredCount}</strong> of {cases.length} answered
          </span>
          {error && <span className="text-sm text-critical">{error}</span>}
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
          >
            {submitting ? "Scoring…" : "Score answers"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ConnectModel({ models, specialties }) {
  const router = useRouter();
  const [modelId, setModelId] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = models.find((m) => m.id === (modelId || models[0]?.id));

  async function start(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const run = await api("/runs", {
        method: "POST",
        body: JSON.stringify({ modelId: selected.id, specialty: specialty || undefined }),
      });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Card
      title="Run the questions automatically"
      subtitle="Al-Rahm sends every question to the model and scores the replies. Models are configured on the server; the examples need no setup."
    >
      <form onSubmit={start} className="space-y-4">
        <label className="block text-sm text-ink-2">
          Model
          <select
            value={selected?.id ?? ""}
            onChange={(e) => setModelId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {selected && <p className="text-sm text-muted">{selected.description}</p>}
        <div>
          <span className="block text-sm text-ink-2">Questions</span>
          <div className="mt-2">
            <SpecialtyFilter specialties={specialties} value={specialty} onChange={setSpecialty} />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || !selected}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start evaluation"}
        </button>
        {error && <p className="text-sm text-critical">{error}</p>}
      </form>
    </Card>
  );
}

export default function TestBot() {
  const [mode, setMode] = useState("paste");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api("/test-cases"), api("/taxonomy"), api("/models")])
      .then(([cases, taxonomy, models]) => setData({ cases, taxonomy, models }))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Test your chatbot</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Works with any chatbot: WhatsApp, SMS, a website widget or an app. No technical setup needed.
        </p>
      </div>

      <div className="inline-flex rounded-full border border-border bg-surface p-1" role="tablist">
        {[
          ["paste", "Paste answers"],
          ["connect", "Connect a model"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              mode === id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <Card title="Can't reach the Al-Rahm API">
          <p className="text-sm text-ink-2">{error}. Start the backend with npm run dev in the backend folder.</p>
        </Card>
      )}
      {!data && !error && <p className="text-sm text-muted">Loading questions…</p>}
      {data && mode === "paste" && <PasteAnswers cases={data.cases} specialties={data.taxonomy.specialties} />}
      {data && mode === "connect" && <ConnectModel models={data.models} specialties={data.taxonomy.specialties} />}
    </div>
  );
}
