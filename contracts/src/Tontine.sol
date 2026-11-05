// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Tontine
 * @notice A tontine among up to 30 participants.
 * Everyone pays the same stake before the start. In every elapsed period, a player
 * must check in. A player who has missed a finished period can be knocked out by anyone.
 * When one player is left, or when the last period ends, the pot is shared among survivors.
 */
contract Tontine {
  enum State {
    Open,
    Running,
    Finished,
    Cancelled
  }

  struct Game {
    address creator;
    uint64 startsAt;
    uint32 periodSecs;
    uint8 periods;
    uint8 players;
    uint8 alive;
    State state;
    uint128 stake;
    string name;
  }

  struct Seat {
    uint64 done; // bit p set = checked in during period p (periods <= 60)
    bool inGame;
    bool out;
  }

  // --- Constants (Spec §2.1) ---
  uint256 public constant MAX_PLAYERS = 30;
  uint256 public constant MAX_NAME_BYTES = 48;
  uint128 public constant MIN_STAKE = 0.01 ether;
  uint128 public constant MAX_STAKE = 10_000 ether;
  uint32 public constant MIN_PERIOD = 1 hours;
  uint32 public constant MAX_PERIOD = 7 days;
  uint8 public constant MIN_PERIODS = 3;
  uint8 public constant MAX_PERIODS = 60;
  uint64 public constant MIN_LEAD = 1 hours;
  uint64 public constant MAX_LEAD = 30 days;
  uint256 public constant MAX_PAGE = 50;

  // --- State Variables ---
  mapping(uint256 => Game) private _games;
  mapping(uint256 => address[]) private _players;
  mapping(uint256 => mapping(address => Seat)) private _seats;
  mapping(address => uint256) public pending;
  uint256 public gameCount;

  // Reentrancy guard
  uint256 private _reentrancyStatus = 1;

  modifier nonReentrant() {
    require(_reentrancyStatus == 1, "REENTRANCY");
    _reentrancyStatus = 2;
    _;
    _reentrancyStatus = 1;
  }

  // --- Custom Errors ---
  error BadParams();
  error WrongPayment(uint256 expected);
  error NoSuchGame();
  error TooLate();
  error AlreadyIn();
  error Full();
  error NotRunning();
  error NotInGame();
  error AlreadyCheckedIn(uint8 period);
  error LastOneStanding();
  error NotMissed();
  error StillRunning(uint64 endsAt);
  error CanStart();
  error NothingToWithdraw();
  error TransferFailed();

  // --- Events ---
  event Opened(
    uint256 indexed id,
    address indexed creator,
    string name,
    uint128 stake,
    uint64 startsAt,
    uint32 periodSecs,
    uint8 periods
  );
  event Joined(uint256 indexed id, address indexed player, uint8 players);
  event CheckedIn(uint256 indexed id, address indexed player, uint8 period);
  event KnockedOut(uint256 indexed id, address indexed player, uint8 firstMissedPeriod);
  event Finished(uint256 indexed id, uint8 survivors, uint256 share);
  event Cancelled(uint256 indexed id);
  event Withdrawn(address indexed to, uint256 amount);

  // --- External Functions ---

  /**
   * @notice Open a new tontine game and take seat 1.
   */
  function open(
    string calldata name,
    uint128 stake,
    uint64 startsAt,
    uint32 periodSecs,
    uint8 periods
  ) external payable nonReentrant returns (uint256 id) {
    bytes memory nameBytes = bytes(name);
    if (nameBytes.length == 0 || nameBytes.length > MAX_NAME_BYTES) revert BadParams();
    if (stake < MIN_STAKE || stake > MAX_STAKE) revert BadParams();
    if (startsAt < block.timestamp + MIN_LEAD || startsAt > block.timestamp + MAX_LEAD) revert BadParams();
    if (periodSecs < MIN_PERIOD || periodSecs > MAX_PERIOD) revert BadParams();
    if (periods < MIN_PERIODS || periods > MAX_PERIODS) revert BadParams();
    if (msg.value != stake) revert WrongPayment(stake);

    id = ++gameCount;
    Game storage g = _games[id];
    g.creator = msg.sender;
    g.startsAt = startsAt;
    g.periodSecs = periodSecs;
    g.periods = periods;
    g.players = 1;
    g.alive = 1;
    g.state = State.Open;
    g.stake = stake;
    g.name = name;

    _players[id].push(msg.sender);
    _seats[id][msg.sender] = Seat({done: 0, inGame: true, out: false});

    emit Opened(id, msg.sender, name, stake, startsAt, periodSecs, periods);
    emit Joined(id, msg.sender, 1);
  }

  /**
   * @notice Join an open game before startsAt by depositing the matching stake.
   */
  function join(uint256 id) external payable nonReentrant {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    if (g.state != State.Open || block.timestamp >= g.startsAt) revert TooLate();
    if (_seats[id][msg.sender].inGame) revert AlreadyIn();
    if (g.players >= MAX_PLAYERS) revert Full();
    if (msg.value != g.stake) revert WrongPayment(g.stake);

    g.players += 1;
    g.alive += 1;
    _players[id].push(msg.sender);
    _seats[id][msg.sender] = Seat({done: 0, inGame: true, out: false});

    emit Joined(id, msg.sender, g.players);
  }

  /**
   * @notice Check in for the current period index.
   */
  function checkIn(uint256 id) external nonReentrant {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    // Ensure game is running and within game bounds
    _ensureRunning(g);

    uint64 endsAt = g.startsAt + uint64(g.periods) * uint64(g.periodSecs);
    if (block.timestamp < g.startsAt || block.timestamp >= endsAt) revert NotRunning();

    Seat storage s = _seats[id][msg.sender];
    if (!s.inGame || s.out) revert NotInGame();

    uint8 c = uint8((block.timestamp - g.startsAt) / g.periodSecs);
    if ((s.done & (uint64(1) << c)) != 0) revert AlreadyCheckedIn(c);

    s.done |= (uint64(1) << c);

    emit CheckedIn(id, msg.sender, c);
  }

  /**
   * @notice Knock out a player who missed any completed period. Anyone may call this.
   */
  function knockOut(uint256 id, address who) external nonReentrant {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    _ensureRunning(g);

    Seat storage s = _seats[id][who];
    if (!s.inGame || s.out) revert NotInGame();
    if (g.alive <= 1) revert LastOneStanding();

    uint8 c;
    if (block.timestamp < g.startsAt) {
      c = 0;
    } else {
      uint256 elapsedPeriods = (block.timestamp - g.startsAt) / g.periodSecs;
      c = elapsedPeriods > g.periods ? g.periods : uint8(elapsedPeriods);
    }

    uint64 mask = (uint64(1) << c) - 1;
    if ((s.done & mask) == mask) revert NotMissed();

    // Find first missed period
    uint8 firstMissed = 0;
    for (uint8 p = 0; p < c; p++) {
      if ((s.done & (uint64(1) << p)) == 0) {
        firstMissed = p;
        break;
      }
    }

    s.out = true;
    g.alive -= 1;

    emit KnockedOut(id, who, firstMissed);
  }

  /**
   * @notice Finish the game when alive == 1 or now >= endsAt, splitting pot among survivors.
   */
  function finish(uint256 id) external nonReentrant {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    _ensureRunning(g);

    uint64 endsAt = g.startsAt + uint64(g.periods) * uint64(g.periodSecs);
    if (g.alive > 1 && block.timestamp < endsAt) revert StillRunning(endsAt);

    address[] storage playerList = _players[id];
    uint256 totalPlayers = playerList.length;

    uint64 fullMask = (uint64(1) << g.periods) - 1;

    // First scan: count perfect attendance among not-out
    address[] memory survivors = new address[](totalPlayers);
    uint8 survCount = 0;

    if (block.timestamp >= endsAt) {
      for (uint256 i = 0; i < totalPlayers; i++) {
        address p = playerList[i];
        Seat storage s = _seats[id][p];
        if (!s.out && s.done == fullMask) {
          survivors[survCount++] = p;
        }
      }
    }

    // Fallback: if nobody completed fullMask or alive == 1, share among all seated not out
    if (survCount == 0) {
      for (uint256 i = 0; i < totalPlayers; i++) {
        address p = playerList[i];
        Seat storage s = _seats[id][p];
        if (!s.out) {
          survivors[survCount++] = p;
        }
      }
    }

    // Payout distribution
    uint256 pot = uint256(g.stake) * uint256(g.players);
    if (survCount > 0) {
      uint256 share = pot / survCount;
      uint256 rem = pot % survCount;

      for (uint8 i = 0; i < survCount; i++) {
        pending[survivors[i]] += share;
      }
      if (rem > 0) {
        pending[survivors[0]] += rem;
      }
    }

    g.state = State.Finished;
    emit Finished(id, survCount, survCount > 0 ? (pot / survCount) : 0);
  }

  /**
   * @notice Cancel game if startsAt passed and fewer than 2 players joined.
   */
  function cancel(uint256 id) external nonReentrant {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    if (g.state != State.Open || block.timestamp < g.startsAt) revert CanStart();
    if (g.players >= 2) revert CanStart();

    g.state = State.Cancelled;

    address[] storage playerList = _players[id];
    for (uint256 i = 0; i < playerList.length; i++) {
      pending[playerList[i]] += g.stake;
    }

    emit Cancelled(id);
  }

  /**
   * @notice Pull payment for pending balances.
   */
  function withdraw() external nonReentrant {
    uint256 amt = pending[msg.sender];
    if (amt == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;

    (bool ok, ) = msg.sender.call{value: amt}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amt);
  }

  // --- Helper to handle implicit Running state (§2.2, Spec §2) ---
  function _ensureRunning(Game storage g) internal {
    if (g.state == State.Open) {
      if (block.timestamp >= g.startsAt && g.players >= 2) {
        g.state = State.Running;
      } else {
        revert NotRunning();
      }
    } else if (g.state != State.Running) {
      revert NotRunning();
    }
  }

  // --- Views ---

  function gameOf(uint256 id) external view returns (Game memory) {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    return _games[id];
  }

  function playersOf(uint256 id) external view returns (address[] memory) {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    return _players[id];
  }

  function seatOf(uint256 id, address who) external view returns (Seat memory) {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    return _seats[id][who];
  }

  function standing(uint256 id, uint64 atTime) external view returns (uint8 currentP, uint64 compMask, uint64 endsAt) {
    if (id == 0 || id > gameCount) revert NoSuchGame();
    Game storage g = _games[id];

    endsAt = g.startsAt + uint64(g.periods) * uint64(g.periodSecs);

    if (atTime < g.startsAt) {
      currentP = 0;
      compMask = 0;
    } else if (atTime >= endsAt) {
      currentP = g.periods;
      compMask = (uint64(1) << g.periods) - 1;
    } else {
      currentP = uint8((atTime - g.startsAt) / g.periodSecs);
      compMask = (uint64(1) << currentP) - 1;
    }
  }

  function knockable(uint256 id, address who) external view returns (bool) {
    if (id == 0 || id > gameCount) return false;
    Game storage g = _games[id];

    if (g.state == State.Finished || g.state == State.Cancelled) return false;
    if (g.players < 2 || block.timestamp < g.startsAt) return false;
    if (g.alive <= 1) return false;

    Seat storage s = _seats[id][who];
    if (!s.inGame || s.out) return false;

    uint256 elapsedPeriods = (block.timestamp - g.startsAt) / g.periodSecs;
    uint8 c = elapsedPeriods > g.periods ? g.periods : uint8(elapsedPeriods);

    uint64 mask = (uint64(1) << c) - 1;
    return (s.done & mask) != mask;
  }

  function latest(uint256 offset, uint256 count) external view returns (uint256[] memory ids, Game[] memory list) {
    uint256 total = gameCount;
    if (offset >= total || count == 0) {
      return (new uint256[](0), new Game[](0));
    }

    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }

    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    list = new Game[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 gId = total - offset - i;
      ids[i] = gId;
      list[i] = _games[gId];
    }
  }
}
