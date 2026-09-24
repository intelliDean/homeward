// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOutbox} from "./interfaces/IOutbox.sol";
import {IInbox} from "./interfaces/IInbox.sol";

/**
 * @title EthCompletionRouter
 * @notice Receives bridged ETH on Ethereum L1 from Arbitrum Nova via the canonical Outbox.
 * Reimburses the gas-advancing worker according to signed caps, isolates job accounting,
 * and forwards the remaining net ETH to Arbitrum One using canonical createRetryableTicket.
 */
contract EthCompletionRouter is ReentrancyGuard {
    /// @notice Canonical Nova Outbox contract on Ethereum L1
    address public immutable novaOutbox;

    /// @notice Authorized NovaEntryContract address on Arbitrum Nova
    address public immutable novaEntryContract;

    /// @notice Canonical Arbitrum One Inbox contract on Ethereum L1
    address public immutable arbOneInbox;

    /// @notice Time window after which depositor or beneficiary can reclaim funds if job unforwarded
    uint256 public constant EMERGENCY_DELAY = 14 days;

    enum JobStatus {
        None,
        Received,
        Completed,
        EmergencyClaimed
    }

    struct Job {
        JobStatus status;
        address depositor;
        address beneficiary;
        uint256 principalAmount;
        uint256 maxDeductions;
        uint256 executorReward;
        uint256 minDeliveryThreshold;
        uint256 receivedTimestamp;
    }

    struct RetryableGasParams {
        uint256 maxSubmissionCost;
        uint256 gasLimit;
        uint256 maxFeePerGas;
    }

    /// @notice Isolated job accounting: jobId => Job state
    mapping(bytes32 => Job) public jobs;

    /// @notice Isolated job balances: jobId => remaining balance
    mapping(bytes32 => uint256) public jobBalances;

    event JobReceivedFromNova(
        bytes32 indexed jobId,
        address indexed depositor,
        address indexed beneficiary,
        uint256 principalAmount,
        uint256 maxDeductions,
        uint256 executorReward,
        uint256 minDeliveryThreshold
    );

    event JobForwarded(
        bytes32 indexed jobId,
        address indexed executor,
        address indexed beneficiary,
        uint256 netDeliveryAmount,
        uint256 totalWorkerReward,
        uint256 retryableCost,
        uint256 ticketId
    );

    event JobOverBudget(bytes32 indexed jobId, uint256 totalRequiredDeductions, uint256 maxAllowedDeductions);

    event EmergencyWithdrawalExecuted(bytes32 indexed jobId, address indexed recipient, uint256 amount);

    error OnlyNovaOutbox();
    error UnauthorizedL2Sender(address actual, address expected);
    error JobAlreadyExists(bytes32 jobId);
    error JobNotReceived(bytes32 jobId);
    error ExceedsMaxDeductions(uint256 required, uint256 maxAllowed);
    error BelowMinDeliveryThreshold(uint256 netDelivery, uint256 minThreshold);
    error WorkerCompensationFailed();
    error EmergencyDelayNotMet(uint256 currentTimestamp, uint256 unlockTimestamp);
    error OnlyBeneficiaryOrDepositor();
    error TransferFailed();

    constructor(address _novaOutbox, address _novaEntryContract, address _arbOneInbox) {
        novaOutbox = _novaOutbox;
        novaEntryContract = _novaEntryContract;
        arbOneInbox = _arbOneInbox;
    }

    /**
     * @notice Invoked by the canonical Nova Outbox during L2->L1 message execution.
     * Verifies that the caller is novaOutbox and the original L2 sender was novaEntryContract.
     */
    function receiveFromNova(
        bytes32 jobId,
        address depositor,
        address beneficiary,
        uint256 maxDeductions,
        uint256 executorReward,
        uint256 minDeliveryThreshold
    ) external payable nonReentrant {
        if (msg.sender != novaOutbox) revert OnlyNovaOutbox();

        address l2Sender = IOutbox(novaOutbox).l2ToL1Sender();
        if (l2Sender != novaEntryContract) {
            revert UnauthorizedL2Sender(l2Sender, novaEntryContract);
        }

        if (jobs[jobId].status != JobStatus.None) revert JobAlreadyExists(jobId);

        jobs[jobId] = Job({
            status: JobStatus.Received,
            depositor: depositor,
            beneficiary: beneficiary,
            principalAmount: msg.value,
            maxDeductions: maxDeductions,
            executorReward: executorReward,
            minDeliveryThreshold: minDeliveryThreshold,
            receivedTimestamp: block.timestamp
        });

        jobBalances[jobId] = msg.value;

        emit JobReceivedFromNova(
            jobId, depositor, beneficiary, msg.value, maxDeductions, executorReward, minDeliveryThreshold
        );
    }

    /**
     * @notice Completes the migration by dispatching a retryable ticket to Arbitrum One.
     * Reimburses worker gas costs + executor reward, and sends remainder to beneficiary on Arb One.
     *
     * @param jobId The unique migration ID
     * @param gasParams Struct containing maxSubmissionCost, gasLimit, and maxFeePerGas
     * @param workerReimbursement Gas reimbursement claimed by worker for L1 execution
     */
    function forwardJob(bytes32 jobId, RetryableGasParams calldata gasParams, uint256 workerReimbursement)
        external
        nonReentrant
        returns (uint256 ticketId)
    {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Received) revert JobNotReceived(jobId);

        uint256 retryableGasCost = gasParams.maxSubmissionCost + (gasParams.gasLimit * gasParams.maxFeePerGas);
        uint256 totalWorkerReward = workerReimbursement + job.executorReward;
        uint256 totalDeductions = totalWorkerReward + retryableGasCost;

        if (totalDeductions > job.maxDeductions) {
            emit JobOverBudget(jobId, totalDeductions, job.maxDeductions);
            revert ExceedsMaxDeductions(totalDeductions, job.maxDeductions);
        }

        if (totalDeductions >= job.principalAmount) {
            revert ExceedsMaxDeductions(totalDeductions, job.principalAmount);
        }

        uint256 netDeliveryAmount = job.principalAmount - totalDeductions;
        if (netDeliveryAmount < job.minDeliveryThreshold) {
            revert BelowMinDeliveryThreshold(netDeliveryAmount, job.minDeliveryThreshold);
        }

        address beneficiary = job.beneficiary;

        // Checks-Effects-Interactions: Update state before external calls
        job.status = JobStatus.Completed;
        jobBalances[jobId] = 0;

        // 1. Reimburses the executor worker
        if (totalWorkerReward > 0) {
            (bool success,) = payable(msg.sender).call{value: totalWorkerReward}("");
            if (!success) revert WorkerCompensationFailed();
        }

        // 2. Dispatches retryable ticket to Arbitrum One Inbox
        // SECURITY CRITICAL: Both excessFeeRefundAddress and callValueRefundAddress MUST be beneficiary!
        ticketId = IInbox(arbOneInbox).createRetryableTicket{value: retryableGasCost + netDeliveryAmount}(
            beneficiary, // destination on Arb One
            netDeliveryAmount, // l2CallValue
            gasParams.maxSubmissionCost,
            beneficiary, // excessFeeRefundAddress (ALWAYS beneficiary)
            beneficiary, // callValueRefundAddress (ALWAYS beneficiary)
            gasParams.gasLimit,
            gasParams.maxFeePerGas,
            "" // empty calldata for direct ETH transfer
        );

        emit JobForwarded(
            jobId, msg.sender, beneficiary, netDeliveryAmount, totalWorkerReward, retryableGasCost, ticketId
        );
    }

    /**
     * @notice Emergency escape hatch allowing depositor or beneficiary to withdraw principal
     * if the job is not forwarded within EMERGENCY_DELAY (14 days).
     */
    function emergencyWithdraw(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Received) revert JobNotReceived(jobId);

        uint256 unlockTime = job.receivedTimestamp + EMERGENCY_DELAY;
        if (block.timestamp < unlockTime) {
            revert EmergencyDelayNotMet(block.timestamp, unlockTime);
        }

        if (msg.sender != job.beneficiary && msg.sender != job.depositor) {
            revert OnlyBeneficiaryOrDepositor();
        }

        uint256 amount = jobBalances[jobId];
        job.status = JobStatus.EmergencyClaimed;
        jobBalances[jobId] = 0;

        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit EmergencyWithdrawalExecuted(jobId, msg.sender, amount);
    }
}
