import { Suspense } from "react";
import RunDetail from "./RunDetail";

export const metadata = { title: "Evaluation run · Al-Rahm" };

export default function RunPage() {
  // The run id is only known at request time, so the client component that reads it
  // must sit inside a Suspense boundary (required with cacheComponents).
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <RunDetail />
    </Suspense>
  );
}
