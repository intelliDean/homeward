// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @notice Arbitrum ArbSys precompile at address(0x64)
interface IArbSys {
    function sendTxToL1(address destination, bytes calldata data) external payable returns (uint256);
}
