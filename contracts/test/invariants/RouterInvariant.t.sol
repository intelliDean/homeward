// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {EthCompletionRouter} from "../../src/EthCompletionRouter.sol";
import {MockOutbox} from "../mocks/MockOutbox.sol";
import {MockInbox} from "../mocks/MockInbox.sol";

contract RouterHandler is Test {
    EthCompletionRouter public router;
    MockOutbox public outbox;
    MockInbox public inbox;
    address public novaEntry;

    bytes32[] public jobIds;
    uint256 public totalTrackedPrincipal;

    constructor(EthCompletionRouter _router, MockOutbox _outbox, MockInbox _inbox, address _novaEntry) {
        router = _router;
        outbox = _outbox;
        inbox = _inbox;
        novaEntry = _novaEntry;
        vm.deal(address(outbox), 10_000 ether);
    }

    function createJob(uint256 amount, uint256 maxDeductions, uint256 reward) public {
        amount = bound(amount, 0.1 ether, 10 ether);
        maxDeductions = bound(maxDeductions, 0.01 ether, 0.05 ether);
        reward = bound(reward, 0.001 ether, maxDeductions);
        uint256 minDelivery = amount - maxDeductions;

        bytes32 jobId = keccak256(abi.encode(jobIds.length, block.timestamp));
        jobIds.push(jobId);

        outbox.setL2ToL1Sender(novaEntry);
        vm.prank(address(outbox));
        router.receiveFromNova{value: amount}(
            jobId, address(0x1111), address(0x2222), maxDeductions, reward, minDelivery
        );

        totalTrackedPrincipal += amount;
    }

    function forward(uint256 jobIndex, uint256 gasPrice) public {
        if (jobIds.length == 0) return;
        jobIndex = jobIndex % jobIds.length;
        bytes32 jobId = jobIds[jobIndex];

        (EthCompletionRouter.JobStatus status,,, uint256 principal, uint256 maxDeductions,,,) = router.jobs(jobId);
        if (status != EthCompletionRouter.JobStatus.Received) return;

        gasPrice = bound(gasPrice, 1 gwei, 50 gwei);
        EthCompletionRouter.RetryableGasParams memory gasParams = EthCompletionRouter.RetryableGasParams({
            maxSubmissionCost: 0.001 ether, gasLimit: 50_000, maxFeePerGas: gasPrice
        });

        uint256 retryableCost = gasParams.maxSubmissionCost + (gasParams.gasLimit * gasParams.maxFeePerGas);
        if (retryableCost + 0.005 ether > maxDeductions) return;

        address worker = address(0x9999);
        vm.deal(worker, 1 ether);
        vm.prank(worker);
        try router.forwardJob(jobId, gasParams, 0.001 ether) {
            totalTrackedPrincipal -= principal;
        } catch {}
    }

    function getJobCount() external view returns (uint256) {
        return jobIds.length;
    }
}

contract RouterInvariantTest is Test {
    EthCompletionRouter public router;
    MockOutbox public outbox;
    MockInbox public inbox;
    RouterHandler public handler;
    address public novaEntry = address(0xAAAA);

    function setUp() public {
        outbox = new MockOutbox();
        inbox = new MockInbox();
        router = new EthCompletionRouter(address(outbox), novaEntry, address(inbox));

        handler = new RouterHandler(router, outbox, inbox, novaEntry);

        targetContract(address(handler));
    }

    function invariant_SolvencyAlwaysHolds() public view {
        // The contract's ETH balance must exactly equal the sum of unforwarded job balances
        assertEq(address(router).balance, handler.totalTrackedPrincipal());
    }
}
