// Testnet (Arbitrum Sepolia acting as Nova) contract addresses.
// These are NEVER used on mainnet chains — see getNovaEntryAddress / getEthRouterAddress guards below.
export const TESTNET_NOVA_ENTRY_ADDRESS = (
  process.env.NEXT_PUBLIC_NOVA_ENTRY_CONTRACT || "0x9BAa272667CD4c7e9b542BA97F5dAfbDb5aca32F"
) as `0x${string}`;

export const TESTNET_ETH_ROUTER_ADDRESS = (
  process.env.NEXT_PUBLIC_ETH_COMPLETION_ROUTER || "0x82f1399FC6a122E59888aBb4741008ADA7CC9088"
) as `0x${string}`;

/**
 * Returns the NovaEntryContract address for the given chain, or null when
 * no mainnet contract is configured — preventing silent fallback to testnet addresses.
 */
export function getNovaEntryAddress(chainId?: number): `0x${string}` | null {
  if (chainId === 42170) {
    // Mainnet Arbitrum Nova — only proceed if explicitly configured
    const addr = process.env.NEXT_PUBLIC_MAINNET_NOVA_ENTRY_CONTRACT;
    return addr ? (addr as `0x${string}`) : null;
  }
  if (chainId === 421614) {
    // Arbitrum Sepolia testnet path
    return TESTNET_NOVA_ENTRY_ADDRESS;
  }
  return null;
}

/**
 * Returns the EthCompletionRouter address for the given L1 chain, or null
 * when no mainnet address is configured.
 */
export function getEthRouterAddress(chainId?: number): `0x${string}` | null {
  if (chainId === 1) {
    const addr = process.env.NEXT_PUBLIC_MAINNET_ETH_COMPLETION_ROUTER;
    return addr ? (addr as `0x${string}`) : null;
  }
  if (chainId === 11155111) {
    return TESTNET_ETH_ROUTER_ADDRESS;
  }
  return null;
}

export const NovaEntryAbi = [
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

export const EthRouterAbi = [
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
    ],
    outputs: [{ name: "ticketId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;
