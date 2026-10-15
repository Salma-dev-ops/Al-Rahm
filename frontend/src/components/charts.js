import { VERDICTS, verdictInfo } from "@/lib/api";

export function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className={title || subtitle ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/**
 * Horizontal bars for one measure (single series, so no legend: the card title names it).
 * rows: [{ key, label, value, valueLabel, detail }]
 */
export function BarList({ rows, max = 100, emptyText = "No data yet." }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const pct = max > 0 ? Math.max(0, Math.min(100, ((row.value ?? 0) / max) * 100)) : 0;
        return (
          <li key={row.key} title={`${row.label}: ${row.valueLabel ?? row.value}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink">{row.label}</span>
              <span className="shrink-0 text-xs text-muted">{row.detail}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="relative h-3 flex-1 border-l border-axis">
                <div className="h-full rounded-r-[4px] bg-series" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">
                {row.valueLabel ?? row.value}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function VerdictBadge({ verdict }) {
  const info = verdictInfo(verdict);
  if (!info) return <span className="text-xs text-muted">No answer</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${info.color}`}>
        {info.icon}
      </span>
      {info.label}
    </span>
  );
}

/** Stacked 100% bar of pass / needs review / unsafe, with a legend that carries the counts. */
export function VerdictBar({ verdicts }) {
  const total = VERDICTS.reduce((sum, v) => sum + (verdicts?.[v.id] ?? 0), 0);
  if (total === 0) return <p className="text-sm text-muted">No scored answers yet.</p>;
  const present = VERDICTS.filter((v) => verdicts[v.id] > 0);
  return (
    <div>
      <div className="flex h-3 gap-[2px]">
        {present.map((v, i) => (
          <div
            key={v.id}
            className={`${v.color} ${i === present.length - 1 ? "rounded-r-[4px]" : ""}`}
            style={{ width: `${(verdicts[v.id] / total) * 100}%` }}
            title={`${v.label}: ${verdicts[v.id]} of ${total}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {VERDICTS.map((v) => (
          <li key={v.id} className="flex items-center gap-2 text-xs text-ink-2">
            <VerdictBadge verdict={v.id} />
            <span className="tabular-nums">{verdicts[v.id] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The per-specialty and per-error-category charts shared by the dashboard and run pages. */
export function SummaryCharts({ summary }) {
  const categoryRows = summary.byErrorCategory
    .filter((c) => c.failedChecks > 0)
    .sort((a, b) => b.failedChecks - a.failedChecks)
    .map((c) => ({
      key: c.category,
      label: c.name,
      value: c.failedChecks,
      valueLabel: String(c.failedChecks),
      detail: `${c.casesAffected} case${c.casesAffected === 1 ? "" : "s"}`,
    }));
  const maxFailures = Math.max(1, ...categoryRows.map((r) => r.value));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Average score by specialty" subtitle="0–100, weighted by check severity">
        <BarList
          rows={summary.bySpecialty.map((s) => ({
            key: s.specialty,
            label: s.name,
            value: s.averageScore,
            valueLabel: `${s.averageScore}%`,
            detail: `${s.cases} case${s.cases === 1 ? "" : "s"} · ${s.unsafe} unsafe`,
          }))}
        />
      </Card>
      <Card title="Failed checks by error type" subtitle="How often each kind of mistake appeared">
        <BarList rows={categoryRows} max={maxFailures} emptyText="No failed checks. 🎉" />
      </Card>
    </div>
  );
}
