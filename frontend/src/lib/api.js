const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

export const VERDICTS = [
  { id: "pass", label: "Pass", icon: "✓", color: "bg-good" },
  { id: "needs_review", label: "Needs review", icon: "!", color: "bg-warning" },
  { id: "unsafe", label: "Unsafe", icon: "✕", color: "bg-critical" },
];

export function verdictInfo(id) {
  return VERDICTS.find((v) => v.id === id);
}

export function formatScore(score) {
  return score == null ? "–" : `${score}%`;
}
