"use client";

import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowLeftRight, Search, ShieldAlert, Sparkles } from "lucide-react";

interface NavbarProps {
  activeTab: "migrate" | "track" | "recovery";
  setActiveTab: (tab: "migrate" | "track" | "recovery") => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  return (
    <header>
      <nav className="navbar" aria-label="Main Navigation">
        <a href="#" className="brand" id="brand-logo" onClick={(e) => { e.preventDefault(); setActiveTab("migrate"); }}>
          <div className="brand-icon">
            <Sparkles size={22} />
          </div>
          <div className="brand-text">
            <h1>Homeward</h1>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span className="brand-badge">Self-Service ETH Migration</span>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Nova → L1 → One</span>
            </div>
          </div>
        </a>

        <div>
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </nav>

      {/* Navigation Switcher Tabs */}
      <div className="tabs-container" role="tablist">
        <button
          id="tab-migrate-btn"
          role="tab"
          aria-selected={activeTab === "migrate"}
          className={`tab-btn ${activeTab === "migrate" ? "active" : ""}`}
          onClick={() => setActiveTab("migrate")}
        >
          <ArrowLeftRight size={18} />
          <span>New Migration</span>
        </button>

        <button
          id="tab-track-btn"
          role="tab"
          aria-selected={activeTab === "track"}
          className={`tab-btn ${activeTab === "track" ? "active" : ""}`}
          onClick={() => setActiveTab("track")}
        >
          <Search size={18} />
          <span>Live Job Tracker</span>
        </button>

        <button
          id="tab-recovery-btn"
          role="tab"
          aria-selected={activeTab === "recovery"}
          className={`tab-btn ${activeTab === "recovery" ? "active" : ""}`}
          onClick={() => setActiveTab("recovery")}
        >
          <ShieldAlert size={18} />
          <span>Emergency Recovery</span>
        </button>
      </div>
    </header>
  );
}
