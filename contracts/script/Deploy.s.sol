// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NovaEntryContract} from "../src/NovaEntryContract.sol";
import {EthCompletionRouter} from "../src/EthCompletionRouter.sol";

contract DeployEthCompletionRouter is Script {
    function run() external returns (address routerAddress) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address novaOutbox = vm.envAddress("NOVA_OUTBOX_ADDRESS");
        address novaEntry = vm.envAddress("NOVA_ENTRY_CONTRACT");
        address arbOneInbox = vm.envAddress("ARB_ONE_INBOX_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        EthCompletionRouter router = new EthCompletionRouter(novaOutbox, novaEntry, arbOneInbox);
        vm.stopBroadcast();

        console2.log("EthCompletionRouter deployed at:", address(router));
        return address(router);
    }
}

contract DeployNovaEntryContract is Script {
    function run() external returns (address entryAddress) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address ethCompletionRouter = vm.envAddress("ETH_COMPLETION_ROUTER");
        address arbSys = vm.envOr("ARB_SYS_ADDRESS", address(0x0000000000000000000000000000000000000064));

        vm.startBroadcast(deployerPrivateKey);
        NovaEntryContract entry = new NovaEntryContract(ethCompletionRouter, arbSys);
        vm.stopBroadcast();

        console2.log("NovaEntryContract deployed at:", address(entry));
        return address(entry);
    }
}
