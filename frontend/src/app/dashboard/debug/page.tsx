"use client";

import { useEffect, useState } from "react";

type TestResult = {
  id: number;
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
};

type Summary = {
  passed: number;
  failed: number;
  warned: number;
  total: number;
};

export default function DebugPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [productionReady, setProductionReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debug/run-tests", { cache: "no-store" });
      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
      setProductionReady(Boolean(data.productionReady));
    } catch (error) {
      console.error("Test error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runTests();
  }, []);

  if (process.env.NODE_ENV === "production") {
    return (
      <div style={{ padding: "32px", color: "#6b7280" }}>
        Debug tools are not available in production.
      </div>
    );
  }

  const statusIcon = (status: TestResult["status"]) => {
    if (status === "pass") return "✅";
    if (status === "fail") return "❌";
    return "⚠️";
  };

  const statusColor = (status: TestResult["status"]) => {
    if (status === "pass") return "#16a34a";
    if (status === "fail") return "#dc2626";
    return "#ca8a04";
  };

  return (
    <div style={{ padding: "32px", maxWidth: "800px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        System Health Check
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "24px" }}>
        Run diagnostics to verify all components are working
      </p>

      {summary && (
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
          <div style={{ padding: "16px 24px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#16a34a" }}>{summary.passed}</div>
            <div style={{ fontSize: "12px", color: "#16a34a" }}>Passed</div>
          </div>
          <div style={{ padding: "16px 24px", background: "#fef2f2", borderRadius: "12px", border: "1px solid #fecaca" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#dc2626" }}>{summary.failed}</div>
            <div style={{ fontSize: "12px", color: "#dc2626" }}>Failed</div>
          </div>
          <div style={{ padding: "16px 24px", background: "#fefce8", borderRadius: "12px", border: "1px solid #fde68a" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#ca8a04" }}>{summary.warned}</div>
            <div style={{ fontSize: "12px", color: "#ca8a04" }}>Warnings</div>
          </div>
          <div
            style={{
              padding: "16px 24px",
              background: productionReady ? "#f0fdf4" : "#fef2f2",
              borderRadius: "12px",
              border: `1px solid ${productionReady ? "#bbf7d0" : "#fecaca"}`
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700, color: productionReady ? "#16a34a" : "#dc2626" }}>
              {productionReady ? "🚀 Production Ready" : "⚠️ Fix Issues First"}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => void runTests()}
        disabled={loading}
        style={{
          background: "#6c63ff",
          color: "white",
          border: "none",
          padding: "10px 24px",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 500,
          marginBottom: "24px"
        }}
      >
        {loading ? "Running tests..." : "🔄 Run All Tests"}
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {results.map((result) => (
          <div
            key={result.id}
            style={{
              padding: "16px 20px",
              background: "white",
              borderRadius: "12px",
              border: "1px solid #f3f4f6",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
            }}
          >
            <span style={{ fontSize: "20px" }}>{statusIcon(result.status)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>{result.name}</div>
              <div style={{ fontSize: "13px", color: statusColor(result.status) }}>{result.message}</div>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && !loading ? (
        <div style={{ textAlign: "center", padding: "48px", color: "#6b7280", fontSize: "14px" }}>
          Click "Run All Tests" to check system health
        </div>
      ) : null}
    </div>
  );
}
