// lib/errors.ts - Formats contract and execution errors for Tontine

export function formatTontineError(error: unknown): string {
  if (!error) return "Unknown error occurred.";

  const str = String(error);

  if (str.includes("BadParams")) {
    return "Invalid parameters. Check stake (0.01 - 10,000 BOT), lead time (1 hr - 30 days), and period settings.";
  }
  if (str.includes("WrongPayment")) {
    return "Incorrect BOT payment attached. You must deposit exactly the game's stake.";
  }
  if (str.includes("NoSuchGame")) {
    return "This tontine game does not exist.";
  }
  if (str.includes("TooLate")) {
    return "The game has started. New players can no longer join.";
  }
  if (str.includes("AlreadyIn")) {
    return "You have already taken a seat in this game.";
  }
  if (str.includes("Full")) {
    return "This tontine has reached the maximum of 30 players.";
  }
  if (str.includes("NotRunning")) {
    return "Game is not currently running. Check-ins are only open between start and final period end.";
  }
  if (str.includes("NotInGame")) {
    return "You are not an active player in this game, or have been eliminated.";
  }
  if (str.includes("AlreadyCheckedIn")) {
    const match = str.match(/AlreadyCheckedIn\((\d+)\)/);
    const p = match ? Number(match[1]) + 1 : "this";
    return `You already checked in for period ${p}.`;
  }
  if (str.includes("LastOneStanding")) {
    return "One player must remain. The final survivor cannot be knocked out.";
  }
  if (str.includes("NotMissed")) {
    return "That player is up to date and has not missed any completed periods.";
  }
  if (str.includes("StillRunning")) {
    return "The tontine is still in progress. Finish can only be called when 1 survivor remains or after the final period.";
  }
  if (str.includes("CanStart")) {
    return "The game cannot be cancelled because sufficient players joined or the start time has not yet arrived.";
  }
  if (str.includes("NothingToWithdraw")) {
    return "You have no pending balance to withdraw.";
  }
  if (str.includes("TransferFailed")) {
    return "BOT transfer failed during withdrawal.";
  }
  if (str.includes("User rejected") || str.includes("User denied")) {
    return "Transaction was cancelled in wallet.";
  }

  return "Transaction failed. Please check the contract rules and retry.";
}
