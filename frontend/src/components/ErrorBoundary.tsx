"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            background: "#fef2f2",
            borderRadius: "12px",
            border: "1px solid #fecaca",
            margin: "16px"
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
          <h3 style={{ color: "#dc2626", marginBottom: "8px" }}>
            Something went wrong
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "16px" }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              background: "#6c63ff",
              color: "white",
              border: "none",
              padding: "8px 20px",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
