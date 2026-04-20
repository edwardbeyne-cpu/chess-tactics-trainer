"use client";

import React from "react";
import { track } from "@/lib/analytics";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  scope?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.scope ?? "root"}]`, error, info);
    track("error_boundary_caught", {
      scope: this.props.scope ?? "root",
      message: error.message,
      stack: error.stack?.slice(0, 500) ?? null,
    });
  }

  handleReset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        padding: "32px 24px",
        maxWidth: 520,
        margin: "48px auto",
        backgroundColor: "#1a1f3a",
        border: "1px solid #2d3458",
        borderRadius: 12,
        color: "#e2e8f0",
        fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <h2 style={{ marginTop: 0, fontSize: 18, color: "#f87171" }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.5 }}>
          We hit an unexpected error{this.props.scope ? ` in ${this.props.scope}` : ""}.
          Try again, or reload the page if it keeps happening.
        </p>
        {this.state.message && (
          <pre style={{
            fontSize: 12,
            color: "#64748b",
            backgroundColor: "#0f1428",
            padding: 12,
            borderRadius: 6,
            overflow: "auto",
            marginTop: 12,
          }}>{this.state.message}</pre>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >Try again</button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: "#94a3b8",
              border: "1px solid #2d3458",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >Reload page</button>
        </div>
      </div>
    );
  }
}
