"use client";

import React, { useState } from "react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { ShieldAlert, AlertTriangle, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { sepolia, mainnet } from "wagmi/chains";

const ETH_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_ETH_COMPLETION_ROUTER || "0x0000000000000000000000000000000000000000") as `0x${string}`;

const EthRouterAbi = [
  {
    type: "function",
    name: "emergencyWithdraw",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forwardJob",
    inputs: [
      { name: "jobId", type: "bytes32" },
      {
        name: "gasParams",
        type: "tuple",
        components: [
          { name: "maxSubmissionCost", type: "uint256" },
          { name: "gasLimit", type: "uint256" },
          { name: "maxFeePerGas", type: "uint256" },
        ],
      },
      { name: "workerReimbursement", type: "uint256" },
    ],
    outputs: [{ name: "ticketId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

export function EmergencyRecovery() {
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const [jobId, setJobId] = useState("");
  const [actionType, setActionType] = useState<"forward" | "emergency">("forward");

  const { writeContract, isPending, error, isSuccess } = useWriteContract();

  const isL1 = chain?.id === sepolia.id || chain?.id === mainnet.id;

  const handleAction = () => {
    if (!isL1) {
      switchChain({ chainId: sepolia.id });
      return;
    }

    if (!jobId.startsWith("0x") || jobId.length !== 66) {
      alert("Please enter a valid 32-byte Job ID (0x...)");
      return;
    }

    if (actionType === "emergency") {
      writeContract({
        address: ETH_ROUTER_ADDRESS,
        abi: EthRouterAbi,
        functionName: "emergencyWithdraw",
        args: [jobId as `0x${string}`],
      });
    } else {
      writeContract({
        address: ETH_ROUTER_ADDRESS,
        abi: EthRouterAbi,
        functionName: "forwardJob",
        args: [
          jobId as `0x${string}`,
          {
            maxSubmissionCost: 500000000000000n, // 0.0005 ETH
            gasLimit: 100000n,
            maxFeePerGas: 200000000n, // 0.2 gwei
          },
          0n, // 0 reimbursement for self-recovery
        ],
      });
    }
  };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div className="glass-panel" style={{ padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{ background: "rgba(245, 158, 11, 0.15)", padding: "10px", borderRadius: "10px", color: "#f59e0b" }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: "800" }}>Self-Service Emergency Recovery</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              Bypass the background worker and interact directly with the Ethereum L1 router.
            </p>
          </div>
        </div>

        <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", color: "var(--text-dim)", fontSize: "13px", lineHeight: "1.5" }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ color: "var(--text-main)" }}>Trustless Security Invariant:</strong>
              <p style={{ marginTop: "4px" }}>
                The Homeward worker holds gas funds only — it NEVER controls your migration principal. If the worker is offline, you can manually trigger forwarding or withdraw 100% of your ETH after the 14-day timeout.
              </p>
            </div>
          </div>
        </div>

        {/* Action Selector */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <button
            type="button"
            className={`tab-btn ${actionType === "forward" ? "active" : ""}`}
            style={{ flex: 1, border: "1px solid var(--border-color)" }}
            onClick={() => setActionType("forward")}
          >
            <span>Manual Forward to Arb One</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${actionType === "emergency" ? "active" : ""}`}
            style={{ flex: 1, border: "1px solid var(--border-color)" }}
            onClick={() => setActionType("emergency")}
          >
            <span>Emergency Withdraw (14d Timeout)</span>
          </button>
        </div>

        {/* Job ID Input */}
        <div className="form-group">
          <label className="form-label">Migration Job ID</label>
          <div className="input-wrapper">
            <input
              id="emergency-job-id-input"
              type="text"
              placeholder="0x..."
              className="input-field"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "10px", padding: "12px", marginBottom: "20px", color: "#f87171", fontSize: "13px" }}>
            Recovery Error: {error.message.slice(0, 140)}...
          </div>
        )}

        {isSuccess && (
          <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px", padding: "12px", marginBottom: "20px", color: "#34d399", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={18} />
            <span>Recovery transaction submitted successfully!</span>
          </div>
        )}

        {/* Submit */}
        {!isConnected ? (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center" }}>
            Connect wallet to perform emergency recovery
          </p>
        ) : !isL1 ? (
          <button
            id="switch-to-l1-btn"
            className="btn-primary"
            onClick={() => switchChain({ chainId: sepolia.id })}
          >
            Switch to Ethereum L1 (Sepolia)
          </button>
        ) : (
          <button
            id="execute-recovery-btn"
            className="btn-primary"
            disabled={isPending || !jobId}
            onClick={handleAction}
          >
            {isPending ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Broadcasting to L1...</span>
              </>
            ) : (
              <>
                <span>{actionType === "forward" ? "Trigger Manual Forward" : "Reclaim Principal on L1"}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
