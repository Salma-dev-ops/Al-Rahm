import { Suspense } from "react";
import TestBot from "./TestBot";

export const metadata = { title: "Test your chatbot" };

export default function TestPage() {
  // TestBot reads the link's ?pack, ?q and ?own, which are only known at request time.
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading questions…</p>}>
      <TestBot />
    </Suspense>
  );
}
