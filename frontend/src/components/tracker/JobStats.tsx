"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { MigrationJob } from "../../types";
import { formatEthValue, formatShortHash } from "../../lib/formatters";

interface JobStatsProps {
  job: MigrationJob;
  lastSynced: Date | null;
}

export function JobStats({ job, lastSynced }: JobStatsProps) {
  return (
    <>
      {/* Header Summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span className="brand-badge">{job.status.replace(/_/g, " ")}</span>
            {lastSynced && (
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Updated {lastSynced.toLocaleTimeString()}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px" }}>
            Job {formatShortHash(job.jobId, 10, 8)}
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
            Canonical Route: Arbitrum Nova → Ethereum L1 (Sepolia) → Arbitrum One
          </p>
        </div>

        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "12px", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Migration Amount
          </span>
          <div style={{ fontSize: "26px", fontWeight: "800", color: "#60a5fa" }}>
            {formatEthValue(job.principalAmount)} ETH
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Max Allowed Deductions</div>
          <div className="stat-value" style={{ fontSize: "16px", color: "var(--text-main)" }}>
            {formatEthValue(job.maxDeductions)} ETH
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Worker Advance Reward</div>
          <div className="stat-value" style={{ fontSize: "16px", color: "var(--text-main)" }}>
            {formatEthValue(job.executorReward)} ETH
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Guaranteed Min Delivery</div>
          <div className="stat-value" style={{ fontSize: "16px", color: "#10b981" }}>
            {formatEthValue(job.minDeliveryThreshold)} ETH
          </div>
        </div>
      </div>

      {/* Participant Addresses */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          background: "rgba(15, 23, 42, 0.4)",
          padding: "14px 18px",
          borderRadius: "10px",
          marginBottom: "28px",
          border: "1px solid rgba(255, 255, 255, 0.04)",
        }}
      >
        <div>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", display: "block" }}>
            Depositor
          </span>
          <a
            href={`https://sepolia.arbiscan.io/address/${job.depositor}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: "13px",
              color: "#93c5fd",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {formatShortHash(job.depositor, 8, 6)}
            <ExternalLink size={12} />
          </a>
        </div>
        <div>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", display: "block" }}>
            Beneficiary (Arb One)
          </span>
          <a
            href={`https://sepolia.arbiscan.io/address/${job.beneficiary}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: "13px",
              color: "#93c5fd",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {formatShortHash(job.beneficiary, 8, 6)}
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </>
  );
}
