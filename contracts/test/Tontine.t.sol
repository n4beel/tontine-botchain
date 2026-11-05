// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Tontine.sol";

contract MaliciousRecipient {
  Tontine public immutable target;
  bool public attackWithdraw;

  constructor(Tontine _target) {
    target = _target;
  }

  function setAttackWithdraw(bool _attack) external {
    attackWithdraw = _attack;
  }

  function triggerWithdraw() external {
    target.withdraw();
  }

  receive() external payable {
    if (attackWithdraw) {
      target.withdraw();
    }
  }
}

contract TontineTest is Test {
  Tontine public tontine;

  address public creator = address(0x101);
  address public playerA = address(0x102);
  address public playerB = address(0x103);
  address public playerC = address(0x104);
  address public outsider = address(0x999);

  uint128 public constant STAKE = 1 ether;
  uint32 public constant PERIOD_SECS = 1 hours;
  uint8 public constant PERIODS = 4;
  uint64 public constant LEAD = 2 hours;
  string public constant GAME_NAME = "Highlander Syndicate";

  function setUp() public {
    tontine = new Tontine();

    vm.deal(creator, 100 ether);
    vm.deal(playerA, 100 ether);
    vm.deal(playerB, 100 ether);
    vm.deal(playerC, 100 ether);
    vm.deal(outsider, 100 ether);
  }

  function test_OpenJoinAndStart() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    uint256 id = tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    assertEq(id, 1);
    assertEq(tontine.gameCount(), 1);

    Tontine.Game memory g = tontine.gameOf(1);
    assertEq(g.creator, creator);
    assertEq(g.players, 1);
    assertEq(g.alive, 1);
    assertEq(uint256(g.state), uint256(Tontine.State.Open));

    // Player A joins
    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    g = tontine.gameOf(1);
    assertEq(g.players, 2);
    assertEq(g.alive, 2);

    address[] memory players = tontine.playersOf(1);
    assertEq(players.length, 2);
    assertEq(players[0], creator);
    assertEq(players[1], playerA);
  }

  function test_JoinAfterStartReverts() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.warp(startsAt);
    vm.prank(playerA);
    vm.expectRevert(Tontine.TooLate.selector);
    tontine.join{value: STAKE}(1);
  }

  function test_FullGameRejectsJoin() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    // 29 more players join
    for (uint160 i = 1; i < 30; i++) {
      address p = address(uint160(0x2000 + i));
      vm.deal(p, 10 ether);
      vm.prank(p);
      tontine.join{value: STAKE}(1);
    }

    Tontine.Game memory g = tontine.gameOf(1);
    assertEq(g.players, 30);

    // 31st player should revert
    address excess = address(0x9999);
    vm.deal(excess, 10 ether);
    vm.prank(excess);
    vm.expectRevert(Tontine.Full.selector);
    tontine.join{value: STAKE}(1);
  }

  function test_CheckInSetsCurrentPeriodBit() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.warp(startsAt + 10);
    // Period 0
    vm.prank(creator);
    tontine.checkIn(1);

    Tontine.Seat memory s = tontine.seatOf(1, creator);
    assertEq(s.done, 1); // bit 0 set

    // Move to Period 1
    vm.warp(startsAt + PERIOD_SECS + 5);
    vm.prank(creator);
    tontine.checkIn(1);

    s = tontine.seatOf(1, creator);
    assertEq(s.done, 3); // bits 0 and 1 set (1 | 2 = 3)
  }

  function test_CheckInTwiceInOnePeriodReverts_ArgsPeriod() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.warp(startsAt + 10);
    vm.prank(creator);
    tontine.checkIn(1);

    // Check in again in period 0
    vm.prank(creator);
    vm.expectRevert(abi.encodeWithSelector(Tontine.AlreadyCheckedIn.selector, uint8(0)));
    tontine.checkIn(1);
  }

  function test_CheckInOutsideWindowReverts() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    // Before startsAt
    vm.prank(creator);
    vm.expectRevert(Tontine.NotRunning.selector);
    tontine.checkIn(1);

    // After endsAt
    uint64 endsAt = startsAt + uint64(PERIODS) * uint64(PERIOD_SECS);
    vm.warp(endsAt + 1);
    vm.prank(creator);
    vm.expectRevert(Tontine.NotRunning.selector);
    tontine.checkIn(1);
  }

  function test_KnockOutAfterAMissedPeriod() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.prank(playerB);
    tontine.join{value: STAKE}(1);

    // In period 0: creator checks in, playerA and playerB miss it
    vm.warp(startsAt + 10);
    vm.prank(creator);
    tontine.checkIn(1);

    // Warp into period 1 (period 0 has ended)
    vm.warp(startsAt + PERIOD_SECS + 5);

    // Player A can be knocked out by anyone
    assertEq(tontine.knockable(1, playerA), true);
    assertEq(tontine.knockable(1, creator), false);

    vm.prank(outsider);
    tontine.knockOut(1, playerA);

    Tontine.Seat memory sA = tontine.seatOf(1, playerA);
    assertEq(sA.out, true);

    Tontine.Game memory g = tontine.gameOf(1);
    assertEq(g.alive, 2); // creator and playerB remain alive
  }

  function test_KnockOutBeforeAnyPeriodCompletesReverts() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    // In period 0: period 0 has NOT completed yet
    vm.warp(startsAt + 10);
    assertEq(tontine.knockable(1, playerA), false);

    vm.prank(creator);
    vm.expectRevert(Tontine.NotMissed.selector);
    tontine.knockOut(1, playerA);
  }

  function test_CannotKnockOutSomeoneUpToDate() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.warp(startsAt + 10);
    vm.prank(creator);
    tontine.checkIn(1);
    vm.prank(playerA);
    tontine.checkIn(1);

    // Move to period 1
    vm.warp(startsAt + PERIOD_SECS + 10);

    vm.prank(outsider);
    vm.expectRevert(Tontine.NotMissed.selector);
    tontine.knockOut(1, creator);
  }

  function test_CannotKnockOutTheLast() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    // Both miss period 0
    vm.warp(startsAt + PERIOD_SECS + 10);

    // Knock out playerA
    vm.prank(outsider);
    tontine.knockOut(1, playerA);

    // Now creator is alive = 1. Cannot knock out the last one standing!
    assertEq(tontine.knockable(1, creator), false);
    vm.prank(outsider);
    vm.expectRevert(Tontine.LastOneStanding.selector);
    tontine.knockOut(1, creator);
  }

  function test_KnockedOutCannotCheckIn() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.warp(startsAt + PERIOD_SECS + 10);
    vm.prank(creator);
    tontine.knockOut(1, playerA);

    vm.prank(playerA);
    vm.expectRevert(Tontine.NotInGame.selector);
    tontine.checkIn(1);
  }

  function test_FinishWhenOneLeft() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    // Creator checks in period 0, playerA misses
    vm.warp(startsAt + 10);
    vm.prank(creator);
    tontine.checkIn(1);

    vm.warp(startsAt + PERIOD_SECS + 10);
    vm.prank(outsider);
    tontine.knockOut(1, playerA);

    // Alive is now 1. Finish can be called immediately before endsAt!
    vm.prank(outsider);
    tontine.finish(1);

    Tontine.Game memory g = tontine.gameOf(1);
    assertEq(uint256(g.state), uint256(Tontine.State.Finished));
    assertEq(tontine.pending(creator), 2 * STAKE);
    assertEq(tontine.pending(playerA), 0);
  }

  function test_FinishAtEndSharesAmongFullRecords() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, 3);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.prank(playerB);
    tontine.join{value: STAKE}(1);

    // Period 0: all check in
    vm.warp(startsAt + 10);
    vm.prank(creator);
    tontine.checkIn(1);
    vm.prank(playerA);
    tontine.checkIn(1);
    vm.prank(playerB);
    tontine.checkIn(1);

    // Period 1: creator & playerA check in, playerB misses
    vm.warp(startsAt + PERIOD_SECS + 10);
    vm.prank(creator);
    tontine.checkIn(1);
    vm.prank(playerA);
    tontine.checkIn(1);

    // Period 2: creator & playerA check in
    vm.warp(startsAt + 2 * PERIOD_SECS + 10);
    vm.prank(creator);
    tontine.checkIn(1);
    vm.prank(playerA);
    tontine.checkIn(1);

    // Warp past endsAt without anyone knocking out playerB
    vm.warp(startsAt + 3 * PERIOD_SECS + 10);

    // Finish: creator and playerA have fullMask (all 3 periods), playerB does not
    vm.prank(outsider);
    tontine.finish(1);

    assertEq(tontine.pending(creator), (3 * STAKE) / 2);
    assertEq(tontine.pending(playerA), (3 * STAKE) / 2);
    assertEq(tontine.pending(playerB), 0);
  }

  function test_FinishAtEndWhenNobodyCompleted_SharesAmongNotOut() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, 3);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    // Both miss every period and nobody knocked out either
    vm.warp(startsAt + 3 * PERIOD_SECS + 10);

    vm.prank(outsider);
    tontine.finish(1);

    // Both get equal split of pot
    assertEq(tontine.pending(creator), STAKE);
    assertEq(tontine.pending(playerA), STAKE);
  }

  function test_FinishRemainderToFirstSurvivor() public {
    // 3 players with stake 1 ether each = pot 3 ether
    // If 2 survivors, 3 ether / 2 = 1.5 ether each (no remainder)
    // Let's use stake 1 ether, 3 players, 1 knocked out, 2 survivors
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    // Use stake 1 wei + 1 to test remainder division
    uint128 unevenStake = 1 ether + 1;
    tontine.open{value: unevenStake}(GAME_NAME, unevenStake, startsAt, PERIOD_SECS, 3);

    vm.prank(playerA);
    tontine.join{value: unevenStake}(1);

    // Period 0, 1, 2 all check in
    for (uint8 p = 0; p < 3; p++) {
      vm.warp(startsAt + p * PERIOD_SECS + 10);
      vm.prank(creator);
      tontine.checkIn(1);
      vm.prank(playerA);
      tontine.checkIn(1);
    }

    vm.warp(startsAt + 3 * PERIOD_SECS + 10);
    vm.prank(outsider);
    tontine.finish(1);

    uint256 pot = uint256(unevenStake) * 2;
    uint256 share = pot / 2;
    uint256 rem = pot % 2;

    assertEq(tontine.pending(creator), share + rem);
    assertEq(tontine.pending(playerA), share);
  }

  function test_CancelWhenTooFewPlayers() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    // Only creator joined (players = 1)
    // Try cancel before startsAt: reverts CanStart
    vm.prank(outsider);
    vm.expectRevert(Tontine.CanStart.selector);
    tontine.cancel(1);

    // After startsAt: cancel succeeds
    vm.warp(startsAt + 1);
    vm.prank(outsider);
    tontine.cancel(1);

    Tontine.Game memory g = tontine.gameOf(1);
    assertEq(uint256(g.state), uint256(Tontine.State.Cancelled));
    assertEq(tontine.pending(creator), STAKE);
  }

  function test_CancelBlockedWhenEnoughPlayers() public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.warp(startsAt + 1);
    vm.prank(outsider);
    vm.expectRevert(Tontine.CanStart.selector);
    tontine.cancel(1);
  }

  function test_ReentrantWithdrawBlocked() public {
    MaliciousRecipient attacker = new MaliciousRecipient(tontine);
    vm.deal(address(attacker), 10 ether);

    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(address(attacker));
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    vm.warp(startsAt + 1);
    tontine.cancel(1);

    assertEq(tontine.pending(address(attacker)), STAKE);

    attacker.setAttackWithdraw(true);
    vm.expectRevert(Tontine.TransferFailed.selector);
    attacker.triggerWithdraw();
  }

  function testFuzz_AliveCountMatchesSeats(uint8 numPlayers, uint8 knockCount) public {
    vm.assume(numPlayers >= 2 && numPlayers <= 10);
    vm.assume(knockCount < numPlayers);

    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, PERIODS);

    for (uint160 i = 1; i < numPlayers; i++) {
      address p = address(uint160(0x3000 + i));
      vm.deal(p, 10 ether);
      vm.prank(p);
      tontine.join{value: STAKE}(1);
    }

    // Warp into period 1
    vm.warp(startsAt + PERIOD_SECS + 10);

    for (uint160 i = 1; i <= knockCount; i++) {
      address p = address(uint160(0x3000 + i));
      if (tontine.knockable(1, p)) {
        tontine.knockOut(1, p);
      }
    }

    Tontine.Game memory g = tontine.gameOf(1);
    address[] memory plist = tontine.playersOf(1);

    uint8 countAlive = 0;
    for (uint256 i = 0; i < plist.length; i++) {
      Tontine.Seat memory s = tontine.seatOf(1, plist[i]);
      if (!s.out) countAlive++;
    }

    assertEq(g.alive, countAlive);
  }

  function testFuzz_PotAlwaysFullyPaid(bool doCheckIns, bool doKnockOuts) public {
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: STAKE}(GAME_NAME, STAKE, startsAt, PERIOD_SECS, 3);

    vm.prank(playerA);
    tontine.join{value: STAKE}(1);

    vm.prank(playerB);
    tontine.join{value: STAKE}(1);

    if (doCheckIns) {
      vm.warp(startsAt + 10);
      vm.prank(creator);
      tontine.checkIn(1);
    }

    if (doKnockOuts) {
      vm.warp(startsAt + PERIOD_SECS + 10);
      if (tontine.knockable(1, playerB)) {
        tontine.knockOut(1, playerB);
      }
    }

    vm.warp(startsAt + 3 * PERIOD_SECS + 10);
    tontine.finish(1);

    uint256 totalPaid = tontine.pending(creator) + tontine.pending(playerA) + tontine.pending(playerB);
    assertEq(totalPaid, 3 * STAKE);
    assertEq(address(tontine).balance, totalPaid);
  }

  function test_SpecificMutantKillers() public {
    // Parameter limits
    assertEq(tontine.MAX_PLAYERS(), 30);
    assertEq(tontine.MAX_NAME_BYTES(), 48);
    assertEq(tontine.MIN_STAKE(), 0.01 ether);
    assertEq(tontine.MAX_STAKE(), 10_000 ether);
    assertEq(tontine.MIN_PERIOD(), 1 hours);
    assertEq(tontine.MAX_PERIOD(), 7 days);
    assertEq(tontine.MIN_PERIODS(), 3);
    assertEq(tontine.MAX_PERIODS(), 60);
    assertEq(tontine.MIN_LEAD(), 1 hours);
    assertEq(tontine.MAX_LEAD(), 30 days);
    assertEq(tontine.MAX_PAGE(), 50);

    // Exact min stake (0.01 ether) accepted
    uint64 startsAt = uint64(block.timestamp) + LEAD;
    vm.prank(creator);
    tontine.open{value: 0.01 ether}(GAME_NAME, 0.01 ether, startsAt, PERIOD_SECS, PERIODS);

    // Below min stake reverts
    vm.prank(creator);
    vm.expectRevert(Tontine.BadParams.selector);
    tontine.open{value: 0.01 ether - 1}(GAME_NAME, 0.01 ether - 1, startsAt, PERIOD_SECS, PERIODS);

    // knockable on invalid ID returns false
    assertEq(tontine.knockable(0, creator), false);
    assertEq(tontine.knockable(999, creator), false);

    // Latest pagination bounds with 2 games
    (uint256[] memory ids, ) = tontine.latest(0, 10);
    assertEq(ids.length, 1);

    (uint256[] memory emptyIds, ) = tontine.latest(1, 10);
    assertEq(emptyIds.length, 0);

    // Standing view at startsAt and endsAt
    uint64 endsAt = startsAt + uint64(PERIODS) * uint64(PERIOD_SECS);
    (uint8 curPAtStart, uint64 cMaskAtStart, ) = tontine.standing(1, startsAt);
    assertEq(curPAtStart, 0);
    assertEq(cMaskAtStart, 0);

    (uint8 curPAtEnd, uint64 cMaskAtEnd, ) = tontine.standing(1, endsAt);
    assertEq(curPAtEnd, PERIODS);
    assertEq(cMaskAtEnd, (uint64(1) << PERIODS) - 1);
  }
}
