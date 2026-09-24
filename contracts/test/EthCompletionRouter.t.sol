// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {EthCompletionRouter} from "../src/EthCompletionRouter.sol";
import {MockOutbox} from "./mocks/MockOutbox.sol";
import {MockInbox} from "./mocks/MockInbox.sol";

contract EthCompletionRouterTest is Test {
    EthCompletionRouter public router;
    MockOutbox public mockOutbox;
    MockInbox public mockInbox;

    address public novaEntry = address(0xAAAA);
    address public depositor = address(0xBBBB);
    address public beneficiary = address(0xCCCC);
    address public worker = address(0xDDDD);
    address public randomUser = address(0xEEEE);

    bytes32 public sampleJobId = keccak256("sample-job-id");

    function setUp() public {
        mockOutbox = new MockOutbox();
        mockInbox = new MockInbox();
        router = new EthCompletionRouter(address(mockOutbox), novaEntry, address(mockInbox));

        mockOutbox.setL2ToL1Sender(novaEntry);
        vm.deal(address(mockOutbox), 100 ether);
        vm.deal(worker, 10 ether);
        vm.deal(randomUser, 10 ether);
    }

    function _receiveSampleJob(uint256 principal, uint256 maxDeductions, uint256 executorReward, uint256 minDelivery)
        internal
    {
        vm.prank(address(mockOutbox));
        router.receiveFromNova{value: principal}(
            sampleJobId, depositor, beneficiary, maxDeductions, executorReward, minDelivery
        );
    }

    function test_ReceiveFromNova_Success() public {
        uint256 principal = 1 ether;
        uint256 maxDeductions = 0.05 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        _receiveSampleJob(principal, maxDeductions, executorReward, minDelivery);

        (
            EthCompletionRouter.JobStatus status,
            address storedDepositor,
            address storedBeneficiary,
            uint256 storedPrincipal,
            uint256 storedMaxDeductions,
            uint256 storedReward,
            uint256 storedMinDelivery,
            uint256 receivedTimestamp
        ) = router.jobs(sampleJobId);

        assertEq(uint8(status), uint8(EthCompletionRouter.JobStatus.Received));
        assertEq(storedDepositor, depositor);
        assertEq(storedBeneficiary, beneficiary);
        assertEq(storedPrincipal, principal);
        assertEq(storedMaxDeductions, maxDeductions);
        assertEq(storedReward, executorReward);
        assertEq(storedMinDelivery, minDelivery);
        assertEq(receivedTimestamp, block.timestamp);
        assertEq(router.jobBalances(sampleJobId), principal);
    }

    function test_RevertIf_ReceiveFromNova_NotOutbox() public {
        vm.prank(randomUser);
        vm.expectRevert(EthCompletionRouter.OnlyNovaOutbox.selector);
        router.receiveFromNova{value: 1 ether}(sampleJobId, depositor, beneficiary, 0.05 ether, 0.01 ether, 0.9 ether);
    }

    function test_RevertIf_ReceiveFromNova_UnauthorizedL2Sender() public {
        mockOutbox.setL2ToL1Sender(randomUser); // not novaEntry

        vm.prank(address(mockOutbox));
        vm.expectRevert(
            abi.encodeWithSelector(EthCompletionRouter.UnauthorizedL2Sender.selector, randomUser, novaEntry)
        );
        router.receiveFromNova{value: 1 ether}(sampleJobId, depositor, beneficiary, 0.05 ether, 0.01 ether, 0.9 ether);
    }

    function test_ForwardJob_Success() public {
        uint256 principal = 1 ether;
        uint256 maxDeductions = 0.05 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        _receiveSampleJob(principal, maxDeductions, executorReward, minDelivery);

        // Gas parameters
        EthCompletionRouter.RetryableGasParams memory gasParams = EthCompletionRouter.RetryableGasParams({
            maxSubmissionCost: 0.005 ether,
            gasLimit: 100_000,
            maxFeePerGas: 100 gwei // 0.01 ether
        });
        uint256 workerReimbursement = 0.015 ether;

        // retryableCost = 0.005 + 0.01 = 0.015 ether
        // totalWorkerReward = 0.015 + 0.01 = 0.025 ether
        // totalDeductions = 0.015 + 0.025 = 0.040 ether (<= 0.05 ether maxDeductions)
        // netDelivery = 1.0 - 0.040 = 0.96 ether (>= 0.9 minDelivery)

        uint256 workerBalBefore = worker.balance;

        vm.prank(worker);
        uint256 ticketId = router.forwardJob(sampleJobId, gasParams, workerReimbursement);

        assertTrue(ticketId >= 1000);

        // Worker received totalWorkerReward
        assertEq(worker.balance - workerBalBefore, 0.025 ether);

        // Verify ticket forwarded to MockInbox
        (
            address to,
            uint256 l2CallValue,
            uint256 maxSubmissionCost,
            address excessRefund,
            address callValueRefund,
            uint256 gasLimit,
            uint256 maxFeePerGas,,
            uint256 msgValue
        ) = mockInbox.lastTicket();

        assertEq(to, beneficiary);
        assertEq(l2CallValue, 0.96 ether);
        assertEq(maxSubmissionCost, 0.005 ether);
        assertEq(excessRefund, beneficiary); // CRITICAL: NEVER WORKER
        assertEq(callValueRefund, beneficiary); // CRITICAL: NEVER WORKER
        assertEq(gasLimit, 100_000);
        assertEq(maxFeePerGas, 100 gwei);
        assertEq(msgValue, 0.96 ether + 0.015 ether); // delivery + retryable fee

        // Verify job state completed and balance cleared
        (EthCompletionRouter.JobStatus status,,,,,,,) = router.jobs(sampleJobId);
        assertEq(uint8(status), uint8(EthCompletionRouter.JobStatus.Completed));
        assertEq(router.jobBalances(sampleJobId), 0);
    }

    function test_RevertIf_ForwardJob_ExceedsMaxDeductions() public {
        uint256 principal = 1 ether;
        uint256 maxDeductions = 0.03 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        _receiveSampleJob(principal, maxDeductions, executorReward, minDelivery);

        EthCompletionRouter.RetryableGasParams memory gasParams = EthCompletionRouter.RetryableGasParams({
            maxSubmissionCost: 0.02 ether,
            gasLimit: 100_000,
            maxFeePerGas: 100 gwei // 0.01 ether -> retryable cost = 0.03 ether
        });
        uint256 workerReimbursement = 0.01 ether;
        // Total deductions = 0.03 + 0.01 + 0.01 = 0.05 ether > 0.03 ether maxDeductions

        vm.prank(worker);
        vm.expectRevert(
            abi.encodeWithSelector(EthCompletionRouter.ExceedsMaxDeductions.selector, 0.05 ether, 0.03 ether)
        );
        router.forwardJob(sampleJobId, gasParams, workerReimbursement);
    }

    function test_EmergencyWithdraw_SuccessAfterDelay() public {
        uint256 principal = 1 ether;
        _receiveSampleJob(principal, 0.05 ether, 0.01 ether, 0.9 ether);

        // Before 14 days: revert
        vm.warp(block.timestamp + 13 days);
        vm.prank(beneficiary);
        vm.expectRevert();
        router.emergencyWithdraw(sampleJobId);

        // After 14 days: succeeds
        vm.warp(block.timestamp + 2 days); // 15 days total
        uint256 benBalBefore = beneficiary.balance;

        vm.prank(beneficiary);
        router.emergencyWithdraw(sampleJobId);

        assertEq(beneficiary.balance - benBalBefore, principal);
        assertEq(router.jobBalances(sampleJobId), 0);
    }

    function test_RevertIf_EmergencyWithdraw_RandomCaller() public {
        uint256 principal = 1 ether;
        _receiveSampleJob(principal, 0.05 ether, 0.01 ether, 0.9 ether);

        vm.warp(block.timestamp + 15 days);
        vm.prank(randomUser);
        vm.expectRevert(EthCompletionRouter.OnlyBeneficiaryOrDepositor.selector);
        router.emergencyWithdraw(sampleJobId);
    }
}
