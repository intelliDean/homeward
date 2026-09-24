"use client";

import React from "react";
import { Clock, Activity, RefreshCw, ArrowRight } from "lucide-react";
import { MigrationJob } from "../../types";
import { formatEthValue, formatShortHash } from "../../lib/formatters";

interface RecentJobsListProps {
  recentJobs: MigrationJob[];
  loadingRecent: boolean;
  onRefresh: () => void;
  onSelectJob: (job: MigrationJob) => void;
}

export function RecentJobsList({
  recentJobs,
  loadingRecent,
  onRefresh,
  onSelectJob,
}: RecentJobsListProps) {
  return (
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
            onClick={onRefresh}
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
                onClick={() => onSelectJob(rj)}
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
  );
}
