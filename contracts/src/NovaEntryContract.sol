// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IArbSys} from "./interfaces/IArbSys.sol";

/**
 * @title NovaEntryContract
 * @notice Entry point on Arbitrum Nova for initiating self-service ETH migrations to Arbitrum One.
 * Locks ETH, encodes migration instructions with signed caps, and sends via canonical ArbSys to Ethereum L1.
 */
contract NovaEntryContract is ReentrancyGuard {
    address public constant CANONICAL_ARBSYS = address(0x0000000000000000000000000000000000000064);

    /// @notice Target router on Ethereum L1 that receives the bridged message
    address public immutable ethCompletionRouter;

    /// @notice ArbSys instance (canonical precompile on Nova, mockable in tests)
    address public immutable arbSys;

    /// @notice Nonce tracker per depositor for unique job IDs
    mapping(address => uint256) public userNonces;

    struct MigrationJob {
        bytes32 jobId;
        address depositor;
        address beneficiary;
        uint256 amount;
        uint256 maxDeductions;
        uint256 executorReward;
        uint256 minDeliveryThreshold;
        uint256 messagePosition;
        uint256 createdAt;
    }

    /// @notice Lookup job details by jobId
    mapping(bytes32 => MigrationJob) public jobs;

    /// @notice Emitted when a migration job is initiated on Nova
    event MigrationJobCreated(
        bytes32 indexed jobId,
        uint256 indexed messagePosition,
        address indexed depositor,
        address beneficiary,
        uint256 amount,
        uint256 maxDeductions,
        uint256 executorReward,
        uint256 minDeliveryThreshold,
        uint256 timestamp
    );

    error InvalidRouterAddress();
    error InvalidBeneficiary();
    error InsufficientDeposit(uint256 provided, uint256 required);
    error InvalidDeductionCaps(uint256 maxDeductions, uint256 executorReward);
    error ZeroDeliveryThreshold();

    constructor(address _ethCompletionRouter, address _arbSys) {
        if (_ethCompletionRouter == address(0)) revert InvalidRouterAddress();
        ethCompletionRouter = _ethCompletionRouter;
        arbSys = _arbSys == address(0) ? CANONICAL_ARBSYS : _arbSys;
    }

    /**
     * @notice Initiates an ETH migration from Arbitrum Nova to Arbitrum One.
     * @param beneficiary Address on Arbitrum One that will receive the migrated ETH.
     * @param maxDeductions Maximum wei allowed to be deducted on L1 (gas reimbursement + executor reward).
     * @param executorReward Fixed wei reward for the executor worker upon successful completion.
     * @param minDeliveryThreshold Minimum wei the beneficiary must receive on Arbitrum One.
     * @return jobId Unique identifier for tracking this migration.
     * @return messagePosition The outbox message sequence number returned by ArbSys.
     */
    function createMigration(
        address beneficiary,
        uint256 maxDeductions,
        uint256 executorReward,
        uint256 minDeliveryThreshold
    ) external payable nonReentrant returns (bytes32 jobId, uint256 messagePosition) {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (minDeliveryThreshold == 0) revert ZeroDeliveryThreshold();
        if (executorReward > maxDeductions) revert InvalidDeductionCaps(maxDeductions, executorReward);

        uint256 requiredMinimum = maxDeductions + minDeliveryThreshold;
        if (msg.value < requiredMinimum) {
            revert InsufficientDeposit(msg.value, requiredMinimum);
        }

        uint256 nonce = userNonces[msg.sender]++;
        jobId = keccak256(
            abi.encode(block.chainid, address(this), msg.sender, beneficiary, msg.value, nonce, block.timestamp)
        );

        // Standard abi.encode (NOT abi.encodePacked) to prevent hash collision vulnerabilities
        bytes memory payload = abi.encodeWithSignature(
            "receiveFromNova(bytes32,address,address,uint256,uint256,uint256)",
            jobId,
            msg.sender,
            beneficiary,
            maxDeductions,
            executorReward,
            minDeliveryThreshold
        );

        // Initiate canonical bridge withdrawal to L1
        messagePosition = IArbSys(arbSys).sendTxToL1{value: msg.value}(ethCompletionRouter, payload);

        jobs[jobId] = MigrationJob({
            jobId: jobId,
            depositor: msg.sender,
            beneficiary: beneficiary,
            amount: msg.value,
            maxDeductions: maxDeductions,
            executorReward: executorReward,
            minDeliveryThreshold: minDeliveryThreshold,
            messagePosition: messagePosition,
            createdAt: block.timestamp
        });

        emit MigrationJobCreated(
            jobId,
            messagePosition,
            msg.sender,
            beneficiary,
            msg.value,
            maxDeductions,
            executorReward,
            minDeliveryThreshold,
            block.timestamp
        );
    }
}
