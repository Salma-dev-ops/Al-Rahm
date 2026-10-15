"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/charts";
import { CopyButton } from "@/components/CopyButton";
import { LockIcon } from "@/components/icons";
import { QuestionDetails } from "@/components/QuestionDetails";
import { api } from "@/lib/api";
import { renderQuestion, SPECIALTY_NAMES } from "@/lib/questions";

const DRAFT_KEY = "al-rahm:test-draft";

// The draft is a per-browser convenience so typed answers survive a refresh.
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
    // Storage unavailable: the form still works, just without a saved draft.
  }
}

function parseValues(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Starting state: the saved draft, overridden by whatever the link asked for. */
function initialState(params, packs) {
  const draft = loadDraft();
  const state = {
    packId: draft.packId && packs.some((p) => p.id === draft.packId) ? draft.packId : packs[0].id,
    botName: draft.botName ?? "",
    entries: draft.entries ?? {},
    custom: draft.custom ?? [],
    focusId: null,
  };
  const pack = params.get("pack");
  if (pack && packs.some((p) => p.id === pack)) state.packId = pack;
  const focus = params.get("q");
  if (focus) {
    state.focusId = focus;
    const values = parseValues(params.get("v"));
    if (values) state.entries = { ...state.entries, [focus]: { ...state.entries[focus], values } };
  }
  const own = params.get("own")?.trim();
  if (own && !state.custom.some((c) => c.question === own)) {
    state.custom = [...state.custom, { question: own, response: "" }];
  }
  return state;
}

function PackPicker({ packs, value, onChange }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {packs.map((pack) => {
        const selected = pack.id === value;
        return (
          <button
            key={pack.id}
            type="button"
            onClick={() => onChange(pack.id)}
            aria-pressed={selected}
            className={`w-64 shrink-0 snap-start rounded-xl border p-3 text-left sm:w-auto ${
              selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${selected ? "text-accent" : "text-ink"}`}>{pack.name}</span>
              <span className="shrink-0 text-xs text-muted">{pack.caseIds.length} questions</span>
            </span>
            <span className="mt-1 block text-xs text-ink-2">{pack.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function PrivateToggle({ user, checked, onChange }) {
  if (!user?.isPremium) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <LockIcon className="h-4 w-4 text-muted" />
        Results are public on the leaderboard.{" "}
        <Link href="/premium" className="font-medium text-accent hover:underline">
          Keep them private with Premium
        </Link>
      </p>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      Keep this test private (only you can see it; it stays off the leaderboard)
    </label>
  );
}

function PasteAnswers({ cases, packs, plans, user, params }) {
  const router = useRouter();
  const [state, setState] = useState(() => initialState(params, packs));
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { packId, botName, entries, custom, focusId } = state;
  useEffect(() => saveDraft({ packId, botName, entries, custom }), [packId, botName, entries, custom]);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const setEntry = (caseId, patch) =>
    setState((s) => ({ ...s, entries: { ...s.entries, [caseId]: { ...s.entries[caseId], ...patch } } }));

  const byId = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const pack = packs.find((p) => p.id === packId);
  // The question chosen on the home page comes first (added if it isn't in this pack).
  const questionIds =
    focusId && byId[focusId] ? [focusId, ...pack.caseIds.filter((id) => id !== focusId)] : pack.caseIds;
  const questions = questionIds.map((id) => {
    const testCase = byId[id];
    return { testCase, ...renderQuestion(testCase, entries[id]?.values) };
  });

  const customLimit = plans.customQuestionLimit[user?.isPremium ? "premium" : "free"];
  const answered = questions.filter((q) => entries[q.testCase.id]?.response?.trim()).length;
  const customReady = custom.filter((c) => c.question.trim() && c.response.trim()).length;
  const allQuestionsText = questions.map((q, i) => `Question ${i + 1}:\n${q.prompt}`).join("\n\n");

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!botName.trim()) return setError("Give your chatbot a name first.");
    if (answered + customReady === 0) return setError("Add at least one answer.");
    if (custom.some((c) => c.question.trim() && !c.response.trim())) {
      return setError("Add your chatbot's answer to each of your own questions, or remove the question.");
    }
    setSubmitting(true);
    try {
      const run = await api("/runs/manual", {
        method: "POST",
        body: JSON.stringify({
          botName: botName.trim(),
          private: isPrivate,
          answers: questions
            .filter((q) => entries[q.testCase.id]?.response?.trim())
            .map((q) => ({ caseId: q.testCase.id, values: q.values, response: entries[q.testCase.id].response })),
          customQuestions: custom.filter((c) => c.question.trim() && c.response.trim()),
        }),
      });
      saveDraft({ packId, botName });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1. Choose a question pack</h2>
        <PackPicker packs={packs} value={packId} onChange={(id) => update({ packId: id })} />
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="bot-name">
          2. Name the chatbot you are testing
        </label>
        <input
          id="bot-name"
          value={botName}
          onChange={(e) => update({ botName: e.target.value })}
          maxLength={80}
          placeholder="e.g. MamaCare WhatsApp bot v2"
          className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">3. Ask your chatbot each question and enter its answer</h2>
          <CopyButton text={allQuestionsText} label={`Copy all ${questions.length} questions`} copiedLabel="All copied" />
        </div>
        <p className="rounded-lg bg-accent-soft p-3 text-sm text-ink-2">
          <strong className="text-ink">For a fair test:</strong> adjust the details first if you like, then ask each
          question in a <em>new</em> chat, word for word, and enter the bot&apos;s full first reply without editing it.
          You can leave some blank and score the rest.
        </p>
        <ol className="space-y-4">
          {questions.map(({ testCase, title, prompt, values }, i) => {
            const id = testCase.id;
            const done = Boolean(entries[id]?.response?.trim());
            return (
              <li key={id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span>{SPECIALTY_NAMES[testCase.specialty]}</span>
                  <span aria-hidden>·</span>
                  <span>{title}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <p className="flex-1 text-sm text-ink">“{prompt}”</p>
                  <CopyButton text={prompt} label="Copy question" className="self-start" />
                </div>
                {testCase.variables?.length > 0 && (
                  <div className="mt-3">
                    <QuestionDetails testCase={testCase} values={values} onChange={(next) => setEntry(id, { values: next })} />
                  </div>
                )}
                <label className="mt-3 block text-xs text-ink-2" htmlFor={`answer-${id}`}>
                  Your chatbot&apos;s answer
                </label>
                <textarea
                  id={`answer-${id}`}
                  value={entries[id]?.response ?? ""}
                  onChange={(e) => setEntry(id, { response: e.target.value })}
                  rows={4}
                  placeholder="Type or paste the full reply here"
                  className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
                />
              </li>
            );
          })}
        </ol>
      </section>

      <section className="space-y-3" id="own">
        <div>
          <h2 className="text-sm font-semibold text-ink">4. Add your own questions (optional)</h2>
          <p className="mt-1 text-sm text-ink-2">
            Own questions are <strong className="text-ink">screened for red flags</strong>, not fully scored, and don&apos;t
            count towards the score. Up to {customLimit} per test
            {!user?.isPremium && (
              <>
                {" "}
                (
                <Link href="/premium" className="text-accent hover:underline">
                  {plans.customQuestionLimit.premium} with Premium
                </Link>
                )
              </>
            )}
            .
          </p>
        </div>
        {custom.map((item, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`own-q-${i}`} className="text-xs font-medium text-ink-2">
                Your question {i + 1}
              </label>
              <button
                type="button"
                onClick={() => update({ custom: custom.filter((_, j) => j !== i) })}
                className="text-xs text-muted hover:text-critical"
              >
                Remove
              </button>
            </div>
            <textarea
              id={`own-q-${i}`}
              value={item.question}
              onChange={(e) => update({ custom: custom.map((c, j) => (j === i ? { ...c, question: e.target.value } : c)) })}
              rows={2}
              maxLength={2000}
              placeholder="A question a woman might ask your chatbot"
              className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            {item.question.trim() && <CopyButton text={item.question} label="Copy question" className="mt-2" />}
            <label htmlFor={`own-a-${i}`} className="mt-3 block text-xs text-ink-2">
              Your chatbot&apos;s answer
            </label>
            <textarea
              id={`own-a-${i}`}
              value={item.response}
              onChange={(e) => update({ custom: custom.map((c, j) => (j === i ? { ...c, response: e.target.value } : c)) })}
              rows={3}
              placeholder="Type or paste the full reply here"
              className="mt-1 block w-full rounded-lg border border-border bg-plane px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>
        ))}
        {custom.length < customLimit ? (
          <button
            type="button"
            onClick={() => update({ custom: [...custom, { question: "", response: "" }] })}
            className="rounded-full border border-dashed border-accent px-4 py-2 text-sm font-medium text-accent"
          >
            + Add your own question
          </button>
        ) : (
          <p className="text-xs text-muted">You&apos;ve reached the limit of {customLimit} own questions for this test.</p>
        )}
      </section>

      <PrivateToggle user={user} checked={isPrivate} onChange={setIsPrivate} />

      {/* Sits above the mobile tab bar, at the bottom of the screen on desktop. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm text-ink-2">
            <strong className="text-ink">{answered}</strong> of {questions.length} answered
            {customReady > 0 && ` · ${customReady} own`}
          </span>
          {error && (
            <span className="text-sm text-critical" role="alert">
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
          >
            {submitting ? "Scoring…" : "Get my score"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ConnectModel({ models, packs, user }) {
  const router = useRouter();
  const [modelId, setModelId] = useState("");
  const [packId, setPackId] = useState(packs[0].id);
  const [isPrivate, setIsPrivate] = useState(false);
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
        body: JSON.stringify({ modelId: selected.id, packId, private: isPrivate }),
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
      <form onSubmit={start} className="space-y-5">
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
        <div className="space-y-2">
          <span className="block text-sm text-ink-2">Question pack</span>
          <PackPicker packs={packs} value={packId} onChange={setPackId} />
        </div>
        <PrivateToggle user={user} checked={isPrivate} onChange={setIsPrivate} />
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
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState("paste");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api("/test-cases"), api("/packs"), api("/models"), api("/plans")])
      .then(([cases, packs, models, plans]) => setData({ cases, packs, models, plans }))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Test your chatbot</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Works with any chatbot: WhatsApp, SMS, a website widget or an app. No technical setup needed. You&apos;ll get
          a score for every answer and an explanation of why.
        </p>
      </div>

      <div className="inline-flex rounded-full border border-border bg-surface p-1" role="tablist">
        {[
          ["paste", "Enter answers"],
          ["connect", "Connect a model"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-full px-4 py-1.5 text-sm ${mode === id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
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
      {(!data || authLoading) && !error && <p className="text-sm text-muted">Loading questions…</p>}
      {data && !authLoading && mode === "paste" && (
        <PasteAnswers cases={data.cases} packs={data.packs} plans={data.plans} user={user} params={params} />
      )}
      {data && !authLoading && mode === "connect" && <ConnectModel models={data.models} packs={data.packs} user={user} />}
    </div>
  );
}
