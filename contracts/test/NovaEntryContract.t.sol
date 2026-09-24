// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NovaEntryContract} from "../src/NovaEntryContract.sol";
import {MockArbSys} from "./mocks/MockArbSys.sol";

contract NovaEntryContractTest is Test {
    NovaEntryContract public entryContract;
    MockArbSys public mockArbSys;

    address public router = address(0x1111);
    address public user = address(0xAAAA);
    address public beneficiary = address(0xBBBB);

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

    function setUp() public {
        mockArbSys = new MockArbSys();
        entryContract = new NovaEntryContract(router, address(mockArbSys));
        vm.deal(user, 100 ether);
    }

    function test_CreateMigration_Success() public {
        uint256 deposit = 1 ether;
        uint256 maxDeductions = 0.05 ether;
        uint256 executorReward = 0.01 ether;
        uint256 minDelivery = 0.9 ether;

        vm.prank(user);
        (bytes32 jobId, uint256 position) = entryContract.createMigration{value: deposit}(
            beneficiary,
            maxDeductions,
            executorReward,
            minDelivery
        );

        assertEq(position, 1);
        assertTrue(jobId != bytes32(0));

        (
            bytes32 storedJobId,
            address storedDepositor,
            address storedBeneficiary,
            uint256 storedAmount,
            uint256 storedMaxDeductions,
            uint256 storedReward,
            uint256 storedMinDelivery,
            uint256 storedPosition,
            uint256 createdAt
        ) = entryContract.jobs(jobId);

        assertEq(storedJobId, jobId);
        assertEq(storedDepositor, user);
        assertEq(storedBeneficiary, beneficiary);
        assertEq(storedAmount, deposit);
        assertEq(storedMaxDeductions, maxDeductions);
        assertEq(storedReward, executorReward);
        assertEq(storedMinDelivery, minDelivery);
        assertEq(storedPosition, 1);
        assertEq(createdAt, block.timestamp);

        // Verify mock ArbSys received the call
        assertEq(mockArbSys.lastDestination(), router);
        assertEq(mockArbSys.lastValue(), deposit);
    }

    function test_RevertIf_ZeroBeneficiary() public {
        vm.prank(user);
        vm.expectRevert(NovaEntryContract.InvalidBeneficiary.selector);
        entryContract.createMigration{value: 1 ether}(
            address(0),
            0.05 ether,
            0.01 ether,
            0.9 ether
        );
    }

    function test_RevertIf_ZeroMinDelivery() public {
        vm.prank(user);
        vm.expectRevert(NovaEntryContract.ZeroDeliveryThreshold.selector);
        entryContract.createMigration{value: 1 ether}(
            beneficiary,
            0.05 ether,
            0.01 ether,
            0
        );
    }

    function test_RevertIf_RewardExceedsMaxDeductions() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                NovaEntryContract.InvalidDeductionCaps.selector,
                0.01 ether,
                0.02 ether
            )
        );
        entryContract.createMigration{value: 1 ether}(
            beneficiary,
            0.01 ether, // maxDeductions
            0.02 ether, // executorReward > maxDeductions
            0.9 ether
        );
    }

    function test_RevertIf_InsufficientDeposit() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                NovaEntryContract.InsufficientDeposit.selector,
                0.5 ether,
                1 ether
            )
        );
        entryContract.createMigration{value: 0.5 ether}(
            beneficiary,
            0.1 ether,
            0.02 ether,
            0.9 ether // required = 0.1 + 0.9 = 1.0 ether > 0.5 ether
        );
    }

    function testFuzz_CreateMigration(
        uint256 deposit,
        uint256 maxDeductions,
        uint256 executorReward,
        uint256 minDelivery
    ) public {
        maxDeductions = bound(maxDeductions, 1e14, 0.5 ether);
        executorReward = bound(executorReward, 1e13, maxDeductions);
        minDelivery = bound(minDelivery, 1e14, 10 ether);
        deposit = bound(deposit, maxDeductions + minDelivery, 50 ether);

        vm.deal(user, deposit);
        vm.prank(user);
        (bytes32 jobId, uint256 position) = entryContract.createMigration{value: deposit}(
            beneficiary,
            maxDeductions,
            executorReward,
            minDelivery
        );

        assertTrue(position > 0);
        assertTrue(jobId != bytes32(0));
    }
}
