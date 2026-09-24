"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search, AlertTriangle, RefreshCw } from "lucide-react";
import { MigrationJob } from "../types";
import { getStageStates, calculateChallengeProgress } from "../lib/formatters";
import { JobStats } from "./tracker/JobStats";
import { StageStepper } from "./tracker/StageStepper";
import { RecentJobsList } from "./tracker/RecentJobsList";

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

  // Synchronize when initialJobId prop changes
  useEffect(() => {
    if (initialJobId && initialJobId !== activeJobId) {
      setJobIdInput(initialJobId);
      setActiveJobId(initialJobId);
    }
  }, [initialJobId, activeJobId]);

  // Fetch single job details from /api/jobs/[id]
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

  // Fetch recent protocol migrations
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

  // Initial load
  useEffect(() => {
    if (activeJobId) {
      fetchJob(activeJobId);
    } else {
      fetchRecentJobs();
    }
  }, [activeJobId, fetchJob, fetchRecentJobs]);

  // Live polling every 6s when active job is selected
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(() => {
      fetchJob(activeJobId, true);
    }, 6000);

    return () => clearInterval(interval);
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

  const stages = getStageStates(job);
  const challengeInfo = calculateChallengeProgress(job?.createdAt);

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
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.1)",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                    animation: "pulse 2s infinite",
                  }}
                />
                Live Sync
              </span>
              <button
                className="btn-primary"
                style={{
                  width: "auto",
                  padding: "6px 12px",
                  fontSize: "12px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  boxShadow: "none",
                }}
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
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#fca5a5",
          }}
        >
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
          <JobStats job={job} lastSynced={lastSynced} />
          <StageStepper job={job} stages={stages} challengeInfo={challengeInfo} />
        </div>
      ) : (
        <RecentJobsList
          recentJobs={recentJobs}
          loadingRecent={loadingRecent}
          onRefresh={fetchRecentJobs}
          onSelectJob={handleSelectRecentJob}
        />
      )}
    </div>
  );
}
