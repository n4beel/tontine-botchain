// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/Tontine.sol";

contract Deploy is Script {
  function run() external returns (Tontine tontine) {
    vm.startBroadcast();
    tontine = new Tontine();
    vm.stopBroadcast();
  }
}
