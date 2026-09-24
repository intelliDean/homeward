"use client";

import React, { useState } from "react";
import { Search, CheckCircle2, Clock } from "lucide-react";

interface JobTrackerProps {
  initialJobId?: string | null;
}

export function JobTracker({ initialJobId }: JobTrackerProps) {
  const [jobIdInput, setJobIdInput] = useState(initialJobId || "");
  const [activeJobId, setActiveJobId] = useState(initialJobId || "");

  // Mock demo state or active loaded state
  const isLoaded = Boolean(activeJobId);

  // Challenge countdown estimate (~6.4 days)
  const challengeHoursLeft = 142;
  const challengeDays = Math.floor(challengeHoursLeft / 24);
  const challengeHours = challengeHoursLeft % 24;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Search Header */}
      <div className="glass-panel" style={{ padding: "24px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "12px" }}>
          Live Migration Tracker
        </h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <div className="input-wrapper" style={{ flex: 1 }}>
            <input
              id="job-id-search-input"
              type="text"
              placeholder="Enter Job ID (0x...) or Nova Transaction Hash"
              className="input-field"
              value={jobIdInput}
              onChange={(e) => setJobIdInput(e.target.value)}
            />
          </div>
          <button
            id="track-job-submit-btn"
            className="btn-primary"
            style={{ width: "auto", padding: "0 24px" }}
            onClick={() => setActiveJobId(jobIdInput)}
          >
            <Search size={18} />
            <span>Track</span>
          </button>
        </div>
      </div>

      {isLoaded ? (
        <div className="glass-panel" style={{ padding: "32px" }}>
          {/* Header Summary */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "20px" }}>
            <div>
              <span className="brand-badge" style={{ marginBottom: "8px", display: "inline-block" }}>
                Job In Progress
              </span>
              <h3 style={{ fontSize: "22px", fontWeight: "800" }}>Migration {activeJobId.slice(0, 10)}...{activeJobId.slice(-6)}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
                Canonical Path: Arbitrum Nova → Ethereum L1 → Arbitrum One
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "12px", color: "var(--text-dim)", textTransform: "uppercase" }}>Migration Amount</span>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "#60a5fa" }}>0.5000 ETH</div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Max Allowed Deductions</div>
              <div className="stat-value" style={{ fontSize: "16px", color: "var(--text-main)" }}>0.0250 ETH</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Worker Success Reward</div>
              <div className="stat-value" style={{ fontSize: "16px", color: "var(--text-main)" }}>0.0050 ETH</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Guaranteed Min Delivery</div>
              <div className="stat-value" style={{ fontSize: "16px", color: "#10b981" }}>0.4750 ETH</div>
            </div>
          </div>

          {/* 4-Stage Stepper */}
          <div className="stepper" style={{ marginTop: "32px" }}>
            {/* Step 1 */}
            <div className="step-item completed">
              <div className="step-circle">
                <CheckCircle2 size={20} />
              </div>
              <div className="step-content">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div className="step-title">Stage 1: Nova Deposit Confirmed</div>
                  <span style={{ fontSize: "12px", color: "#10b981", fontWeight: "600" }}>Completed</span>
                </div>
                <div className="step-desc">
                  ETH locked in NovaEntryContract. ArbSys.sendTxToL1 dispatched message position #42.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="step-item active">
              <div className="step-circle">
                <Clock size={20} />
              </div>
              <div className="step-content">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div className="step-title">Stage 2: Canonical Challenge Period Window</div>
                  <span style={{ fontSize: "12px", color: "#60a5fa", fontWeight: "600" }}>~{challengeDays}d {challengeHours}h remaining</span>
                </div>
                <div className="step-desc" style={{ marginBottom: "10px" }}>
                  Fraud-proof challenge window is currently active on Ethereum L1. Background worker monitors assertion confirmations via Arbitrum SDK.
                </div>
                <div style={{ background: "rgba(0, 0, 0, 0.3)", borderRadius: "8px", height: "8px", overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(90deg, #3b82f6, #06b6d4)", width: "35%", height: "100%", borderRadius: "8px" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>
                  <span>Estimated Completion: In ~5.9 days</span>
                  <span>(Estimated, not guaranteed)</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="step-item">
              <div className="step-circle">3</div>
              <div className="step-content">
                <div className="step-title">Stage 3: Ethereum L1 Outbox Claim & Forward</div>
                <div className="step-desc">
                  Worker executes Outbox claim on L1 and calls EthCompletionRouter.forwardJob() within your signed gas caps.
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="step-item">
              <div className="step-circle">4</div>
              <div className="step-content">
                <div className="step-title">Stage 4: Arbitrum One Delivery Verification</div>
                <div className="step-desc">
                  Canonical retryable ticket executes on Arbitrum One. Migration is verified complete once beneficiary wallet receives the net ETH.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: "48px 24px", textAlign: "center" }}>
          <Clock size={40} color="var(--text-dim)" style={{ marginBottom: "16px" }} />
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>No Job Selected</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: "440px", margin: "0 auto" }}>
            Initiate a migration or enter an existing Job ID or transaction hash above to track real-time bridge progress across all 4 stages.
          </p>
        </div>
      )}
    </div>
  );
}
