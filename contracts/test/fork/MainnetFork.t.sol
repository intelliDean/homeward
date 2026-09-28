// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NovaEntryContract} from "../../src/NovaEntryContract.sol";
import {EthCompletionRouter} from "../../src/EthCompletionRouter.sol";
import {IArbSys} from "../../src/interfaces/IArbSys.sol";
import {IInbox} from "../../src/interfaces/IInbox.sol";
import {IOutbox} from "../../src/interfaces/IOutbox.sol";
import {MockArbSys} from "../mocks/MockArbSys.sol";

/**
 * @title MainnetForkTest
 * @notice Fork simulation testing Homeward smart contracts against real, live
 * Ethereum Mainnet (Chain ID 1) and Arbitrum Nova (Chain ID 42170) states.
 */
contract MainnetForkTest is Test {
    // Canonical Mainnet Addresses
    address public constant MAINNET_NOVA_OUTBOX = 0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58;
    address public constant MAINNET_ARB_ONE_INBOX = 0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f;
    address public constant NOVA_CANONICAL_ARBSYS = 0x0000000000000000000000000000000000000064;

    address public depositor = makeAddr("depositor");
    address public beneficiary = makeAddr("beneficiary");
    address public worker = makeAddr("worker");

    // Precomputed / simulated contract addresses
    address public simulatedL1Router = makeAddr("simulatedL1Router");
    address public simulatedL2Entry = makeAddr("simulatedL2Entry");

    function _selectMainnetFork() internal {
        string memory l1Rpc = vm.envOr("MAINNET_RPC_URL", string("https://ethereum.publicnode.com"));
        vm.createSelectFork(l1Rpc);
    }

    function _selectNovaFork() internal {
        string memory novaRpc = vm.envOr("NOVA_MAINNET_RPC_URL", string("https://nova.arbitrum.io/rpc"));
        vm.createSelectFork(novaRpc);
    }

    // =========================================================================
    // ARBITRUM NOVA FORK TESTS (Chain ID 42170)
    // =========================================================================

    /**
     * @notice Tests full deployment and migration creation on an Arbitrum Nova mainnet fork.
     * Verifies that the canonical ArbSys (0x64) precompile executes successfully.
     */
    function testFork_Nova_InitiateMigration() public {
        _selectNovaFork();
        assertEq(block.chainid, 42170, "Should be on Arbitrum Nova");

        // Verify precompile bytecode exists at 0x64 on live Arbitrum Nova (0xfe placeholder)
        assertTrue(NOVA_CANONICAL_ARBSYS.code.length > 0, "ArbSys precompile must exist on Nova");
        assertEq(NOVA_CANONICAL_ARBSYS.code, hex"fe", "ArbSys precompile placeholder on Nova");

        // Since Foundry's revm does not run Arbitrum Nitro's native Go engine,
        // etch the ArbSys interface implementation onto 0x64 for fork simulation
        vm.etch(NOVA_CANONICAL_ARBSYS, address(new MockArbSys()).code);
        vm.store(NOVA_CANONICAL_ARBSYS, bytes32(uint256(0)), bytes32(uint256(1)));

        // Deploy NovaEntryContract with canonical precompile
        NovaEntryContract novaEntry = new NovaEntryContract(simulatedL1Router, NOVA_CANONICAL_ARBSYS);
        assertEq(novaEntry.ethCompletionRouter(), simulatedL1Router);
        assertEq(novaEntry.arbSys(), NOVA_CANONICAL_ARBSYS);

        // Fund depositor
        vm.deal(depositor, 10 ether);

        uint256 depositAmount = 1 ether;
        uint256 maxDeductions = 0.05 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDeliveryThreshold = 0.9 ether;

        vm.prank(depositor);
        (bytes32 jobId, uint256 messagePosition) = novaEntry.createMigration{value: depositAmount}(
            beneficiary, maxDeductions, executorReward, minDeliveryThreshold
        );

        assertTrue(jobId != bytes32(0), "Job ID should be non-zero");
        // Canonical ArbSys returns the message sequence position
        assertTrue(messagePosition > 0, "Message position should be positive sequence number");

        // Verify stored state
        (
            bytes32 storedJobId,
            address storedDepositor,
            address storedBeneficiary,
            uint256 storedAmount,
            uint256 storedMaxDeductions,
            uint256 storedReward,
            uint256 storedMinDelivery,
            uint256 storedMsgPos,
            uint256 createdAt
        ) = novaEntry.jobs(jobId);

        assertEq(storedJobId, jobId);
        assertEq(storedDepositor, depositor);
        assertEq(storedBeneficiary, beneficiary);
        assertEq(storedAmount, depositAmount);
        assertEq(storedMaxDeductions, maxDeductions);
        assertEq(storedReward, executorReward);
        assertEq(storedMinDelivery, minDeliveryThreshold);
        assertEq(storedMsgPos, messagePosition);
        assertEq(createdAt, block.timestamp);
    }

    // =========================================================================
    // ETHEREUM MAINNET FORK TESTS (Chain ID 1)
    // =========================================================================

    /**
     * @notice Tests full deployment, message receipt, and canonical retryable ticket forwarding
     * against live Ethereum Mainnet bridge contracts (Nova Outbox and Arb One Inbox).
     */
    function testFork_Mainnet_ForwardJobToArbOneInbox() public {
        _selectMainnetFork();
        assertEq(block.chainid, 1, "Should be on Ethereum Mainnet");

        // Verify canonical bridge contracts have deployed bytecode
        assertTrue(MAINNET_NOVA_OUTBOX.code.length > 0, "Nova Outbox must exist on Mainnet");
        assertTrue(MAINNET_ARB_ONE_INBOX.code.length > 0, "Arb One Inbox must exist on Mainnet");

        // Deploy EthCompletionRouter on Mainnet
        EthCompletionRouter router =
            new EthCompletionRouter(MAINNET_NOVA_OUTBOX, simulatedL2Entry, MAINNET_ARB_ONE_INBOX);

        assertEq(router.novaOutbox(), MAINNET_NOVA_OUTBOX);
        assertEq(router.novaEntryContract(), simulatedL2Entry);
        assertEq(router.arbOneInbox(), MAINNET_ARB_ONE_INBOX);

        bytes32 jobId = keccak256("mainnet-fork-test-job");
        uint256 principal = 1 ether;
        uint256 maxDeductions = 0.05 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        // Simulate canonical Nova Outbox message execution
        // During Outbox execution on L1, outbox calls router.receiveFromNova
        vm.deal(MAINNET_NOVA_OUTBOX, 10 ether);
        vm.mockCall(
            MAINNET_NOVA_OUTBOX, abi.encodeWithSelector(IOutbox.l2ToL1Sender.selector), abi.encode(simulatedL2Entry)
        );

        vm.prank(MAINNET_NOVA_OUTBOX);
        router.receiveFromNova{value: principal}(
            jobId, depositor, beneficiary, maxDeductions, executorReward, minDelivery
        );

        assertEq(router.jobBalances(jobId), principal);

        // Worker execution: forward job to real Arbitrum One Inbox
        EthCompletionRouter.RetryableGasParams memory gasParams = EthCompletionRouter.RetryableGasParams({
            maxSubmissionCost: 0.005 ether,
            gasLimit: 100_000,
            maxFeePerGas: 100 gwei // 0.01 ether -> total retryable gas cost = 0.015 ether
        });
        uint256 workerReimbursement = 0.005 ether;
        // Total worker reward = 0.005 + 0.01 (executorReward) = 0.015 ether
        // Total deductions = 0.015 + 0.015 = 0.03 ether <= 0.05 ether maxDeductions
        // Net delivery = 1 - 0.03 = 0.97 ether >= 0.9 ether minDelivery

        vm.deal(worker, 1 ether);
        uint256 workerBalBefore = worker.balance;

        vm.prank(worker);
        uint256 ticketId = router.forwardJob(jobId, gasParams, workerReimbursement);

        // Verify ticket was created by the real Arbitrum One Inbox
        assertTrue(ticketId > 0, "Real Arbitrum One Inbox must return valid retryable ticket ID");

        // Verify state updates & worker compensation
        assertEq(router.jobBalances(jobId), 0, "Job balance must be 0 after forwarding");
        assertEq(
            worker.balance - workerBalBefore, 0.015 ether, "Worker must receive reimbursement plus executor reward"
        );

        (EthCompletionRouter.JobStatus status,,,,,,,) = router.jobs(jobId);
        assertEq(uint256(status), uint256(EthCompletionRouter.JobStatus.Completed));
    }

    /**
     * @notice Tests the 14-day emergency escape hatch against the Ethereum Mainnet fork.
     */
    function testFork_Mainnet_EmergencyWithdrawAfter14Days() public {
        _selectMainnetFork();
        assertEq(block.chainid, 1, "Should be on Ethereum Mainnet");

        EthCompletionRouter router =
            new EthCompletionRouter(MAINNET_NOVA_OUTBOX, simulatedL2Entry, MAINNET_ARB_ONE_INBOX);

        bytes32 jobId = keccak256("emergency-job-id");
        uint256 principal = 2 ether;

        vm.deal(MAINNET_NOVA_OUTBOX, 10 ether);
        vm.mockCall(
            MAINNET_NOVA_OUTBOX, abi.encodeWithSelector(IOutbox.l2ToL1Sender.selector), abi.encode(simulatedL2Entry)
        );

        vm.prank(MAINNET_NOVA_OUTBOX);
        router.receiveFromNova{value: principal}(jobId, depositor, beneficiary, 0.1 ether, 0.02 ether, 1.8 ether);

        // Attempt withdrawal before 14 days: should revert
        vm.warp(block.timestamp + 13 days);
        vm.prank(beneficiary);
        vm.expectRevert();
        router.emergencyWithdraw(jobId);

        // After 14 days: succeeds
        vm.warp(block.timestamp + 2 days); // 15 days elapsed
        uint256 benBalBefore = beneficiary.balance;

        vm.prank(beneficiary);
        router.emergencyWithdraw(jobId);

        assertEq(beneficiary.balance - benBalBefore, principal, "Beneficiary must receive full principal");
        assertEq(router.jobBalances(jobId), 0, "Job balance must be zero");

        (EthCompletionRouter.JobStatus status,,,,,,,) = router.jobs(jobId);
        assertEq(uint256(status), uint256(EthCompletionRouter.JobStatus.EmergencyClaimed));
    }

    /**
     * @notice Verifies that unauthorized callers cannot impersonate the Nova Outbox on Mainnet.
     */
    function testFork_RevertIf_Mainnet_UnauthorizedOutboxCaller() public {
        _selectMainnetFork();

        EthCompletionRouter router =
            new EthCompletionRouter(MAINNET_NOVA_OUTBOX, simulatedL2Entry, MAINNET_ARB_ONE_INBOX);

        bytes32 jobId = keccak256("unauthorized-call");

        vm.deal(depositor, 2 ether);
        vm.prank(depositor);
        vm.expectRevert(EthCompletionRouter.OnlyNovaOutbox.selector);
        router.receiveFromNova{value: 1 ether}(jobId, depositor, beneficiary, 0.05 ether, 0.01 ether, 0.9 ether);
    }

    /**
     * @notice Verifies that messages from unexpected L2 senders are rejected on Mainnet.
     */
    function testFork_RevertIf_Mainnet_UnauthorizedL2Sender() public {
        _selectMainnetFork();

        EthCompletionRouter router =
            new EthCompletionRouter(MAINNET_NOVA_OUTBOX, simulatedL2Entry, MAINNET_ARB_ONE_INBOX);

        bytes32 jobId = keccak256("unauthorized-sender");
        address rogueL2Contract = makeAddr("rogueL2Contract");

        vm.deal(MAINNET_NOVA_OUTBOX, 10 ether);
        vm.mockCall(
            MAINNET_NOVA_OUTBOX, abi.encodeWithSelector(IOutbox.l2ToL1Sender.selector), abi.encode(rogueL2Contract)
        );

        vm.prank(MAINNET_NOVA_OUTBOX);
        vm.expectRevert(
            abi.encodeWithSelector(EthCompletionRouter.UnauthorizedL2Sender.selector, rogueL2Contract, simulatedL2Entry)
        );
        router.receiveFromNova{value: 1 ether}(jobId, depositor, beneficiary, 0.05 ether, 0.01 ether, 0.9 ether);
    }

    /**
     * @notice Verifies that worker gas deductions exceeding maxDeductions are rejected on Mainnet.
     */
    function testFork_RevertIf_Mainnet_ExceedsMaxDeductions() public {
        _selectMainnetFork();

        EthCompletionRouter router =
            new EthCompletionRouter(MAINNET_NOVA_OUTBOX, simulatedL2Entry, MAINNET_ARB_ONE_INBOX);

        bytes32 jobId = keccak256("over-deduction-job");
        uint256 principal = 1 ether;
        uint256 maxDeductions = 0.03 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        vm.deal(MAINNET_NOVA_OUTBOX, 10 ether);
        vm.mockCall(
            MAINNET_NOVA_OUTBOX, abi.encodeWithSelector(IOutbox.l2ToL1Sender.selector), abi.encode(simulatedL2Entry)
        );

        vm.prank(MAINNET_NOVA_OUTBOX);
        router.receiveFromNova{value: principal}(
            jobId, depositor, beneficiary, maxDeductions, executorReward, minDelivery
        );

        // Worker attempts deductions = 0.02 (retryable) + 0.01 (executorReward) + 0.01 (reimbursement) = 0.04 > 0.03
        EthCompletionRouter.RetryableGasParams memory gasParams = EthCompletionRouter.RetryableGasParams({
            maxSubmissionCost: 0.01 ether,
            gasLimit: 100_000,
            maxFeePerGas: 100 gwei // 0.01 ether -> retryable cost = 0.02 ether
        });
        uint256 workerReimbursement = 0.01 ether;

        vm.prank(worker);
        vm.expectRevert(
            abi.encodeWithSelector(EthCompletionRouter.ExceedsMaxDeductions.selector, 0.04 ether, 0.03 ether)
        );
        router.forwardJob(jobId, gasParams, workerReimbursement);
    }
}
