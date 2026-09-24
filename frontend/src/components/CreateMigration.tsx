"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useSwitchChain } from "wagmi";
import { parseEther, formatEther, isAddress, keccak256, toHex } from "viem";
import { ArrowRight, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { arbitrumNova, arbitrumSepolia } from "wagmi/chains";

const NOVA_ENTRY_ADDRESS = (process.env.NEXT_PUBLIC_NOVA_ENTRY_CONTRACT || "0x0000000000000000000000000000000000000000") as `0x${string}`;

const NovaEntryAbi = [
  {
    type: "function",
    name: "createMigration",
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "maxDeductions", type: "uint256" },
      { name: "executorReward", type: "uint256" },
      { name: "minDeliveryThreshold", type: "uint256" },
    ],
    outputs: [
      { name: "jobId", type: "bytes32" },
      { name: "messagePosition", type: "uint256" },
    ],
    stateMutability: "payable",
  },
] as const;

interface CreateMigrationProps {
  onMigrationCreated: (jobId: string) => void;
}

export function CreateMigration({ onMigrationCreated }: CreateMigrationProps) {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: balanceData } = useBalance({ address });

  const [amountEth, setAmountEth] = useState("0.5");
  const [beneficiary, setBeneficiary] = useState("");
  const [maxDeductionsEth, setMaxDeductionsEth] = useState("0.025");
  const [executorRewardEth, setExecutorRewardEth] = useState("0.005");
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (address && !beneficiary) {
      setBeneficiary(address);
    }
  }, [address, beneficiary]);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isWaitingReceipt, isSuccess: isMined } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const parsedAmount = (() => {
    try { return parseEther(amountEth || "0"); } catch { return 0n; }
  })();

  const parsedMaxDeductions = (() => {
    try { return parseEther(maxDeductionsEth || "0"); } catch { return 0n; }
  })();

  const parsedExecutorReward = (() => {
    try { return parseEther(executorRewardEth || "0"); } catch { return 0n; }
  })();

  const minDeliveryThreshold = parsedAmount > parsedMaxDeductions ? parsedAmount - parsedMaxDeductions : 0n;

  const isNovaNetwork = chain?.id === arbitrumNova.id || chain?.id === arbitrumSepolia.id;
  const isValidBeneficiary = isAddress(beneficiary);
  const isValidAmount = parsedAmount > 0n && parsedAmount > parsedMaxDeductions;
  const isValidCaps = parsedExecutorReward <= parsedMaxDeductions && parsedMaxDeductions > 0n;
  const canSubmit = isConnected && isValidBeneficiary && isValidAmount && isValidCaps && !isPending && !isWaitingReceipt;

  const handleInitiate = async () => {
    if (!isNovaNetwork) {
      switchChain({ chainId: arbitrumSepolia.id });
      return;
    }

    if (!canSubmit) return;

    // Trigger on-chain call
    writeContract({
      address: NOVA_ENTRY_ADDRESS,
      abi: NovaEntryAbi,
      functionName: "createMigration",
      args: [
        beneficiary as `0x${string}`,
        parsedMaxDeductions,
        parsedExecutorReward,
        minDeliveryThreshold,
      ],
      value: parsedAmount,
    });
  };

  useEffect(() => {
    if (isMined && txHash) {
      // Calculate or use txHash as job tracking reference
      const mockJobId = keccak256(toHex(txHash));
      setCreatedJobId(mockJobId);
    }
  }, [isMined, txHash]);

  return (
    <div style={{ maxWidth: "620px", margin: "0 auto" }}>
      <div className="glass-panel" style={{ padding: "32px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px" }}>
            Migrate ETH from Arbitrum Nova
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.5" }}>
            Self-service canonical migration via Ethereum L1 to Arbitrum One. A background worker advances gas on L1 and is reimbursed strictly within your signed cap.
          </p>
        </div>

        {/* Amount Input */}
        <div className="form-group">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <label className="form-label">Migration Amount</label>
            {balanceData && (
              <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                Balance: {Number(balanceData.formatted).toFixed(4)} ETH
              </span>
            )}
          </div>
          <div className="input-wrapper">
            <input
              id="migration-amount-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.0"
              className="input-field"
              value={amountEth}
              onChange={(e) => setAmountEth(e.target.value)}
            />
            <span className="input-suffix">ETH</span>
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {["0.1", "0.25", "0.5", "1.0"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountEth(preset)}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {preset} ETH
              </button>
            ))}
          </div>
        </div>

        {/* Beneficiary Address */}
        <div className="form-group">
          <label className="form-label">Recipient on Arbitrum One (Beneficiary)</label>
          <div className="input-wrapper">
            <input
              id="beneficiary-address-input"
              type="text"
              placeholder="0x..."
              className="input-field"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
            />
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>
            Canonical retryable ticket will deliver funds directly to this address on Arbitrum One.
          </p>
        </div>

        {/* Gas & Fee Deductions Breakdown */}
        <div style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <ShieldCheck size={18} color="#3b82f6" />
            <span style={{ fontSize: "14px", fontWeight: "700" }}>Protected Gas & Reward Caps</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
            <span>Max Deductions Cap (L1 Gas + Ticket):</span>
            <input
              type="text"
              value={maxDeductionsEth}
              onChange={(e) => setMaxDeductionsEth(e.target.value)}
              style={{ width: "90px", textAlign: "right", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "4px 8px", color: "white" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
            <span>Executor Success Reward:</span>
            <input
              type="text"
              value={executorRewardEth}
              onChange={(e) => setExecutorRewardEth(e.target.value)}
              style={{ width: "90px", textAlign: "right", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "4px 8px", color: "white" }}
            />
          </div>

          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "10px", marginTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ fontWeight: "700", color: "#60a5fa" }}>Guaranteed Min Received:</span>
            <span style={{ fontWeight: "800", color: "#10b981", fontSize: "16px" }}>
              {minDeliveryThreshold > 0n ? formatEther(minDeliveryThreshold) : "0.0"} ETH
            </span>
          </div>
        </div>

        {/* Warnings & Feedback */}
        {writeError && (
          <div style={{ display: "flex", gap: "10px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "10px", padding: "12px", marginBottom: "20px", color: "#f87171", fontSize: "13px" }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>Transaction Error: {writeError.message.slice(0, 120)}...</span>
          </div>
        )}

        {/* Action Button */}
        {!isConnected ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "8px" }}>
              Please connect your wallet to initiate a migration
            </p>
          </div>
        ) : !isNovaNetwork ? (
          <button
            id="switch-network-btn"
            className="btn-primary"
            onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
          >
            Switch to Arbitrum Sepolia / Nova
          </button>
        ) : (
          <button
            id="initiate-migration-btn"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={handleInitiate}
          >
            {isPending || isWaitingReceipt ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Confirming On-Chain...</span>
              </>
            ) : (
              <>
                <span>Deposit & Authorize Migration</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        )}

        {/* Success Confirmation Card */}
        {isMined && (
          <div style={{ marginTop: "24px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#10b981", fontWeight: "700", marginBottom: "8px" }}>
              <CheckCircle2 size={20} />
              <span>Migration Job Successfully Created!</span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
              ETH has been locked in NovaEntryContract and the canonical L2→L1 message is dispatched. The challenge period has started.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                id="view-job-btn"
                className="btn-primary"
                style={{ padding: "10px 16px", fontSize: "14px" }}
                onClick={() => {
                  if (createdJobId) onMigrationCreated(createdJobId);
                }}
              >
                Track Migration Progress
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
