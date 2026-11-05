// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Tontine.sol";

contract TontineHandler is Test {
  Tontine public tontine;

  address[] public actors;
  uint256 public activeGameId;
  uint64 public gameStartsAt;
  uint32 public periodSecs;
  uint8 public periods;
  uint128 public stake;

  constructor(Tontine _tontine) {
    tontine = _tontine;

    actors.push(address(0xA1));
    actors.push(address(0xA2));
    actors.push(address(0xA3));
    actors.push(address(0xA4));

    for (uint256 i = 0; i < actors.length; i++) {
      vm.deal(actors[i], 1000 ether);
    }
  }

  function openGame(uint8 pCount, uint32 pSecs) public {
    if (activeGameId != 0) return;

    periodSecs = uint32(bound(pSecs, 1 hours, 1 days));
    periods = uint8(bound(pCount, 3, 10));
    stake = 1 ether;
    gameStartsAt = uint64(block.timestamp) + 2 hours;

    vm.prank(actors[0]);
    activeGameId = tontine.open{value: stake}("Fuzz Tontine", stake, gameStartsAt, periodSecs, periods);
  }

  function joinGame(uint8 actorIndex) public {
    if (activeGameId == 0) return;
    if (block.timestamp >= gameStartsAt) return;

    address p = actors[actorIndex % actors.length];
    Tontine.Seat memory s = tontine.seatOf(activeGameId, p);
    if (s.inGame) return;

    vm.prank(p);
    try tontine.join{value: stake}(activeGameId) {} catch {}
  }

  function checkInGame(uint8 actorIndex) public {
    if (activeGameId == 0) return;
    if (block.timestamp < gameStartsAt) return;

    uint64 endsAt = gameStartsAt + uint64(periods) * uint64(periodSecs);
    if (block.timestamp >= endsAt) return;

    address p = actors[actorIndex % actors.length];
    vm.prank(p);
    try tontine.checkIn(activeGameId) {} catch {}
  }

  function knockOutPlayer(uint8 actorIndex) public {
    if (activeGameId == 0) return;
    if (block.timestamp < gameStartsAt) return;

    address target = actors[actorIndex % actors.length];
    if (tontine.knockable(activeGameId, target)) {
      vm.prank(actors[0]);
      try tontine.knockOut(activeGameId, target) {} catch {}
    }
  }

  function advanceTime(uint32 secs) public {
    vm.warp(block.timestamp + bound(secs, 10 minutes, 2 days));
  }

  function finishGame() public {
    if (activeGameId == 0) return;
    vm.prank(actors[0]);
    try tontine.finish(activeGameId) {} catch {}
  }

  function withdrawPending(uint8 actorIndex) public {
    address p = actors[actorIndex % actors.length];
    vm.prank(p);
    try tontine.withdraw() {} catch {}
  }
}

contract TontineInvariantTest is Test {
  Tontine public tontine;
  TontineHandler public handler;

  function setUp() public {
    tontine = new Tontine();
    handler = new TontineHandler(tontine);
    targetContract(address(handler));
  }

  function invariant_BalanceEqualsPotsPlusPending() public view {
    uint256 totalPending = 0;
    for (uint256 i = 0; i < 4; i++) {
      totalPending += tontine.pending(handler.actors(i));
    }

    uint256 expectedActivePot = 0;
    uint256 gid = handler.activeGameId();
    if (gid != 0) {
      Tontine.Game memory g = tontine.gameOf(gid);
      if (g.state == Tontine.State.Open || g.state == Tontine.State.Running) {
        expectedActivePot = uint256(g.stake) * uint256(g.players);
      }
    }

    assertGe(address(tontine).balance, expectedActivePot + totalPending);
  }
}
