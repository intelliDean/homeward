// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IArbSys} from "../../src/interfaces/IArbSys.sol";

contract MockArbSys is IArbSys {
    uint256 public nextMessagePosition = 1;
    address public lastDestination;
    bytes public lastData;
    uint256 public lastValue;

    function sendTxToL1(address destination, bytes calldata data) external payable override returns (uint256) {
        lastDestination = destination;
        lastData = data;
        lastValue = msg.value;
        uint256 position = nextMessagePosition++;
        return position;
    }

    receive() external payable {}
}
