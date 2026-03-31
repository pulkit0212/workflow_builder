import { notFound } from "next/navigation";
import { DebugTestsPanel } from "@/features/debug/components/debug-tests-panel";

export default function DebugTestsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DebugTestsPanel />;
}
