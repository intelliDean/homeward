// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @notice Canonical Arbitrum Outbox interface on Ethereum L1
interface IOutbox {
    function l2ToL1Sender() external view returns (address);
    function l2ToL1Block() external view returns (uint256);
    function l2ToL1EthBlock() external view returns (uint256);
    function l2ToL1Timestamp() external view returns (uint256);
    function l2ToL1OutputId() external view returns (bytes32);
}
