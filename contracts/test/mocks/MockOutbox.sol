// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IOutbox} from "../../src/interfaces/IOutbox.sol";

contract MockOutbox is IOutbox {
    address public currentL2Sender;

    function setL2ToL1Sender(address sender) external {
        currentL2Sender = sender;
    }

    function l2ToL1Sender() external view override returns (address) {
        return currentL2Sender;
    }

    function l2ToL1Block() external pure override returns (uint256) {
        return 100;
    }

    function l2ToL1EthBlock() external pure override returns (uint256) {
        return 200;
    }

    function l2ToL1Timestamp() external pure override returns (uint256) {
        return 1700000000;
    }

    function l2ToL1OutputId() external pure override returns (bytes32) {
        return bytes32(uint256(1));
    }
}
