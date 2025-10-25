// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ClickGame.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address sponsor = vm.envAddress("SPONSOR_ADDRESS");

        vm.startBroadcast(pk);
        ClickGame game = new ClickGame(sponsor);
        vm.stopBroadcast();

        console2.log("ClickGame deployed at:", address(game));
    }
}
