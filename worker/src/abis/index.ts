export const NovaEntryContractAbi = [
  "event MigrationJobCreated(bytes32 indexed jobId, uint256 indexed messagePosition, address indexed depositor, address beneficiary, uint256 amount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 timestamp)",
  "function createMigration(address beneficiary, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold) external payable returns (bytes32 jobId, uint256 messagePosition)",
  "function jobs(bytes32) external view returns (bytes32 jobId, address depositor, address beneficiary, uint256 amount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 messagePosition, uint256 createdAt)"
];

export const EthCompletionRouterAbi = [
  "event JobReceivedFromNova(bytes32 indexed jobId, address indexed depositor, address indexed beneficiary, uint256 principalAmount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold)",
  "event JobForwarded(bytes32 indexed jobId, address indexed executor, address indexed beneficiary, uint256 netDeliveryAmount, uint256 totalWorkerReward, uint256 retryableCost, uint256 ticketId)",
  "event JobOverBudget(bytes32 indexed jobId, uint256 totalRequiredDeductions, uint256 maxAllowedDeductions)",
  "event EmergencyWithdrawalExecuted(bytes32 indexed jobId, address indexed recipient, uint256 amount)",
  "function receiveFromNova(bytes32 jobId, address depositor, address beneficiary, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold) external payable",
  "function forwardJob(bytes32 jobId, tuple(uint256 maxSubmissionCost, uint256 gasLimit, uint256 maxFeePerGas) gasParams, uint256 workerReimbursement) external returns (uint256 ticketId)",
  "function emergencyWithdraw(bytes32 jobId) external",
  "function jobs(bytes32) external view returns (uint8 status, address depositor, address beneficiary, uint256 principalAmount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 receivedTimestamp)",
  "function jobBalances(bytes32) external view returns (uint256)"
];

export const OutboxAbi = [
  "function executeTransaction(bytes32[] calldata proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes calldata data) external"
];

export const InboxAbi = [
  "function createRetryableTicket(address to, uint256 l2CallValue, uint256 maxSubmissionCost, address excessFeeRefundAddress, address callValueRefundAddress, uint256 gasLimit, uint256 maxFeePerGas, bytes calldata data) external payable returns (uint256)"
];
