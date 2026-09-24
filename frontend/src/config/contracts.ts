export const NOVA_ENTRY_ADDRESS = (
  process.env.NEXT_PUBLIC_NOVA_ENTRY_CONTRACT || "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const ETH_ROUTER_ADDRESS = (
  process.env.NEXT_PUBLIC_ETH_COMPLETION_ROUTER || "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

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
      { name: "workerReimbursement", type: "uint256" },
    ],
    outputs: [{ name: "ticketId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;
