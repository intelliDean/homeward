"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  AlertTriangle, 
  RefreshCw, 
  Activity,
  ArrowRight
} from "lucide-react";
import { formatEther } from "viem";

export interface MigrationJob {
  jobId: string;
  depositor: string;
  beneficiary: string;
  principalAmount: string;
  maxDeductions: string;
  executorReward: string;
  minDeliveryThreshold: string;
  messagePosition: string;
  novaTxHash: string;
  novaBlockNumber: string;
  outboxClaimTxHash: string | null;
  forwardTxHash: string | null;
  retryableTicketId: string | null;
  status:
    | "DISCOVERED"
    | "MONITORING_CHALLENGE"
    | "CHALLENGE_PASSED"
    | "CLAIMING_OUTBOX"
    | "FORWARDING"
    | "TRACKING_RETRYABLE"
    | "COMPLETED"
    | "OVER_BUDGET"
    | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobTrackerProps {
  initialJobId?: string | null;
}

export function JobTracker({ initialJobId }: JobTrackerProps) {
  const [jobIdInput, setJobIdInput] = useState(initialJobId || "");
  const [activeJobId, setActiveJobId] = useState(initialJobId || "");
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [recentJobs, setRecentJobs] = useState<MigrationJob[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // If initialJobId changes from parent, sync it
  useEffect(() => {
    if (initialJobId && initialJobId !== activeJobId) {
      setJobIdInput(initialJobId);
      setActiveJobId(initialJobId);
    }
  }, [initialJobId, activeJobId]);

  // Fetch job details from PostgreSQL via /api/jobs/[id]
  const fetchJob = useCallback(async (id: string, silent = false) => {
    if (!id || id.trim() === "") return;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Migration job not found in worker database.");
        setJob(null);
      } else {
        setJob(data.job);
        setLastSynced(new Date());
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch migration job:", err);
      if (!silent) {
        setError("Network error communicating with worker API: " + errorMsg);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Fetch recent jobs for quick tracking
  const fetchRecentJobs = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/jobs?limit=5");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.jobs)) {
        setRecentJobs(data.jobs);
      }
    } catch (err) {
      console.error("Failed to fetch recent jobs:", err);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  // Initial fetch for active job or recent jobs
  useEffect(() => {
    if (activeJobId) {
      fetchJob(activeJobId);
    } else {
      fetchRecentJobs();
    }
  }, [activeJobId, fetchJob, fetchRecentJobs]);

  // Polling effect every 6 seconds when a job is active
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(() => {
      fetchJob(activeJobId, true);
    }, 6000);

    return () => {
      clearInterval(interval);
    };
  }, [activeJobId, fetchJob]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (jobIdInput.trim()) {
      setActiveJobId(jobIdInput.trim());
    }
  };

  const handleSelectRecentJob = (selected: MigrationJob) => {
    setJobIdInput(selected.jobId);
    setActiveJobId(selected.jobId);
    setJob(selected);
  };

  // Helper formatting
  const formatEthValue = (weiStr?: string) => {
    if (!weiStr) return "0.0000";
    try {
      const eth = formatEther(BigInt(weiStr));
      return Number(eth).toFixed(4);
    } catch {
      return "0.0000";
    }
  };

  const formatShortHash = (hash?: string | null, left = 8, right = 6) => {
    if (!hash) return "";
    if (hash.length <= left + right) return hash;
    return `${hash.slice(0, left)}...${hash.slice(-right)}`;
  };

  // Challenge Window Progress Calculation
  const calculateChallengeProgress = () => {
    if (!job?.createdAt) return { percent: 10, daysLeft: 7, hoursLeft: 0, text: "7 days remaining" };

    const createdTime = new Date(job.createdAt).getTime();
    const now = Date.now();
    const challengeDurationMs = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const elapsed = now - createdTime;

    if (elapsed >= challengeDurationMs) {
      return { percent: 100, daysLeft: 0, hoursLeft: 0, text: "Challenge window complete" };
    }

    const remainingMs = Math.max(0, challengeDurationMs - elapsed);
    const totalHoursLeft = Math.floor(remainingMs / (1000 * 60 * 60));
    const daysLeft = Math.floor(totalHoursLeft / 24);
    const hoursLeft = totalHoursLeft % 24;
    const percent = Math.min(99, Math.max(5, Math.floor((elapsed / challengeDurationMs) * 100)));

    return {
      percent,
      daysLeft,
      hoursLeft,
      text: daysLeft > 0 ? `~${daysLeft}d ${hoursLeft}h remaining` : `~${hoursLeft}h remaining`,
    };
  };

  const challengeInfo = calculateChallengeProgress();

  // Status mapping for step progress
  const getStageStates = () => {
    if (!job) return { s1: "pending", s2: "pending", s3: "pending", s4: "pending" };

    const status = job.status;

    // Stage 1: Nova Deposit Confirmed (Always completed if in DB)
    const s1 = "completed";

    // Stage 2: Canonical Challenge Period
    let s2: "completed" | "active" | "pending" = "pending";
    if (status === "DISCOVERED" || status === "MONITORING_CHALLENGE") {
      s2 = "active";
    } else if (
      status === "CHALLENGE_PASSED" ||
      status === "CLAIMING_OUTBOX" ||
      status === "FORWARDING" ||
      status === "TRACKING_RETRYABLE" ||
      status === "COMPLETED"
    ) {
      s2 = "completed";
    }

    // Stage 3: L1 Claim & Forward
    let s3: "completed" | "active" | "warning" | "pending" = "pending";
    if (status === "OVER_BUDGET") {
      s3 = "warning";
    } else if (status === "CHALLENGE_PASSED" || status === "CLAIMING_OUTBOX" || status === "FORWARDING") {
      s3 = "active";
    } else if (status === "TRACKING_RETRYABLE" || status === "COMPLETED") {
      s3 = "completed";
    }

    // Stage 4: Arb One Receipt
    let s4: "completed" | "active" | "pending" = "pending";
    if (status === "TRACKING_RETRYABLE") {
      s4 = "active";
    } else if (status === "COMPLETED") {
      s4 = "completed";
    }

    return { s1, s2, s3, s4 };
  };

  const stages = getStageStates();

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      {/* Search Header */}
      <div className="glass-panel" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "700" }}>Live Migration Tracker</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
              Direct worker database sync. Tracks L2 deposit, L1 challenge window, and L1→L2 forwarding.
            </p>
          </div>

