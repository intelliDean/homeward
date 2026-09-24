// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IInbox} from "../../src/interfaces/IInbox.sol";

contract MockInbox is IInbox {
    uint256 public nextTicketId = 1000;

    struct LastTicket {
        address to;
        uint256 l2CallValue;
        uint256 maxSubmissionCost;
        address excessFeeRefundAddress;
        address callValueRefundAddress;
        uint256 gasLimit;
        uint256 maxFeePerGas;
        bytes data;
        uint256 msgValue;
    }

    LastTicket public lastTicket;

    function createRetryableTicket(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable override returns (uint256) {
        lastTicket = LastTicket({
            to: to,
            l2CallValue: l2CallValue,
            maxSubmissionCost: maxSubmissionCost,
            excessFeeRefundAddress: excessFeeRefundAddress,
            callValueRefundAddress: callValueRefundAddress,
            gasLimit: gasLimit,
            maxFeePerGas: maxFeePerGas,
            data: data,
            msgValue: msg.value
        });

        return nextTicketId++;
    }

    receive() external payable {}
}
