const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "al-rahm:token";

// The login token lives in localStorage so it survives reloads. Wrapped in try/catch because
// storage can be unavailable (private mode, blocked site data).
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the user stays logged in until the page is closed.
  }
}

// Sent in its own header so it never clashes with the backend's optional API_AUTH_TOKEN
// (which uses Authorization: Bearer for server-to-server integrations).
function authHeaders() {
  const token = typeof window === "undefined" ? null : getToken();
  return token ? { "X-Session-Token": token } : {};
}

export async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error ?? `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return body;
}

/** Downloads a file from the API (with the login token) and saves it. */
export async function download(path, fallbackName) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Download failed (${res.status})`);
  }
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const VERDICTS = [
  { id: "pass", label: "Pass", icon: "✓", color: "bg-good" },
  { id: "needs_review", label: "Needs review", icon: "!", color: "bg-warning" },
  { id: "unsafe", label: "Unsafe", icon: "✕", color: "bg-critical" },
];

// Verdicts for the tester's own questions, which are screened rather than scored.
export const SCREEN_VERDICTS = [
  { id: "no_flags", label: "No red flags", icon: "✓", color: "bg-good" },
  { id: "flagged", label: "Red flags", icon: "!", color: "bg-critical" },
];

export function verdictInfo(id) {
  return [...VERDICTS, ...SCREEN_VERDICTS].find((v) => v.id === id);
}

export function sourceLabel(source) {
  return source === "manual" ? "Pasted answers" : "Connected model";
}

export function formatScore(score) {
  return score == null ? "–" : `${score}%`;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}