          {activeJobId && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#10b981", background: "rgba(16, 185, 129, 0.1)", padding: "4px 10px", borderRadius: "20px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "pulse 2s infinite" }} />
                Live Sync
              </span>
              <button
                className="btn-primary"
                style={{ width: "auto", padding: "6px 12px", fontSize: "12px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", boxShadow: "none" }}
                onClick={() => fetchJob(activeJobId)}
                title="Refresh now"
              >
                <RefreshCw size={12} className={loading ? "spin" : ""} />
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
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
            type="submit"
            className="btn-primary"
            style={{ width: "auto", padding: "0 24px" }}
            disabled={loading || !jobIdInput.trim()}
          >
            <Search size={18} />
            <span>{loading ? "Searching..." : "Track"}</span>
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "12px", padding: "16px 20px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", color: "#fca5a5" }}>
          <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: "14px" }}>
            <strong style={{ display: "block", color: "#ef4444", marginBottom: "2px" }}>Migration Not Found</strong>
            {error}
          </div>
        </div>
      )}

      {/* Main Tracked Job Panel */}
      {job ? (
        <div className="glass-panel" style={{ padding: "32px", marginBottom: "24px" }}>
          {/* Header Summary */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "20px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span className="brand-badge">
                  {job.status.replace(/_/g, " ")}
                </span>
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
              <span style={{ fontSize: "12px", color: "var(--text-dim)", textTransform: "uppercase" }}>Migration Amount</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(15, 23, 42, 0.4)", padding: "14px 18px", borderRadius: "10px", marginBottom: "28px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
            <div>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", display: "block" }}>Depositor</span>
              <a 
                href={`https://sepolia.arbiscan.io/address/${job.depositor}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: "13px", color: "#93c5fd", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {formatShortHash(job.depositor, 8, 6)}
                <ExternalLink size={12} />
              </a>
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", display: "block" }}>Beneficiary (Arb One)</span>
              <a 
                href={`https://sepolia.arbiscan.io/address/${job.beneficiary}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: "13px", color: "#93c5fd", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {formatShortHash(job.beneficiary, 8, 6)}
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* 4-Stage Stepper */}
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
                      color: stages.s3 === "completed" ? "#10b981" : stages.s3 === "warning" ? "#f59e0b" : stages.s3 === "active" ? "#60a5fa" : "var(--text-dim)"
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
                      color: stages.s4 === "completed" ? "#10b981" : stages.s4 === "active" ? "#60a5fa" : "var(--text-dim)"
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
        </div>
      ) : (
        /* Empty / No Job Selected State with Recent Protocol Jobs List */
        <div>
          <div className="glass-panel" style={{ padding: "36px 24px", textAlign: "center", marginBottom: "24px" }}>
            <Clock size={36} color="var(--text-dim)" style={{ marginBottom: "14px" }} />
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>Track Any Migration Job</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: "460px", margin: "0 auto" }}>
              Enter your Migration Job ID or Nova transaction hash above to track live bridge progress across all 4 stages directly from worker state.
            </p>
          </div>

          {/* Recent Migrations Section */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} color="#60a5fa" />
                <h4 style={{ fontSize: "16px", fontWeight: "700" }}>Recent Protocol Migrations</h4>
              </div>
              <button
                className="btn-primary"
                style={{ width: "auto", padding: "4px 10px", fontSize: "12px", background: "transparent", border: "none", color: "#60a5fa", boxShadow: "none" }}
                onClick={fetchRecentJobs}
                disabled={loadingRecent}
              >
                <RefreshCw size={12} className={loadingRecent ? "spin" : ""} style={{ marginRight: "4px" }} />
                Refresh
              </button>
            </div>

            {loadingRecent ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "13px" }}>
                Loading recent migrations from PostgreSQL...
              </div>
            ) : recentJobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "13px" }}>
                No migrations recorded yet. Create one on the Migrate tab!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentJobs.map((rj) => (
                  <div
                    key={rj.jobId}
                    onClick={() => handleSelectRecentJob(rj)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.4)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.4)";
                      e.currentTarget.style.background = "rgba(30, 41, 59, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
                      e.currentTarget.style.background = "rgba(15, 23, 42, 0.4)";
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main)" }}>
                          Job {formatShortHash(rj.jobId, 8, 6)}
                        </span>
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                          {rj.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                        Deposited: {new Date(rj.createdAt).toLocaleDateString()} at {new Date(rj.createdAt).toLocaleTimeString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "15px", fontWeight: "700", color: "#60a5fa" }}>
                          {formatEthValue(rj.principalAmount)} ETH
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          Msg #{rj.messagePosition}
                        </div>
                      </div>
                      <ArrowRight size={16} color="var(--text-dim)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
