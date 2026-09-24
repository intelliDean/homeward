import { ethers } from "ethers";
import { getConfig } from "./config";
import { novaProvider, l1Provider } from "./providers";

export const NOVA_ENTRY_ABI = [
  "function jobs(bytes32) external view returns (bytes32 jobId, address depositor, address beneficiary, uint256 amount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 messagePosition, uint256 createdAt)",
];

export const ETH_ROUTER_ABI = [
  "function jobs(bytes32) external view returns (uint8 status, address depositor, address beneficiary, uint256 principalAmount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 receivedTimestamp)",
  "function jobBalances(bytes32) external view returns (uint256)",
  "function forwardJob(bytes32 jobId, tuple(uint256 maxSubmissionCost, uint256 gasLimit, uint256 maxFeePerGas) gasParams, uint256 workerReimbursement) external returns (uint256)",
  "function emergencyWithdraw(bytes32 jobId) external",
];

export const ROUTER_STATUS_NAMES = [
  "None",
  "Received",
  "Completed",
  "EmergencyClaimed",
] as const;

export function getNovaEntryContract(runner: ethers.ContractRunner = novaProvider): ethers.Contract {
  const { novaEntryAddress } = getConfig();
  return new ethers.Contract(novaEntryAddress, NOVA_ENTRY_ABI, runner);
}

export function getEthRouterContract(runner: ethers.ContractRunner = l1Provider): ethers.Contract {
  const { ethCompletionRouterAddress } = getConfig();
  return new ethers.Contract(ethCompletionRouterAddress, ETH_ROUTER_ABI, runner);
}
