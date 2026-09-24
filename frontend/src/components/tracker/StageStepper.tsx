"use client";

import React from "react";
import { CheckCircle2, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { MigrationJob, StageStates, ChallengeProgress } from "../../types";
import { formatEthValue, formatShortHash } from "../../lib/formatters";

interface StageStepperProps {
  job: MigrationJob;
  stages: StageStates;
  challengeInfo: ChallengeProgress;
}

export function StageStepper({ job, stages, challengeInfo }: StageStepperProps) {
  return (
    <div className="stepper">
      {/* Stage 1: Nova Deposit */}
      <div className={`step-item ${stages.s1}`}>
        <div className="step-circle">
          <CheckCircle2 size={20} />
        </div>
        <div className="step-content">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div className="step-title">Stage 1: Nova Deposit & Dispatch Confirmed</div>
            <span style={{ fontSize: "12px", color: "#10b981", fontWeight: "600" }}>Completed</span>
          </div>
          <div className="step-desc" style={{ marginBottom: "10px" }}>
            ETH locked in NovaEntryContract. ArbSys dispatched message position #{job.messagePosition} at block #{job.novaBlockNumber}.
          </div>
          {job.novaTxHash && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0, 0, 0, 0.25)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-dim)" }}>Nova Tx:</span>
              <a
                href={`https://sepolia.arbiscan.io/tx/${job.novaTxHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {formatShortHash(job.novaTxHash, 10, 8)}
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Stage 2: Canonical Challenge Period */}
      <div className={`step-item ${stages.s2}`}>
        <div className="step-circle">
          {stages.s2 === "completed" ? <CheckCircle2 size={20} /> : <Clock size={20} />}
        </div>
        <div className="step-content">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div className="step-title">Stage 2: Canonical L1 Challenge Period Window</div>
            <span style={{ fontSize: "12px", color: stages.s2 === "completed" ? "#10b981" : "#60a5fa", fontWeight: "600" }}>
              {stages.s2 === "completed" ? "Assertion Finalized" : challengeInfo.text}
            </span>
          </div>
          <div className="step-desc" style={{ marginBottom: "10px" }}>
            Arbitrum Nitro fraud-proof assertion window. Worker monitors rollup nodes on Ethereum L1 until outbox proof is executable.
          </div>

          {stages.s2 === "active" && (
            <div>
              <div style={{ background: "rgba(0, 0, 0, 0.3)", borderRadius: "8px", height: "8px", overflow: "hidden" }}>
                <div
                  style={{
                    background: "linear-gradient(90deg, #3b82f6, #06b6d4)",
                    width: `${challengeInfo.percent}%`,
                    height: "100%",
                    borderRadius: "8px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>
                <span>Started: {new Date(job.createdAt).toLocaleString()}</span>
                <span>Target: ~7 Days Fraud Window</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stage 3: L1 Outbox Claim & Forward */}
      <div className={`step-item ${stages.s3 === "warning" ? "active" : stages.s3}`}>
        <div
          className="step-circle"
          style={stages.s3 === "warning" ? { borderColor: "#f59e0b", color: "#f59e0b", background: "rgba(245, 158, 11, 0.1)" } : undefined}
        >
          {stages.s3 === "completed" ? (
            <CheckCircle2 size={20} />
          ) : stages.s3 === "warning" ? (
            <AlertTriangle size={20} />
          ) : (
            <span>3</span>
          )}
        </div>
        <div className="step-content">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div className="step-title">Stage 3: Ethereum L1 Outbox Claim & Forward</div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: stages.s3 === "completed" ? "#10b981" : stages.s3 === "warning" ? "#f59e0b" : stages.s3 === "active" ? "#60a5fa" : "var(--text-dim)",
              }}
            >
              {stages.s3 === "completed"
                ? "Forwarded on L1"
                : stages.s3 === "warning"
                ? "Gas Cap Buffer Active"
                : stages.s3 === "active"
                ? "Executing Outbox Proof"
                : "Pending Challenge Finality"}
            </span>
          </div>
          <div className="step-desc" style={{ marginBottom: "10px" }}>
            Worker executes Outbox claim on Ethereum Sepolia and calls EthCompletionRouter.forwardJob() advancing L1 execution gas within your signed cap.
          </div>

          {stages.s3 === "warning" && (
            <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "8px", padding: "10px 14px", marginTop: "8px", fontSize: "12px", color: "#fcd34d" }}>
              <strong>User Gas Cap Safeguard Active:</strong> Current Ethereum L1 base fee exceeds your maximum signed deduction cap ({formatEthValue(job.maxDeductions)} ETH). The worker will advance the transaction automatically as soon as base fee drops.
            </div>
          )}

          {/* Claim / Forward Tx Links */}
          {(job.outboxClaimTxHash || job.forwardTxHash) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {job.outboxClaimTxHash && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0, 0, 0, 0.25)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                  <span style={{ color: "var(--text-dim)" }}>L1 Outbox Claim:</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${job.outboxClaimTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    {formatShortHash(job.outboxClaimTxHash, 8, 6)}
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
              {job.forwardTxHash && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0, 0, 0, 0.25)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                  <span style={{ color: "var(--text-dim)" }}>L1 Forward Tx:</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${job.forwardTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    {formatShortHash(job.forwardTxHash, 8, 6)}
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stage 4: Arbitrum One Receipt */}
      <div className={`step-item ${stages.s4}`}>
        <div className="step-circle">
          {stages.s4 === "completed" ? <CheckCircle2 size={20} /> : <span>4</span>}
        </div>
        <div className="step-content">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div className="step-title">Stage 4: Arbitrum One Delivery Verification</div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: stages.s4 === "completed" ? "#10b981" : stages.s4 === "active" ? "#60a5fa" : "var(--text-dim)",
              }}
            >
              {stages.s4 === "completed" ? "Delivered to Beneficiary" : stages.s4 === "active" ? "Retryable In Flight" : "Pending L1 Forward"}
            </span>
          </div>
          <div className="step-desc">
            Canonical retryable ticket automatically claims on Arbitrum One inbox and delivers net ETH directly to beneficiary address.
          </div>

          {job.retryableTicketId && (
            <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0, 0, 0, 0.25)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-dim)" }}>Retryable Ticket:</span>
              <a
                href={`https://sepolia.arbiscan.io/tx/${job.retryableTicketId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {formatShortHash(job.retryableTicketId, 8, 6)}
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
