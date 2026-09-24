"use client";

import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { CreateMigration } from "../components/CreateMigration";
import { JobTracker } from "../components/JobTracker";
import { EmergencyRecovery } from "../components/EmergencyRecovery";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"migrate" | "track" | "recovery">("migrate");
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);

  const handleMigrationCreated = (jobId: string) => {
    setTrackedJobId(jobId);
    setActiveTab("track");
  };

  return (
    <main className="container" style={{ paddingBottom: "60px" }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "migrate" && (
        <CreateMigration onMigrationCreated={handleMigrationCreated} />
      )}

      {activeTab === "track" && (
        <JobTracker initialJobId={trackedJobId} />
      )}

      {activeTab === "recovery" && (
        <EmergencyRecovery />
      )}

      {/* Footer Info */}
      <footer style={{ marginTop: "60px", textAlign: "center", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "24px", color: "var(--text-dim)", fontSize: "12px" }}>
        <p>Homeward — Self-Service Canonical Arbitrum Nova ETH Migration Protocol</p>
        <p style={{ marginTop: "4px" }}>
          Built with Arbitrum Nitro canonical bridge primitives. Worker advances gas on L1 with user-signed caps.
        </p>
      </footer>
    </main>
  );
}
