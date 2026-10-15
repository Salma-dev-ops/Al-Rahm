"use client";

import { clampValues } from "@/lib/questions";

/**
 * Steppers for a question's adjustable details (weeks pregnant, age, ...). Values stay inside
 * each detail's allowed range, which keeps the question's scoring checks clinically valid.
 */
export function QuestionDetails({ testCase, values, onChange, idPrefix = "" }) {
  const variables = testCase.variables ?? [];
  if (variables.length === 0) return null;
  const current = clampValues(testCase, values);

  function set(key, value) {
    onChange(clampValues(testCase, { ...current, [key]: value }));
  }

  return (
    <div className="flex flex-wrap gap-3">
      {variables.map((v) => {
        const id = `${idPrefix}${testCase.id}-${v.key}`;
        return (
          <div key={v.key} className="flex items-center gap-2 rounded-full border border-border bg-plane py-1 pr-1 pl-3">
            <label htmlFor={id} className="text-xs text-ink-2">
              {v.label}
            </label>
            <button
              type="button"
              onClick={() => set(v.key, current[v.key] - 1)}
              disabled={current[v.key] <= v.min}
              aria-label={`Decrease ${v.label}`}
              className="h-7 w-7 rounded-full bg-surface text-ink disabled:opacity-40"
            >
              −
            </button>
            {/* Free typing; the value is clamped when the field loses focus (keyed so it resets after). */}
            <input
              key={current[v.key]}
              id={id}
              type="number"
              inputMode="numeric"
              min={v.min}
              max={v.max}
              defaultValue={current[v.key]}
              onBlur={(e) => set(v.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault(); // don't submit the surrounding form
                e.currentTarget.blur();
              }}
              className="w-12 rounded-md border border-border bg-surface py-0.5 text-center text-sm font-medium text-ink tabular-nums"
            />
            <button
              type="button"
              onClick={() => set(v.key, current[v.key] + 1)}
              disabled={current[v.key] >= v.max}
              aria-label={`Increase ${v.label}`}
              className="h-7 w-7 rounded-full bg-surface text-ink disabled:opacity-40"
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
