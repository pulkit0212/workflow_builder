"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type TestState = "idle" | "running" | "pass" | "fail";

type DebugTestResult = {
  id: string;
  name: string;
  status: "pass" | "fail";
  message: string;
};

type TestView = {
  id: string;
  name: string;
  state: TestState;
  message: string;
};

const initialTests: TestView[] = [
  { id: "bot_profile", name: "Test 1 — Bot Profile", state: "idle", message: "Not run yet" },
  { id: "gemini_api", name: "Test 2 — Gemini API", state: "idle", message: "Not run yet" },
  { id: "database_connection", name: "Test 3 — Database Connection", state: "idle", message: "Not run yet" },
  { id: "audio_source", name: "Test 4 — Audio Source", state: "idle", message: "Not run yet" },
  { id: "whisper", name: "Test 5 — Whisper", state: "idle", message: "Not run yet" },
  { id: "calendar_api", name: "Test 6 — Calendar API", state: "idle", message: "Not run yet" },
  { id: "subscription_api", name: "Test 7 — Subscription API", state: "idle", message: "Not run yet" },
  { id: "bot_sessions_file", name: "Test 8 — Bot Sessions File", state: "idle", message: "Not run yet" }
];

function getIcon(state: TestState) {
  if (state === "pass") {
    return <span className="text-[#16a34a]">✅</span>;
  }

  if (state === "fail") {
    return <span className="text-[#dc2626]">❌</span>;
  }

  if (state === "running") {
    return <span className="text-[#6b7280]">⏳</span>;
  }

  return <span className="text-[#9ca3af]">•</span>;
}

export function DebugTestsPanel() {
  const [tests, setTests] = useState<TestView[]>(initialTests);
  const [isRunningAll, setIsRunningAll] = useState(false);

  const summary = useMemo(() => {
    return {
      pass: tests.filter((test) => test.state === "pass").length,
      fail: tests.filter((test) => test.state === "fail").length,
      running: tests.filter((test) => test.state === "running").length
    };
  }, [tests]);

  function applyResult(result: DebugTestResult) {
    setTests((current) =>
      current.map((test) =>
        test.id === result.id
          ? {
              ...test,
              state: result.status,
              message: result.message
            }
          : test
      )
    );
  }

  async function runAllTests() {
    setIsRunningAll(true);
    setTests((current) => current.map((test) => ({ ...test, state: "running", message: "Running..." })));

    try {
      const response = await fetch("/api/debug/run-tests", { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; results?: DebugTestResult[]; message?: string };

      if (!response.ok || !payload.success || !Array.isArray(payload.results)) {
        throw new Error(payload.message || "Failed to run debug tests.");
      }

      setTests((current) =>
        current.map((test) => {
          const result = payload.results?.find((entry) => entry.id === test.id);
          return result
            ? {
                ...test,
                state: result.status,
                message: result.message
              }
            : test;
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run debug tests.";
      setTests((current) => current.map((test) => ({ ...test, state: "fail", message })));
    } finally {
      setIsRunningAll(false);
    }
  }

  async function retryTest(testId: string) {
    setTests((current) =>
      current.map((test) =>
        test.id === testId
          ? { ...test, state: "running", message: "Running..." }
          : test
      )
    );

    try {
      const response = await fetch(`/api/debug/run-tests?testId=${encodeURIComponent(testId)}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { success?: boolean; results?: DebugTestResult[]; message?: string };

      if (!response.ok || !payload.success || !Array.isArray(payload.results) || payload.results.length === 0) {
        throw new Error(payload.message || "Failed to run test.");
      }

      applyResult(payload.results[0]);
    } catch (error) {
      applyResult({
        id: testId,
        name: testId,
        status: "fail",
        message: error instanceof Error ? error.message : "Failed to run test."
      });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">Debug</p>
            <h1 className="mt-2 text-2xl font-bold text-[#111827]">System Test Results</h1>
            <p className="mt-2 text-sm text-[#6b7280]">Development-only checks for bot, AI, database, calendar, and subscription health.</p>
          </div>
          <Button type="button" onClick={() => void runAllTests()} disabled={isRunningAll}>
            {isRunningAll ? "Running All Tests..." : "Run All Tests"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-[#f0fdf4] px-3 py-1 text-[#15803d]">Passed: {summary.pass}</span>
          <span className="rounded-full bg-[#fef2f2] px-3 py-1 text-[#dc2626]">Failed: {summary.fail}</span>
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-[#6b7280]">Running: {summary.running}</span>
        </div>
      </Card>

      <div className="space-y-4">
        {tests.map((test) => (
          <Card key={test.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  {getIcon(test.state)}
                  <h2 className="text-base font-semibold text-[#111827]">{test.name}</h2>
                </div>
                <p
                  className={`mt-3 text-sm ${
                    test.state === "fail"
                      ? "text-[#b91c1c]"
                      : test.state === "pass"
                        ? "text-[#166534]"
                        : "text-[#6b7280]"
                  }`}
                >
                  {test.message}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void retryTest(test.id)}
                disabled={test.state === "running" || isRunningAll}
              >
                Retry
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
